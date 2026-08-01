import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { EventAuthError } from "@/lib/event-auth/errors";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/*
 * Controller sessions.
 *
 * A session is a 256-bit random token. The browser holds it in an HTTP-only
 * cookie and the database holds only its SHA-256 digest, so a leaked database
 * dump cannot be replayed as a login. The token never appears in a URL, in
 * localStorage, in a log line, or in a JSON response body.
 *
 * Sessions are deliberately long-lived and survive closing the browser: an
 * operator signs in to an event once per device and comes back to it a month
 * later without signing in again. The cookie carries an explicit expiration
 * rather than being a session cookie, and the database row carries the same
 * deadline — the row is the authority, and it slides forward on every use, so an
 * event in regular use never expires while an untouched one lapses on schedule.
 *
 * The four things that do end a session are explicit: signing out, recovering the
 * password, changing the password, and the deadline passing.
 *
 * Cookies are named after the event, which is what lets one browser hold
 * authorization for several events at once and lets signing out of one leave the
 * others alone. A cookie is proof of nothing on its own: every request re-reads
 * the row, checks it has not expired, and checks it was issued against the
 * current `password_version`.
 */

const COOKIE_PREFIX = "aura_event_";

/** How long a session lives, and how far each use pushes that deadline out. */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export type CookieInstruction = {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: "lax";
    secure: boolean;
    path: "/";
    maxAge: number;
    expires: Date;
  };
};

/** UUID hyphens are not valid in a cookie name, so they come out. */
export function sessionCookieName(eventId: string) {
  return `${COOKIE_PREFIX}${eventId.replace(/-/g, "")}`;
}

function cookieOptions(maxAge: number): CookieInstruction["options"] {
  return {
    httpOnly: true,
    sameSite: "lax",
    // Secure in production; a localhost dev server is plain HTTP and would
    // otherwise never receive the cookie back.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    /*
     * Both forms of the same explicit deadline. Max-Age is what current browsers
     * use; Expires keeps the cookie persistent rather than session-scoped for
     * anything that only understands the older attribute.
     */
    maxAge,
    expires: new Date(Date.now() + maxAge * 1000),
  };
}

export function makeSessionToken() {
  return randomBytes(32).toString("base64url");
}

/**
 * Salts nothing and needs to salt nothing: the input is already 256 bits of
 * uniform randomness, so there is no dictionary to build against it.
 */
export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * A token, its digest, and the cookie that will carry it.
 *
 * Split out from writing the row because most callers do not write the row: the
 * transactional database functions insert the session inside the same commit as
 * the credential change, and are handed only the digest. The raw token exists in
 * this process and in the browser's cookie, and nowhere else ever.
 */
export type PreparedSession = {
  tokenHash: string;
  cookie: CookieInstruction;
};

export function prepareEventSession(eventId: string): PreparedSession {
  const token = makeSessionToken();
  return {
    tokenHash: hashSessionToken(token),
    cookie: {
      name: sessionCookieName(eventId),
      value: token,
      options: cookieOptions(SESSION_TTL_SECONDS),
    },
  };
}

/**
 * Writes a session row directly. Used by sign-in, which has no other database
 * work to be atomic with.
 */
export async function issueEventSession(
  eventId: string,
  passwordVersion: number,
): Promise<CookieInstruction> {
  const session = prepareEventSession(eventId);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  const { error } = await supabaseAdmin().from("event_sessions").insert({
    event_id: eventId,
    token_hash: session.tokenHash,
    password_version: passwordVersion,
    expires_at: expiresAt,
  });
  if (error) throw new EventAuthError("internal");
  return session.cookie;
}

/** An empty value with a zero lifetime, which is how a cookie is removed. */
export function clearEventSessionCookie(eventId: string): CookieInstruction {
  return {
    name: sessionCookieName(eventId),
    value: "",
    options: cookieOptions(0),
  };
}

async function readSessionToken(eventId: string) {
  const store = await cookies();
  return store.get(sessionCookieName(eventId))?.value ?? null;
}

/**
 * Proves the caller may act on exactly this event, and throws otherwise.
 *
 * The token is looked up on its own and the event it belongs to is compared with
 * the event that was asked for, so a cookie copied from one event's slot into
 * another's is rejected rather than trusted. Expired rows are removed by the
 * same call.
 *
 * Returns the cookie to re-send. The database row's deadline has just slid
 * forward, and the cookie's has to slide with it or a browser would forget a
 * session that is still perfectly valid.
 */
export async function requireEventSession(
  eventId: string,
): Promise<{ refresh: CookieInstruction }> {
  const token = await readSessionToken(eventId);
  if (!token) throw new EventAuthError("session_required");

  const { data, error } = await supabaseAdmin().rpc("touch_event_session", {
    p_token_hash: hashSessionToken(token),
    p_ttl_seconds: SESSION_TTL_SECONDS,
  });
  if (error) throw new EventAuthError("internal");

  const result = data as { status?: string; eventId?: string } | null;
  if (result?.status !== "valid") throw new EventAuthError("session_required");
  if (result.eventId !== eventId) throw new EventAuthError("wrong_event");

  return {
    refresh: {
      name: sessionCookieName(eventId),
      value: token,
      options: cookieOptions(SESSION_TTL_SECONDS),
    },
  };
}

/**
 * Ends this browser's session for one event, leaving every other event alone.
 *
 * A database failure is raised rather than swallowed. Signing out is a promise
 * about a shared machine, and reporting success while the row and the cookie are
 * both still live would be the wrong kind of reassuring.
 */
export async function revokeCurrentSession(eventId: string): Promise<void> {
  const token = await readSessionToken(eventId);
  if (!token) return;
  const { error } = await supabaseAdmin()
    .from("event_sessions")
    .delete()
    .eq("token_hash", hashSessionToken(token));
  if (error) throw new EventAuthError("internal");
}

/*
 * There is deliberately no `revokeAllSessions` here. Retiring every session is
 * part of changing a password, and doing it as a separate statement could leave an
 * event with a new password and stale sessions, or with no way in at all. It
 * happens inside `change_controller_password` and `recover_controller_password`,
 * in the same commit as the new hash and the replacement session.
 */
