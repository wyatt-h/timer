import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { EventAuthError } from "@/lib/event-auth/errors";

/*
 * The only client in this application that holds the Supabase service-role key.
 *
 * `server-only` makes an accidental import from a client component a build
 * error rather than a leaked secret, and the key is read from
 * `SUPABASE_SERVICE_ROLE_KEY` — deliberately without the `NEXT_PUBLIC_` prefix
 * that would inline it into the browser bundle. Nothing in this module returns
 * the key, logs it, or puts it in a response.
 *
 * Every controller credential, session and event write goes through this client,
 * which is why the underlying tables can stay unreachable by `anon` and
 * `authenticated` altogether.
 */

let cached: SupabaseClient | null = null;

export function isEventStoreConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function supabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    // Reported to the caller as a generic 503; the missing variable is named
    // only in the server log line the route handler writes.
    throw new EventAuthError("unavailable");
  }
  cached ??= createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "timer-event-controller" } },
  });
  return cached;
}

/** Test seam. Resetting the memoised client keeps environments independent. */
export function resetSupabaseAdmin() {
  cached = null;
}
