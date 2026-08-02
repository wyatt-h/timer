// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createBareDatabase,
  createMigratedDatabase,
  migrationFiles,
  newUuid,
  one,
  readMigration,
  rows,
  type TestDatabase,
} from "@/test/pg";

/*
 * The migrations, executed against a real PostgreSQL instance rather than read as
 * text. Everything asserted here is asserted about a database that has actually
 * been built by the files in `supabase/migrations`.
 *
 * These tests are the reason the teamless schema can be claimed rather than
 * hoped for: if a team table, column, enum or function survived, the queries
 * below would find it.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createMigratedDatabase();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

const CONTROLLER_MIGRATION = "20260731010000_event_controller_auth.sql";
const ACCESS_MIGRATION = "20260801000000_simplify_event_access.sql";
const INVITE_MIGRATION = "20260801010000_event_invites.sql";
const LOGIN_NAME_MIGRATION = "20260801020000_separate_event_login_name.sql";
const REUSABLE_INVITE_MIGRATION = "20260801030000_reusable_event_invites.sql";
const LOGIN_NAME_SLUG_MIGRATION = "20260801040000_slug_event_login_names.sql";
const VALIDATOR = fileURLToPath(
  new URL("../../supabase/validate_event_controller_database.sql", import.meta.url),
);

describe("the complete migration history", () => {
  it("applies to an empty database in filename order", async () => {
    // `createMigratedDatabase` already applied every file and throws on the
    // first failure, so reaching this point is the assertion. Named explicitly
    // because it is the check that guards against an unrunnable migration.
    const files = migrationFiles();
    expect(files.at(-1)).toBe(LOGIN_NAME_SLUG_MIGRATION);
    expect(files).toEqual([...files].sort());

    const tables = await rows<{ table_name: string }>(
      db,
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       order by table_name`,
    );
    expect(tables.map((row) => row.table_name)).toEqual([
      "agenda_items",
      "event_access",
      "event_auth_attempts",
      "event_invites",
      "event_runtime",
      "event_sessions",
      "events",
      "speakers",
    ]);
  });

  it("applies a second time from scratch, so the order is not accidental", async () => {
    const second = await createMigratedDatabase();
    const found = await one<{ count: number }>(
      second,
      `select count(*)::int as count from information_schema.tables
       where table_schema = 'public' and table_name = 'event_access'`,
    );
    expect(found?.count).toBe(1);
    await second.close();
  }, 120_000);

  it("passes the same comprehensive validator used in the Supabase SQL editor", async () => {
    await db.exec(`
      create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (version text primary key);
      insert into supabase_migrations.schema_migrations (version)
      values ('20260801040000') on conflict do nothing;
    `);
    const report = await rows<{ area: string; status: string; details: string }>(
      db,
      readFileSync(VALIDATOR, "utf8"),
    );
    expect(report[0]).toMatchObject({ area: "SUMMARY", status: "PASS" });
    expect(report.filter((row) => row.status === "FAIL")).toEqual([]);
  });

  it("is one transaction, so a failure leaves nothing behind", () => {
    const sql = readMigration(CONTROLLER_MIGRATION);
    // A leading comment block explains the file, so this looks for the
    // statements rather than the first characters.
    expect(sql).toMatch(/^begin;$/m);
    expect(sql.trimEnd()).toMatch(/^commit;$/m);
    const firstStatement = sql.search(/^\s*(create|alter|drop|do|revoke|grant)\b/im);
    expect(sql.search(/^begin;$/m)).toBeLessThan(firstStatement);
    // A broad cascade could take the public readers with it.
    expect(sql).not.toMatch(/drop\s+(table|function|type)[^;]*cascade/i);
  });
});

describe("teams are gone from the final schema", () => {
  it("has no teams or team_members table", async () => {
    const found = await rows(
      db,
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name in ('teams', 'team_members')`,
    );
    expect(found).toEqual([]);
  });

  it("has no team_role enum, and keeps the three enums still in use", async () => {
    const enums = await rows<{ typname: string }>(
      db,
      `select typname from pg_type t
       join pg_namespace n on n.oid = t.typnamespace
       where n.nspname = 'public' and t.typtype = 'e'
       order by typname`,
    );
    expect(enums.map((row) => row.typname)).toEqual([
      "agenda_kind",
      "event_status",
      "timer_status",
    ]);
  });

  it("has no team_id or created_by on events, and no updated_by on runtime", async () => {
    const eventColumns = await rows<{ column_name: string }>(
      db,
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'events'
       order by column_name`,
    );
    expect(eventColumns.map((row) => row.column_name)).toEqual([
      "created_at",
      "event_date",
      "id",
      "name",
      "status",
      "updated_at",
      "version",
      "viewer_token",
      "zoom_token",
    ]);

    const runtimeColumns = await rows<{ column_name: string }>(
      db,
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'event_runtime'`,
    );
    expect(runtimeColumns.map((row) => row.column_name)).not.toContain("updated_by");
  });

  it("has no team membership functions or owner trigger", async () => {
    const functions = await rows(
      db,
      `select proname from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and proname in ('add_team_owner', 'is_team_member', 'is_team_owner')`,
    );
    expect(functions).toEqual([]);

    const triggers = await rows(
      db,
      `select tgname from pg_trigger where not tgisinternal and tgname like '%team%'`,
    );
    expect(triggers).toEqual([]);
  });

  it("has no foreign key left pointing at a team or an auth user", async () => {
    const foreignKeys = await rows<{ table_name: string; references: string }>(
      db,
      `select cl.relname as table_name, ref.relname as "references"
       from pg_constraint con
       join pg_class cl on cl.oid = con.conrelid
       join pg_class ref on ref.oid = con.confrelid
       join pg_namespace n on n.oid = cl.relnamespace
       where n.nspname = 'public' and con.contype = 'f'
       order by 1, 2`,
    );
    // Only the event ownership chain remains.
    expect(foreignKeys).toEqual([
      { table_name: "agenda_items", references: "events" },
      { table_name: "event_access", references: "events" },
      { table_name: "event_invites", references: "events" },
      { table_name: "event_runtime", references: "events" },
      { table_name: "event_sessions", references: "events" },
      { table_name: "speakers", references: "agenda_items" },
    ]);
  });

  it("has no team-related index or policy", async () => {
    const indexes = await rows(
      db,
      `select indexname from pg_indexes where schemaname = 'public' and indexdef like '%team%'`,
    );
    expect(indexes).toEqual([]);

    const policies = await rows(db, `select policyname from pg_policies where schemaname = 'public'`);
    // Every policy was membership-based, so none survive; RLS with no policy is
    // what makes the tables unreadable to anon and authenticated.
    expect(policies).toEqual([]);
  });

  it("does not mention a team in any payload the database returns", async () => {
    const readers = await rows<{ prosrc: string }>(
      db,
      `select prosrc from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and proname in ('public_event_payload', 'controller_event_payload',
                         'get_public_event', 'get_zoom_event')`,
    );
    expect(readers).toHaveLength(4);
    for (const reader of readers) {
      expect(reader.prosrc).not.toMatch(/team/i);
    }
  });
});

describe("row level security", () => {
  it("keeps RLS enabled on every event table", async () => {
    const tables = await rows<{ relname: string; relrowsecurity: boolean }>(
      db,
      `select relname, relrowsecurity from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
       order by relname`,
    );
    for (const table of tables) {
      expect(table.relrowsecurity, table.relname).toBe(true);
    }
  });

  it("gives anon and authenticated no access to credential or session rows", async () => {
    const grants = await rows(
      db,
      `select grantee, table_name, privilege_type
       from information_schema.role_table_grants
       where table_schema = 'public'
         and table_name in ('event_access', 'event_sessions', 'event_auth_attempts', 'event_invites')
         and grantee in ('anon', 'authenticated', 'PUBLIC')`,
    );
    // Supabase's default privileges granted these; the migration revoked them.
    expect(grants).toEqual([]);
  });

  it("gives service_role full access to the credential and session rows", async () => {
    const grants = await rows<{ table_name: string; privilege_type: string }>(
      db,
      `select table_name, privilege_type
       from information_schema.role_table_grants
       where table_schema = 'public'
         and table_name in ('event_access', 'event_sessions', 'event_auth_attempts', 'event_invites')
         and grantee = 'service_role'
       order by table_name, privilege_type`,
    );
    for (const table of ["event_access", "event_auth_attempts", "event_invites", "event_sessions"]) {
      const privileges = grants
        .filter((row) => row.table_name === table)
        .map((row) => row.privilege_type);
      // At least the four the migration grants explicitly. Supabase's default
      // privileges may add TRUNCATE, REFERENCES and TRIGGER on top, which are
      // harmless for a role that already bypasses RLS.
      expect(privileges, table).toEqual(
        expect.arrayContaining(["DELETE", "INSERT", "SELECT", "UPDATE"]),
      );
    }
  });

  it("keeps the public readers callable by anon and the payload helper private", async () => {
    const check = async (signature: string, role: string) => {
      const row = await one<{ allowed: boolean }>(
        db,
        `select has_function_privilege($1, $2, 'execute') as allowed`,
        [role, signature],
      );
      return row?.allowed;
    };

    expect(await check("public.get_public_event(uuid)", "anon")).toBe(true);
    expect(await check("public.get_public_event(uuid)", "authenticated")).toBe(true);
    expect(await check("public.get_zoom_event(text)", "anon")).toBe(true);
    expect(await check("public.get_zoom_event(text)", "authenticated")).toBe(true);
    expect(await check("public.public_event_payload(uuid)", "anon")).toBe(false);
    expect(await check("public.public_event_payload(uuid)", "authenticated")).toBe(false);
  });

  it("makes every controller writer callable by service_role alone", async () => {
    const signatures = [
      "public.create_controller_event(jsonb, text, text, text, integer)",
      "public.replace_controller_event(uuid, bigint, jsonb)",
      "public.delete_controller_event(uuid)",
      "public.controller_event_payload(uuid)",
      "public.change_controller_password(uuid, integer, text, text, integer)",
      "public.touch_event_session(text, integer)",
      "public.register_event_auth_attempt(text, text, text, integer, integer)",
      "public.clear_event_auth_attempts(text, text, text)",
      "public.create_event_invite(uuid, text, integer)",
      "public.redeem_event_invite(text, text, integer)",
      "public.revoke_event_invite(uuid, uuid)",
    ];

    for (const signature of signatures) {
      const row = await one<{ svc: boolean; anon: boolean; auth: boolean }>(
        db,
        `select has_function_privilege('service_role', $1, 'execute') as svc,
                has_function_privilege('anon', $1, 'execute') as anon,
                has_function_privilege('authenticated', $1, 'execute') as auth`,
        [signature],
      );
      expect(row?.svc, `service_role ${signature}`).toBe(true);
      expect(row?.anon, `anon ${signature}`).toBe(false);
      expect(row?.auth, `authenticated ${signature}`).toBe(false);
    }
  });

  it("pins search_path on every security definer function it adds", async () => {
    const functions = await rows<{ proname: string; proconfig: string[] | null }>(
      db,
      `select proname, proconfig from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
       order by proname`,
    );
    expect(functions.length).toBeGreaterThan(0);
    for (const fn of functions) {
      expect(fn.proconfig?.join(","), fn.proname).toContain("search_path=public");
    }
  });
});

describe("existing-row safety", () => {
  it("refuses to run when legacy team-owned events exist, and destroys nothing", async () => {
    const legacy = await createBareDatabase();
    for (const file of migrationFiles().filter((name) => ![
      CONTROLLER_MIGRATION,
      ACCESS_MIGRATION,
      INVITE_MIGRATION,
      LOGIN_NAME_MIGRATION,
      REUSABLE_INVITE_MIGRATION,
      LOGIN_NAME_SLUG_MIGRATION,
    ].includes(name))) {
      await legacy.exec(readMigration(file));
    }

    // A team-owned event, exactly as the old schema created them.
    await legacy.exec(`
      insert into auth.users (id) values ('11111111-1111-4111-8111-111111111111');
      insert into public.teams (slug, name, created_by)
      values ('legacy', 'legacy', '11111111-1111-4111-8111-111111111111');
      insert into public.events (team_id, name, created_by)
      select id, 'A legacy event', '11111111-1111-4111-8111-111111111111'
      from public.teams where slug = 'legacy';
    `);

    await expect(legacy.exec(readMigration(CONTROLLER_MIGRATION))).rejects.toThrow(
      /Refusing to migrate/,
    );
    // The failed `begin;` block is still open on this connection; ending it is
    // what a client driver does on error.
    await legacy.exec("rollback;");

    // The whole migration is one transaction, so the refusal left the old schema
    // and the event untouched rather than half-converted.
    const surviving = await one<{ count: number }>(
      legacy,
      `select count(*)::int as count from public.events`,
    );
    expect(surviving?.count).toBe(1);
    const teams = await one<{ count: number }>(
      legacy,
      `select count(*)::int as count from public.teams`,
    );
    expect(teams?.count).toBe(1);
    // event_access was never created, so nothing was partially applied.
    const applied = await one<{ count: number }>(
      legacy,
      `select count(*)::int as count from information_schema.tables
       where table_schema = 'public' and table_name = 'event_access'`,
    );
    expect(applied?.count).toBe(0);

    await legacy.close();
  }, 120_000);

  it("runs once the operator has explicitly cleared the legacy rows", async () => {
    const legacy = await createBareDatabase();
    for (const file of migrationFiles().filter((name) => ![
      CONTROLLER_MIGRATION,
      ACCESS_MIGRATION,
      INVITE_MIGRATION,
      LOGIN_NAME_MIGRATION,
      REUSABLE_INVITE_MIGRATION,
      LOGIN_NAME_SLUG_MIGRATION,
    ].includes(name))) {
      await legacy.exec(readMigration(file));
    }
    await legacy.exec(`
      insert into auth.users (id) values ('22222222-2222-4222-8222-222222222222');
      insert into public.teams (slug, name, created_by)
      values ('legacy', 'legacy', '22222222-2222-4222-8222-222222222222');
      insert into public.events (team_id, name, created_by)
      select id, 'A legacy event', '22222222-2222-4222-8222-222222222222'
      from public.teams where slug = 'legacy';
    `);

    // The explicit decision the runbook asks for.
    await legacy.exec(`delete from public.events;`);
    await legacy.exec(readMigration(CONTROLLER_MIGRATION));

    const teams = await one<{ count: number }>(
      legacy,
      `select count(*)::int as count from information_schema.tables
       where table_schema = 'public' and table_name = 'teams'`,
    );
    expect(teams?.count).toBe(0);
    await legacy.close();
  }, 120_000);
});

describe("controller event functions", () => {
  /** Mirrors what the create route sends. */
  async function eventDocument(overrides: Record<string, unknown> = {}) {
    const [id, viewerToken, agendaId, speakerId] = await Promise.all([
      newUuid(db),
      newUuid(db),
      newUuid(db),
      newUuid(db),
    ]);
    return {
      id,
      name: "Leadership Summit",
      date: "2026-08-01",
      status: "draft",
      viewerToken,
      zoomToken: null,
      agenda: [
        {
          id: agendaId,
          kind: "single",
          durationSeconds: 600,
          speakerDefaultSeconds: null,
          host: null,
          soundMuted: null,
          speakers: [
            { id: speakerId, name: "Maya Chen", durationSeconds: 600, soundMuted: null },
          ],
        },
      ],
      runtime: {
        status: "ready",
        segmentIndex: 0,
        remainingSeconds: 600,
        endsAt: null,
        panelStatus: null,
        panelRemainingSeconds: null,
        panelEndsAt: null,
        soundEnabled: true,
      },
      ...overrides,
    };
  }

  async function create(
    eventName: string,
    overrides: Record<string, unknown> = {},
    loginName = eventName,
  ) {
    const document = await eventDocument({ name: eventName, ...overrides });
    const result = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.create_controller_event($1::jsonb, $2, $3, $4, $5) as result`,
      [
        JSON.stringify(document),
        loginName,
        "scrypt$fake-password-hash",
        // A distinct 64-character digest per event, as a real token hash is.
        (await newUuid(db)).replace(/-/g, "").padEnd(64, "0"),
        3600,
      ],
    );
    return { document, result: result!.result };
  }

  it("creates an event, its credentials, children and first session in one call", async () => {
    const { document, result } = await create("summit-one");

    expect(result.status).toBe("created");
    const payload = result.payload as Record<string, unknown>;
    expect(Number(payload.version)).toBe(0);
    expect(payload.loginName).toBe("summit-one");
    // No team anywhere in the controller payload. jsonb orders keys by length,
    // so this compares the set rather than the sequence.
    expect(Object.keys(payload).sort()).toEqual(["event", "loginName", "version"]);
    expect(JSON.stringify(payload)).not.toMatch(/team/i);

    const stored = await one<{ name: string; version: string }>(
      db,
      `select name, version from public.events where id = $1`,
      [document.id],
    );
    expect(stored?.name).toBe("summit-one");

    const access = await one<{ password_version: number }>(
      db,
      `select password_version from public.event_access where event_id = $1`,
      [document.id],
    );
    expect(access?.password_version).toBe(1);

    const session = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_sessions where event_id = $1`,
      [document.id],
    );
    expect(session?.count).toBe(1);

    const runtime = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_runtime where event_id = $1`,
      [document.id],
    );
    expect(runtime?.count).toBe(1);

    const speakers = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.speakers`,
    );
    expect(speakers?.count).toBeGreaterThan(0);
  });

  it("refuses a duplicate login name without writing anything", async () => {
    await create("First display name", {}, "summit-duplicate");
    const before = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.events`,
    );

    const { result } = await create("Different display name", {}, "SUMMIT-DUPLICATE");
    expect(result.status).toBe("login_taken");

    const after = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.events`,
    );
    expect(after?.count).toBe(before?.count);
  });

  it("enforces slug-shaped login names on newly inserted credentials", async () => {
    await expect(create("A display name", {}, "bad_name")).rejects.toThrow(
      /event_access_login_name_slug_check/,
    );
  });

  it("increments the version on a matching write and refuses a stale one", async () => {
    const { document } = await create("summit-version");

    const updated = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.replace_controller_event($1, $2, $3::jsonb) as result`,
      [document.id, 0, JSON.stringify({ ...document, name: "Renamed" })],
    );
    expect(updated?.result.status).toBe("updated");
    expect(Number((updated?.result.payload as Record<string, unknown>).version)).toBe(1);
    expect((updated?.result.payload as Record<string, unknown>).loginName).toBe("summit-version");

    // A second device still believing it is at version 0.
    const stale = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.replace_controller_event($1, $2, $3::jsonb) as result`,
      [document.id, 0, JSON.stringify({ ...document, name: "Overwritten" })],
    );
    expect(stale?.result.status).toBe("conflict");

    const stored = await one<{ name: string }>(
      db,
      `select name from public.events where id = $1`,
      [document.id],
    );
    // The newer write survived; the stale one changed nothing.
    expect(stored?.name).toBe("Renamed");
  });

  it("stores negative remaining seconds so overtime survives a save", async () => {
    const { document } = await create("summit-overtime");
    const overtime = {
      ...document,
      runtime: {
        ...(document.runtime as Record<string, unknown>),
        status: "paused",
        remainingSeconds: -42.5,
        panelRemainingSeconds: -90,
      },
    };

    const result = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.replace_controller_event($1, $2, $3::jsonb) as result`,
      [document.id, 0, JSON.stringify(overtime)],
    );
    expect(result?.result.status).toBe("updated");

    const stored = await one<{ remaining_seconds: string; panel_remaining_seconds: string }>(
      db,
      `select remaining_seconds, panel_remaining_seconds
       from public.event_runtime where event_id = $1`,
      [document.id],
    );
    expect(Number(stored?.remaining_seconds)).toBe(-42.5);
    expect(Number(stored?.panel_remaining_seconds)).toBe(-90);

    // And it comes back out of the payload the controller reads.
    const payload = await one<{ payload: Record<string, unknown> }>(
      db,
      `select public.controller_event_payload($1) as payload`,
      [document.id],
    );
    const runtime = (payload?.payload.event as Record<string, Record<string, unknown>>).runtime;
    expect(Number(runtime.remainingSeconds)).toBe(-42.5);
  });

  it("still rejects a nonsensical remaining value", async () => {
    const { document } = await create("summit-nonsense");
    await expect(
      db.query(`select public.replace_controller_event($1, $2, $3::jsonb)`, [
        document.id,
        0,
        JSON.stringify({
          ...document,
          runtime: { ...(document.runtime as Record<string, unknown>), remainingSeconds: -999999 },
        }),
      ]),
    ).rejects.toThrow(/remaining_seconds/);
  });

  it("keeps a Zoom pairing code once minted", async () => {
    const { document } = await create("summit-zoom");
    await db.query(`select public.replace_controller_event($1, $2, $3::jsonb)`, [
      document.id,
      0,
      JSON.stringify({ ...document, zoomToken: "ABCDE12345" }),
    ]);
    await db.query(`select public.replace_controller_event($1, $2, $3::jsonb)`, [
      document.id,
      1,
      JSON.stringify({ ...document, zoomToken: "ZZZZZ99999" }),
    ]);

    const stored = await one<{ zoom_token: string }>(
      db,
      `select zoom_token from public.events where id = $1`,
      [document.id],
    );
    expect(stored?.zoom_token).toBe("ABCDE12345");
  });

  it("serves a teamless event to the audience and Zoom readers", async () => {
    const { document } = await create("summit-public");
    await db.query(`select public.replace_controller_event($1, $2, $3::jsonb)`, [
      document.id,
      0,
      JSON.stringify({ ...document, status: "live", zoomToken: "PUBLIC1234" }),
    ]);

    const audience = await one<{ payload: Record<string, unknown> }>(
      db,
      `select public.get_public_event($1) as payload`,
      [document.viewerToken],
    );
    expect(audience?.payload).toBeTruthy();
    const audienceEvent = audience!.payload.event as Record<string, unknown>;
    expect(audienceEvent.name).toBe("summit-public");
    // No team key, and no team value smuggled in under another name.
    expect(Object.keys(audience!.payload)).toEqual(["event"]);
    expect(JSON.stringify(audience!.payload)).not.toMatch(/team/i);

    const zoom = await one<{ payload: Record<string, unknown> }>(
      db,
      `select public.get_zoom_event($1) as payload`,
      ["public1234"],
    );
    // Lower case is accepted, as the pairing code is upper-cased on lookup.
    expect(zoom?.payload).toBeTruthy();
    expect((zoom!.payload.event as Record<string, unknown>).id).toBe(document.id);
  });

  it("deletes an event and everything hanging off it", async () => {
    const { document } = await create("summit-delete");

    const result = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.delete_controller_event($1) as result`,
      [document.id],
    );
    expect(result?.result.status).toBe("deleted");

    for (const table of ["events", "event_access", "event_sessions", "agenda_items", "event_runtime"]) {
      const remaining = await one<{ count: number }>(
        db,
        `select count(*)::int as count from public.${table}
         where ${table === "events" ? "id" : "event_id"} = $1`,
        [document.id],
      );
      expect(remaining?.count, table).toBe(0);
    }

    const again = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.delete_controller_event($1) as result`,
      [document.id],
    );
    expect(again?.result.status).toBe("not_found");
  });

  it("frees the login name when the event is deleted", async () => {
    const { document } = await create("summit-reusable");
    await db.query(`select public.delete_controller_event($1)`, [document.id]);
    const { result } = await create("summit-reusable");
    expect(result.status).toBe("created");
  });
});

describe("credential mutations are transactional", () => {
  async function seed(eventName: string) {
    const [id, viewerToken, agendaId, speakerId] = await Promise.all([
      newUuid(db),
      newUuid(db),
      newUuid(db),
      newUuid(db),
    ]);
    const document = {
      id,
      name: eventName,
      date: "2026-08-01",
      status: "draft",
      viewerToken,
      zoomToken: null,
      agenda: [
        {
          id: agendaId,
          kind: "single",
          durationSeconds: 600,
          speakers: [{ id: speakerId, name: "S", durationSeconds: 600 }],
        },
      ],
      runtime: { status: "ready", segmentIndex: 0, remainingSeconds: 600, soundEnabled: true },
    };
    await db.query(
      `select public.create_controller_event($1::jsonb, $2, $3, $4, $5)`,
      [
        JSON.stringify(document),
        eventName,
        "scrypt$old-password",
        (await newUuid(db)).replace(/-/g, "").padEnd(64, "0"),
        3600,
      ],
    );
    return id;
  }

  it("changes a password, retires every old session and issues one replacement", async () => {
    const eventId = await seed("cred-change");
    await db.query(`select public.create_event_invite($1, $2, 86400)`, [
      eventId,
      "7".repeat(64),
    ]);
    // A second device signs in as well.
    await db.query(`select public.issue_event_session($1, $2, 1, 3600)`, [
      eventId,
      (await newUuid(db)).replace(/-/g, "").padEnd(64, "1"),
    ]);
    const before = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_sessions where event_id = $1`,
      [eventId],
    );
    expect(before?.count).toBe(2);

    const result = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.change_controller_password($1, 1, $2, $3, 3600) as result`,
      [eventId, "scrypt$new-password", "d".repeat(64)],
    );
    expect(result?.result.status).toBe("changed");
    expect(result?.result.passwordVersion).toBe(2);

    const access = await one<{ password_hash: string; password_version: number }>(
      db,
      `select password_hash, password_version from public.event_access where event_id = $1`,
      [eventId],
    );
    expect(access?.password_hash).toBe("scrypt$new-password");
    expect(access?.password_version).toBe(2);

    // Exactly one session: the replacement, at the new version.
    const sessions = await rows<{ token_hash: string; password_version: number }>(
      db,
      `select token_hash, password_version from public.event_sessions where event_id = $1`,
      [eventId],
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].token_hash).toBe("d".repeat(64));
    expect(sessions[0].password_version).toBe(2);
    expect((await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_invites where event_id = $1`,
      [eventId],
    ))?.count).toBe(0);
  });

  it("refuses a password change against a stale version and changes nothing", async () => {
    const eventId = await seed("cred-stale");
    const result = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.change_controller_password($1, 99, $2, $3, 3600) as result`,
      [eventId, "scrypt$should-not-apply", "e".repeat(64)],
    );
    expect(result?.result.status).toBe("version_mismatch");

    const access = await one<{ password_hash: string; password_version: number }>(
      db,
      `select password_hash, password_version from public.event_access where event_id = $1`,
      [eventId],
    );
    expect(access?.password_hash).toBe("scrypt$old-password");
    expect(access?.password_version).toBe(1);
    // The original session is still trusted, because nothing happened.
    const sessions = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_sessions where event_id = $1`,
      [eventId],
    );
    expect(sessions?.count).toBe(1);
  });

  it("removes recovery credentials and functions from the final schema", async () => {
    const column = await one<{ present: string | null }>(
      db,
      `select to_regclass('public.event_access')::text as present
       where not exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'event_access'
           and column_name = 'recovery_code_hash'
       )`,
    );
    expect(column?.present).toBe("event_access");

    const functions = await rows<{ proname: string }>(
      db,
      `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and proname in (
         'recover_controller_password', 'rotate_controller_recovery_code'
       )`,
    );
    expect(functions).toEqual([]);
  });

  it("reports a missing event rather than silently doing nothing", async () => {
    const ghost = await newUuid(db);

    const changed = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.change_controller_password($1, 1, 'h', $2, 3600) as result`,
      [ghost, "9".repeat(64)],
    );
    expect(changed?.result.status).toBe("not_found");

  });
});

describe("sessions", () => {
  async function seed(eventName: string, tokenHash: string, ttlSeconds = 3600) {
    const [id, viewerToken, agendaId, speakerId] = await Promise.all([
      newUuid(db),
      newUuid(db),
      newUuid(db),
      newUuid(db),
    ]);
    await db.query(`select public.create_controller_event($1::jsonb, $2, $3, $4, $5)`, [
      JSON.stringify({
        id,
        name: eventName,
        date: "2026-08-01",
        status: "draft",
        viewerToken,
        agenda: [
          {
            id: agendaId,
            kind: "single",
            durationSeconds: 600,
            speakers: [{ id: speakerId, name: "S", durationSeconds: 600 }],
          },
        ],
        runtime: { status: "ready", segmentIndex: 0, remainingSeconds: 600 },
      }),
      eventName.toLowerCase().replace(/\s+/gu, "-"),
      "scrypt$p",
      tokenHash,
      ttlSeconds,
    ]);
    return id;
  }

  it("validates a live token and reports the event it belongs to", async () => {
    const token = "1".repeat(64);
    const eventId = await seed("session-live", token);

    const result = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.touch_event_session($1, 3600) as result`,
      [token],
    );
    expect(result?.result.status).toBe("valid");
    expect(result?.result.eventId).toBe(eventId);
  });

  it("rejects an unknown token", async () => {
    const result = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.touch_event_session($1, 3600) as result`,
      ["2".repeat(64)],
    );
    expect(result?.result.status).toBe("invalid");
  });

  it("rejects and removes a session issued against an older password", async () => {
    const token = "3".repeat(64);
    const eventId = await seed("session-retired", token);
    await db.query(`select public.change_controller_password($1, 1, 'new', $2, 3600)`, [
      eventId,
      "4".repeat(64),
    ]);
    // The replacement session exists; the original token is now at the old version.
    await db.query(`select public.issue_event_session($1, $2, 1, 3600)`, [eventId, token]);

    const result = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.touch_event_session($1, 3600) as result`,
      [token],
    );
    expect(result?.result.status).toBe("invalid");

    const remaining = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_sessions where token_hash = $1`,
      [token],
    );
    expect(remaining?.count).toBe(0);
  });

  it("expires a session and prunes it on the next check", async () => {
    const token = "5".repeat(64);
    await seed("session-expired", token, -60);

    const result = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.touch_event_session($1, 3600) as result`,
      [token],
    );
    expect(result?.result.status).toBe("invalid");
    const remaining = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_sessions where token_hash = $1`,
      [token],
    );
    expect(remaining?.count).toBe(0);
  });

  it("slides the deadline forward on every use", async () => {
    const token = "6".repeat(64);
    await seed("session-sliding", token, 60);
    const before = await one<{ expires_at: string }>(
      db,
      `select expires_at from public.event_sessions where token_hash = $1`,
      [token],
    );

    await db.query(`select public.touch_event_session($1, 86400)`, [token]);

    const after = await one<{ expires_at: string }>(
      db,
      `select expires_at from public.event_sessions where token_hash = $1`,
      [token],
    );
    expect(new Date(after!.expires_at).getTime()).toBeGreaterThan(
      new Date(before!.expires_at).getTime(),
    );
  });
});

describe("reusable event invitations", () => {
  async function seed(eventName: string) {
    const [id, viewerToken, agendaId, speakerId] = await Promise.all([
      newUuid(db),
      newUuid(db),
      newUuid(db),
      newUuid(db),
    ]);
    await db.query(`select public.create_controller_event($1::jsonb, $2, $3, $4, 3600)`, [
      JSON.stringify({
        id,
        name: eventName,
        date: "2026-08-01",
        status: "draft",
        viewerToken,
        agenda: [{
          id: agendaId,
          kind: "single",
          durationSeconds: 600,
          speakers: [{ id: speakerId, name: "S", durationSeconds: 600 }],
        }],
        runtime: { status: "ready", segmentIndex: 0, remainingSeconds: 600 },
      }),
      eventName.toLowerCase().replace(/\s+/gu, "-"),
      "scrypt$p",
      (await newUuid(db)).replace(/-/g, "").padEnd(64, "0"),
    ]);
    return id;
  }

  it("keeps one outstanding invitation per event", async () => {
    const eventId = await seed("Invite replace");
    const first = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.create_event_invite($1, $2, 86400) as result`,
      [eventId, "a".repeat(64)],
    );
    const second = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.create_event_invite($1, $2, 86400) as result`,
      [eventId, "b".repeat(64)],
    );
    expect(first?.result.status).toBe("created");
    expect(second?.result.status).toBe("created");
    expect(second?.result.inviteId).not.toBe(first?.result.inviteId);
    expect(await rows<{ token_hash: string }>(
      db,
      `select token_hash from public.event_invites where event_id = $1`,
      [eventId],
    )).toEqual([{ token_hash: "b".repeat(64) }]);
  });

  it("keeps a link while issuing an independent session for each recipient", async () => {
    const eventId = await seed("Invite redeem");
    await db.query(`select public.create_event_invite($1, $2, 86400)`, [
      eventId,
      "c".repeat(64),
    ]);
    const recipientToken = (await newUuid(db)).replace(/-/g, "").padEnd(64, "d");
    const redeemed = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.redeem_event_invite($1, $2, 2592000) as result`,
      ["c".repeat(64), recipientToken],
    );
    expect(redeemed?.result.status).toBe("redeemed");
    expect(redeemed?.result.eventId).toBe(eventId);
    expect((redeemed?.result.payload as Record<string, unknown>).event).toBeTruthy();
    expect((await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_invites where event_id = $1`,
      [eventId],
    ))?.count).toBe(1);
    expect((await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_sessions where token_hash = $1`,
      [recipientToken],
    ))?.count).toBe(1);

    const replay = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.redeem_event_invite($1, $2, 2592000) as result`,
      ["c".repeat(64), "e".repeat(64)],
    );
    expect(replay?.result.status).toBe("redeemed");
    expect((await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_sessions where event_id = $1`,
      [eventId],
    ))?.count).toBe(3);
  });

  it("allows two devices to redeem the same live link together", async () => {
    const eventId = await seed("Invite race");
    await db.query(`select public.create_event_invite($1, $2, 86400)`, [
      eventId,
      "f".repeat(64),
    ]);
    const firstToken = (await newUuid(db)).replace(/-/g, "").padEnd(64, "1");
    const secondToken = (await newUuid(db)).replace(/-/g, "").padEnd(64, "2");
    const attempts = await Promise.all([
      one<{ result: Record<string, unknown> }>(
        db,
        `select public.redeem_event_invite($1, $2, 2592000) as result`,
        ["f".repeat(64), firstToken],
      ),
      one<{ result: Record<string, unknown> }>(
        db,
        `select public.redeem_event_invite($1, $2, 2592000) as result`,
        ["f".repeat(64), secondToken],
      ),
    ]);
    expect(attempts.map((attempt) => attempt?.result.status)).toEqual([
      "redeemed",
      "redeemed",
    ]);
  });

  it("revokes only the named invitation for the authorized event", async () => {
    const eventId = await seed("Invite revoke");
    const otherEventId = await seed("Invite revoke other");
    const created = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.create_event_invite($1, $2, 86400) as result`,
      [eventId, "3".repeat(64)],
    );
    const inviteId = created?.result.inviteId;
    const wrongEvent = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.revoke_event_invite($1, $2) as result`,
      [otherEventId, inviteId],
    );
    expect(wrongEvent?.result.status).toBe("not_found");

    const revoked = await one<{ result: Record<string, unknown> }>(
      db,
      `select public.revoke_event_invite($1, $2) as result`,
      [eventId, inviteId],
    );
    expect(revoked?.result.status).toBe("revoked");
  });
});

describe("rate limiting", () => {
  /** Distinct 64-character digests, as the route handler's HMAC produces. */
  const digest = (label: string) => label.padEnd(64, "0").slice(0, 64);

  async function register(
    scope: string,
    identifier: string,
    address: string,
    max = 3,
    window = 900,
  ) {
    const result = await one<{ result: { limited: boolean; retryAfterSeconds: number } }>(
      db,
      `select public.register_event_auth_attempt($1, $2, $3, $4, $5) as result`,
      [scope, identifier, address, window, max],
    );
    return result!.result;
  }

  it("engages after the budget is spent and reports when to retry", async () => {
    const identifier = digest("id-basic");
    const address = digest("addr-basic");
    const statuses: boolean[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      statuses.push((await register("login", identifier, address)).limited);
    }
    expect(statuses).toEqual([false, false, false, true]);

    await db.query(`select public.clear_event_auth_attempts('login', $1, $2)`, [
      identifier,
      address,
    ]);
    expect((await register("login", identifier, address)).limited).toBe(false);
  });

  /*
   * The bug this closes: clearing on `identifier or address` meant a successful
   * sign-in to an event you legitimately own wiped the whole address bucket. An
   * attacker with one event of their own could reset their own rate limit at will
   * and then keep guessing at everybody else's.
   */
  it("clearing one username's attempts does not clear another's from the same address", async () => {
    const address = digest("addr-shared");
    const victim = digest("id-victim");
    const attacker = digest("id-attacker");

    // Three failed guesses against the victim's event, from this address.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await register("login", victim, address);
    }
    expect((await register("login", victim, address)).limited).toBe(true);

    // A successful sign-in to the attacker's own event, from the same address.
    await db.query(`select public.clear_event_auth_attempts('login', $1, $2)`, [
      attacker,
      address,
    ]);

    // The victim's bucket is untouched, so the guessing is still blocked.
    expect((await register("login", victim, address)).limited).toBe(true);
    const survivors = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_auth_attempts
       where scope = 'login' and identifier_hash = $1`,
      [victim],
    );
    expect(survivors?.count).toBeGreaterThan(0);
  });

  it("clearing does not touch the same username's attempts from a different address", async () => {
    const identifier = digest("id-roaming");
    const here = digest("addr-here");
    const elsewhere = digest("addr-elsewhere");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await register("login", identifier, elsewhere);
    }
    // A successful sign-in from a different machine.
    await db.query(`select public.clear_event_auth_attempts('login', $1, $2)`, [
      identifier,
      here,
    ]);

    const remaining = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_auth_attempts
       where scope = 'login' and address_hash = $1`,
      [elsewhere],
    );
    expect(remaining?.count).toBe(3);
  });

  it("clears only the exact pair that succeeded", async () => {
    const identifier = digest("id-pair");
    const address = digest("addr-pair");
    const otherAddress = digest("addr-other");

    await register("login", identifier, address);
    await register("login", identifier, otherAddress);

    await db.query(`select public.clear_event_auth_attempts('login', $1, $2)`, [
      identifier,
      address,
    ]);

    const rest = await rows<{ address_hash: string }>(
      db,
      `select address_hash from public.event_auth_attempts
       where scope = 'login' and identifier_hash = $1`,
      [identifier],
    );
    expect(rest.map((row) => row.address_hash)).toEqual([otherAddress]);
  });

  it("counts an attempt after inserting it, so a burst cannot all pass", async () => {
    const identifier = digest("id-burst");
    const address = digest("addr-burst");

    /*
     * Fired without awaiting in between, which is what a burst of parallel requests
     * looks like from the caller's side. Exactly three may pass: the function takes
     * transaction-scoped advisory locks on both buckets before counting, so each
     * call sees the ones committed before it rather than an empty table.
     */
    const results = await Promise.all(
      Array.from({ length: 20 }, () => register("login", identifier, address)),
    );

    expect(results.filter((result) => !result.limited)).toHaveLength(3);
    expect(results.filter((result) => result.limited)).toHaveLength(17);
  });

  it("takes both bucket locks, in ascending order, before counting", async () => {
    /*
     * The ordering is what makes the locks deadlock-free: two attempts that share
     * one bucket and differ in the other would otherwise be able to take one lock
     * each and wait on the other forever. PGlite runs one connection at a time, so
     * the burst test above cannot demonstrate real contention — this asserts the
     * mechanism is present and correctly ordered.
     */
    const source = await one<{ prosrc: string }>(
      db,
      `select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'register_event_auth_attempt'`,
    );
    const body = source!.prosrc;
    expect(body).toContain("pg_advisory_xact_lock");
    expect(body).toContain("least(");
    expect(body).toContain("greatest(");
    // Locked before the count, or the lock would protect nothing.
    expect(body.indexOf("pg_advisory_xact_lock")).toBeLessThan(body.indexOf("select count(*)"));
  });

  it("keeps separate budgets per scope", async () => {
    const identifier = digest("id-scoped");
    const address = digest("addr-scoped");

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await register("login", identifier, address);
    }
    expect((await register("login", identifier, address)).limited).toBe(true);
    // A different scope is a different budget.
    expect((await register("create", identifier, address)).limited).toBe(false);
  });

  it("refuses removed recovery and rotation scopes", async () => {
    for (const scope of ["recover", "rotate"]) {
      await expect(
        db.query(`select public.register_event_auth_attempt($1, $2, $3, 900, 3)`, [
          scope,
          "c".repeat(64),
          "d".repeat(64),
        ]),
      ).rejects.toThrow(/event_auth_attempts_scope_check|violates/i);
    }
  });

  it("refuses a scope it does not know", async () => {
    await expect(
      db.query(`select public.register_event_auth_attempt('guess', $1, $2, 900, 3)`, [
        "e".repeat(64),
        "f".repeat(64),
      ]),
    ).rejects.toThrow(/event_auth_attempts_scope_check|violates/i);
  });
});

describe("validation limits match the application", () => {
  it("caps an agenda host at 120 characters", async () => {
    const constraint = await one<{ definition: string }>(
      db,
      `select pg_get_constraintdef(oid) as definition from pg_constraint
       where conrelid = 'public.agenda_items'::regclass and contype = 'c'
         and pg_get_constraintdef(oid) like '%host%'`,
    );
    expect(constraint?.definition).toContain("120");
  });

  it("caps an event name at 120 characters", async () => {
    const constraint = await one<{ definition: string }>(
      db,
      `select pg_get_constraintdef(oid) as definition from pg_constraint
       where conrelid = 'public.events'::regclass and contype = 'c'
         and pg_get_constraintdef(oid) like '%name%'`,
    );
    expect(constraint?.definition).toContain("120");
  });

  it("bounds a duration between one second and a day", async () => {
    for (const table of ["agenda_items", "speakers"]) {
      const constraint = await one<{ definition: string }>(
        db,
        `select pg_get_constraintdef(oid) as definition from pg_constraint
         where conrelid = ('public.' || $1)::regclass and contype = 'c'
           and pg_get_constraintdef(oid) like '%duration_seconds%'`,
        [table],
      );
      expect(constraint?.definition, table).toContain("86400");
    }
  });
});
