import type { SupabaseClient } from "@supabase/supabase-js";
import type { TestDatabase } from "@/test/pg";

/*
 * A Supabase-client-shaped adapter over a real PostgreSQL instance.
 *
 * The route handlers talk to `supabaseAdmin()`. Pointing that at this adapter
 * makes their requests land on the actual functions and constraints created by
 * `supabase/migrations`, rather than on a hand-written imitation of them. That
 * matters: a fake can drift from the SQL silently, and the things most worth
 * testing here — the version check, the credential transactions, the CHECK that
 * bounds overtime — live in the SQL itself.
 *
 * Only the surface the handlers actually use is implemented. Anything else throws
 * loudly rather than returning a plausible empty result.
 */

type PostgrestResult = { data: unknown; error: { message: string } | null };

function fail(error: unknown): PostgrestResult {
  return {
    data: null,
    error: { message: error instanceof Error ? error.message : String(error) },
  };
}

/** Mirrors PostgREST's builder: filters accumulate, awaiting runs the statement. */
class Query implements PromiseLike<PostgrestResult> {
  private filters: { column: string; value: unknown }[] = [];

  constructor(private readonly run: (filters: { column: string; value: unknown }[]) => Promise<PostgrestResult>) {}

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  async maybeSingle(): Promise<PostgrestResult> {
    const result = await this.run(this.filters);
    if (result.error) return result;
    const rows = (result.data ?? []) as unknown[];
    return { data: rows[0] ?? null, error: null };
  }

  then<TResult1 = PostgrestResult, TResult2 = never>(
    onFulfilled?: ((value: PostgrestResult) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.run(this.filters).then(onFulfilled, onRejected);
  }
}

function whereClause(filters: { column: string; value: unknown }[], offset = 0) {
  if (!filters.length) return { sql: "", params: [] as unknown[] };
  const parts = filters.map((filter, index) => `"${filter.column}" = $${offset + index + 1}`);
  return { sql: ` where ${parts.join(" and ")}`, params: filters.map((f) => f.value) };
}

export function createPgSupabaseClient(db: TestDatabase): SupabaseClient {
  /* Argument names and types per function, so an object of named args can be
   * ordered and cast exactly as PostgREST would order and cast them. */
  const signatures = new Map<string, { name: string; type: string }[]>();

  async function signatureOf(fn: string) {
    const cached = signatures.get(fn);
    if (cached) return cached;
    const result = await db.query<{ name: string; type: string }>(
      `select p.proargnames[i] as name, format_type(p.proargtypes[i - 1], null) as type
       from pg_proc p, generate_subscripts(p.proargnames, 1) as i
       where p.proname = $1 and p.pronamespace = 'public'::regnamespace
       order by i`,
      [fn],
    );
    if (!result.rows.length) throw new Error(`pg adapter: unknown function public.${fn}`);
    signatures.set(fn, result.rows);
    return result.rows;
  }

  const client = {
    from(table: string) {
      return {
        select(columns = "*") {
          const list =
            columns === "*"
              ? "*"
              : columns
                  .split(",")
                  .map((column) => `"${column.trim()}"`)
                  .join(", ");
          return new Query(async (filters) => {
            const where = whereClause(filters);
            try {
              const result = await db.query(
                `select ${list} from public."${table}"${where.sql}`,
                where.params,
              );
              return { data: result.rows, error: null };
            } catch (error) {
              return fail(error);
            }
          });
        },

        insert(values: Record<string, unknown>) {
          return new Query(async () => {
            const columns = Object.keys(values);
            const placeholders = columns.map((_, index) => `$${index + 1}`);
            try {
              await db.query(
                `insert into public."${table}" (${columns.map((c) => `"${c}"`).join(", ")})
                 values (${placeholders.join(", ")})`,
                Object.values(values),
              );
              return { data: null, error: null };
            } catch (error) {
              return fail(error);
            }
          });
        },

        update(values: Record<string, unknown>) {
          return new Query(async (filters) => {
            const columns = Object.keys(values);
            const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`);
            const where = whereClause(filters, columns.length);
            try {
              await db.query(
                `update public."${table}" set ${assignments.join(", ")}${where.sql}`,
                [...Object.values(values), ...where.params],
              );
              return { data: null, error: null };
            } catch (error) {
              return fail(error);
            }
          });
        },

        delete() {
          return new Query(async (filters) => {
            const where = whereClause(filters);
            try {
              await db.query(`delete from public."${table}"${where.sql}`, where.params);
              return { data: null, error: null };
            } catch (error) {
              return fail(error);
            }
          });
        },
      };
    },

    async rpc(fn: string, args: Record<string, unknown> = {}) {
      try {
        const signature = await signatureOf(fn);
        const params: unknown[] = [];
        const placeholders = signature.map((argument, index) => {
          const value = args[argument.name];
          if (value === undefined) {
            throw new Error(`pg adapter: ${fn} is missing argument ${argument.name}`);
          }
          // jsonb has to arrive as text and be cast, exactly as the driver sends it.
          params.push(argument.type === "jsonb" ? JSON.stringify(value) : value);
          return `$${index + 1}::${argument.type}`;
        });

        const result = await db.query<{ result: unknown }>(
          `select public."${fn}"(${placeholders.join(", ")}) as result`,
          params,
        );
        return { data: result.rows[0]?.result ?? null, error: null };
      } catch (error) {
        return fail(error);
      }
    },
  };

  return client as unknown as SupabaseClient;
}
