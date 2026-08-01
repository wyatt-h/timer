// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMigratedDatabase, one, rows, type TestDatabase } from "@/test/pg";
import { createPgSupabaseClient } from "@/test/pg-supabase";
import type { TimerEvent } from "@/lib/types";

/*
 * The controller API, end to end against a real PostgreSQL instance.
 *
 * The only thing mocked is the cookie jar, which stands in for a browser. Both
 * the route handlers and the database functions they call are the real ones, so
 * these tests cover the whole path: Zod validation, scrypt hashing, session token
 * generation, the per-event cookie names, the rate limiter, the optimistic version
 * check, and the transactional credential mutations.
 *
 * No team is created, referenced, returned, or accepted anywhere below, because
 * there is no longer any such thing.
 */

let db: TestDatabase;

/* The mock factory is hoisted, so it reads this binding rather than closing over
 * a value that does not exist yet. */
let client: SupabaseClient | null = null;

vi.mock("@/lib/server/supabase-admin", () => ({
  supabaseAdmin: () => {
    if (!client) throw new Error("test database not ready");
    return client;
  },
  isEventStoreConfigured: () => true,
  resetSupabaseAdmin: () => {},
}));

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (name: string) => cookieJar.delete(name),
  }),
}));

const { POST: createRoute } = await import("@/app/api/event-auth/create/route");
const { POST: loginRoute } = await import("@/app/api/event-auth/login/route");
const { POST: logoutRoute } = await import("@/app/api/event-auth/logout/route");
const { POST: recoverRoute } = await import("@/app/api/event-auth/recover/route");
const { POST: changePasswordRoute } = await import("@/app/api/event-auth/change-password/route");
const { POST: rotateRecoveryRoute } = await import("@/app/api/event-auth/rotate-recovery/route");
const eventRoute = await import("@/app/api/events/[eventId]/route");
const { sessionCookieName, SESSION_TTL_SECONDS } = await import("@/lib/server/session");

const PASSWORD = "a-long-enough-password";

beforeAll(async () => {
  db = await createMigratedDatabase();
  client = createPgSupabaseClient(db);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  // Events cascade to access, sessions, agenda, speakers and runtime.
  await db.exec(`truncate public.events, public.event_auth_attempts cascade;`);
  cookieJar.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- helpers ----------------------------------------------------------------

async function uuid() {
  const row = await one<{ id: string }>(db, "select gen_random_uuid() as id");
  return row!.id;
}

async function draftEvent(name = "Summit"): Promise<TimerEvent> {
  const [id, viewerToken, agendaId, speakerId] = await Promise.all([
    uuid(),
    uuid(),
    uuid(),
    uuid(),
  ]);
  return {
    id,
    name,
    date: "2026-08-01",
    status: "draft",
    viewerToken,
    agenda: [
      {
        id: agendaId,
        kind: "single",
        durationSeconds: 600,
        speakers: [{ id: speakerId, name: "Speaker", durationSeconds: 600 }],
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
      updatedAt: Date.now(),
    },
    createdAt: Date.now(),
  };
}

function jsonRequest(url: string, body: unknown, method = "POST") {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.7" },
    body: JSON.stringify(body),
  });
}

type Body = Record<string, unknown>;

async function read(response: Response) {
  return (await response.json()) as Body;
}

function applyCookies(response: Response & { cookies: { getAll(): { name: string; value: string }[] } }) {
  for (const cookie of response.cookies.getAll()) {
    if (!cookie.value) cookieJar.delete(cookie.name);
    else cookieJar.set(cookie.name, cookie.value);
  }
}

/** Creates an event the way the builder does, keeping its session cookie. */
async function createEvent(loginName: string, name = "Summit", password = PASSWORD) {
  const event = await draftEvent(name);
  const response = await createRoute(
    jsonRequest("http://localhost/api/event-auth/create", { loginName, password, event }),
  );
  applyCookies(response);
  return { response, body: await read(response), event };
}

/**
 * A second, independent controller for the same event: its own login, its own
 * session row, its own token. The two are told nothing about each other.
 */
async function secondSession(eventId: string, loginName: string, password = PASSWORD) {
  const held = new Map(cookieJar);
  cookieJar.clear();
  const response = await loginRoute(
    jsonRequest("http://localhost/api/event-auth/login", { loginName, password }),
  );
  applyCookies(response);
  const token = cookieJar.get(sessionCookieName(eventId))!;

  cookieJar.clear();
  for (const [name, value] of held) cookieJar.set(name, value);
  return token;
}

/** Sends the following requests as whichever controller holds this token. */
function asController(eventId: string, token: string) {
  cookieJar.set(sessionCookieName(eventId), token);
}

function context(eventId: string) {
  return { params: Promise.resolve({ eventId }) };
}

// --- tests ------------------------------------------------------------------

describe("creating an event", () => {
  it("needs no team field, and creates no team row anywhere", async () => {
    const { response, body, event } = await createEvent("summit-2026");

    expect(response.status).toBe(201);
    expect(body.version).toBe(0);
    expect(body.loginName).toBe("summit-2026");
    expect(body.recoveryCode).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);

    // There is no teams table to have written to.
    const teams = await one<{ present: string | null }>(
      db,
      `select to_regclass('public.teams')::text as present`,
    );
    expect(teams?.present).toBeNull();

    const stored = await one<{ name: string; version: string }>(
      db,
      `select name, version from public.events where id = $1`,
      [event.id],
    );
    expect(stored?.name).toBe("Summit");

    // The credential, the children and the session all exist after one request.
    const access = await one<{ password_version: number; password_hash: string }>(
      db,
      `select password_version, password_hash from public.event_access where event_id = $1`,
      [event.id],
    );
    expect(access?.password_version).toBe(1);
    expect(access?.password_hash).toMatch(/^scrypt\$/);
    expect(access?.password_hash).not.toContain(PASSWORD);

    const sessions = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_sessions where event_id = $1`,
      [event.id],
    );
    expect(sessions?.count).toBe(1);

    const runtime = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_runtime where event_id = $1`,
      [event.id],
    );
    expect(runtime?.count).toBe(1);
  });

  it("returns no team property in the payload", async () => {
    const { body } = await createEvent("summit-2026");
    expect(Object.keys(body).sort()).toEqual([
      "event",
      "loginName",
      "recoveryCode",
      "version",
    ]);
    expect(JSON.stringify(body)).not.toMatch(/team/i);
  });

  it("ignores a team field if one is sent, rather than honouring it", async () => {
    const event = await draftEvent();
    const response = await createRoute(
      jsonRequest("http://localhost/api/event-auth/create", {
        loginName: "summit-2026",
        password: PASSWORD,
        event,
        teamSlug: "smuggled",
        team: "smuggled",
      }),
    );
    expect(response.status).toBe(201);
    expect(JSON.stringify(await read(response))).not.toContain("smuggled");
  });

  it("sets an event-scoped, persistent, HTTP-only session cookie", async () => {
    const { response, event } = await createEvent("summit-2026");
    const cookie = response.cookies.get(sessionCookieName(event.id));

    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.path).toBe("/");
    expect(cookie?.maxAge).toBe(SESSION_TTL_SECONDS);
    expect(cookie?.maxAge).toBe(30 * 24 * 60 * 60);
    expect(cookie?.expires).toBeInstanceOf(Date);

    // Only the digest is stored, never the token.
    const stored = await one<{ token_hash: string }>(
      db,
      `select token_hash from public.event_sessions where event_id = $1`,
      [event.id],
    );
    expect(stored?.token_hash).toHaveLength(64);
    expect(stored?.token_hash).not.toBe(cookie?.value);
  });

  it("never caches a controller response", async () => {
    const { response } = await createEvent("summit-2026");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("refuses a username already in use, with a 409 and no second event", async () => {
    await createEvent("summit-2026");
    const { response, body } = await createEvent("summit-2026", "Another");

    expect(response.status).toBe(409);
    expect(body.error).toBe("login_taken");
    const count = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.events`,
    );
    expect(count?.count).toBe(1);
  });

  it("rejects malformed input with a 400 and writes nothing", async () => {
    const base = await draftEvent();
    const cases: Record<string, unknown>[] = [
      { loginName: "ab", password: PASSWORD, event: base },
      { loginName: "summit", password: "too-short", event: base },
      { loginName: "summit", password: PASSWORD },
      { loginName: "summit", password: PASSWORD, event: { ...base, id: "not-a-uuid" } },
      { loginName: "summit", password: PASSWORD, event: { ...base, agenda: [] } },
      { loginName: "summit", password: PASSWORD, event: { ...base, name: "" } },
    ];

    for (const payload of cases) {
      const response = await createRoute(
        jsonRequest("http://localhost/api/event-auth/create", payload),
      );
      expect(response.status, JSON.stringify(payload).slice(0, 50)).toBe(400);
    }
    const count = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.events`,
    );
    expect(count?.count).toBe(0);
  });

  it("rejects a host longer than the database allows", async () => {
    const base = await draftEvent();
    const tooLong = {
      ...base,
      agenda: [{ ...base.agenda[0], kind: "panel" as const, host: "h".repeat(121) }],
    };

    const response = await createRoute(
      jsonRequest("http://localhost/api/event-auth/create", {
        loginName: "summit-host",
        password: PASSWORD,
        event: tooLong,
      }),
    );

    // Refused by API validation, so PostgreSQL never sees a value it would reject.
    expect(response.status).toBe(400);

    const allowed = {
      ...base,
      agenda: [{ ...base.agenda[0], kind: "panel" as const, host: "h".repeat(120) }],
    };
    const ok = await createRoute(
      jsonRequest("http://localhost/api/event-auth/create", {
        loginName: "summit-host",
        password: PASSWORD,
        event: allowed,
      }),
    );
    expect(ok.status).toBe(201);
  });
});

describe("opening an event", () => {
  it("returns the event to navigate to, and only that event", async () => {
    const created = await createEvent("summit-2026");
    await createEvent("other-event", "Somebody else's");
    // A second device: no cookies at all.
    cookieJar.clear();

    const response = await loginRoute(
      jsonRequest("http://localhost/api/event-auth/login", {
        loginName: "summit-2026",
        password: PASSWORD,
      }),
    );
    applyCookies(response);
    const body = await read(response);

    expect(response.status).toBe(200);
    // The id the browser navigates to, and no team anywhere.
    expect((body.event as TimerEvent).id).toBe(created.event.id);
    expect(Object.keys(body).sort()).toEqual(["event", "loginName", "version"]);
    expect(body.recoveryCode).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("Somebody else's");
    expect(cookieJar.has(sessionCookieName(created.event.id))).toBe(true);
  });

  it("answers an unknown username and a wrong password identically", async () => {
    await createEvent("summit-2026");

    const unknown = await loginRoute(
      jsonRequest("http://localhost/api/event-auth/login", {
        loginName: "no-such-event",
        password: PASSWORD,
      }),
    );
    const wrong = await loginRoute(
      jsonRequest("http://localhost/api/event-auth/login", {
        loginName: "summit-2026",
        password: "wrong-but-long-enough",
      }),
    );
    const impossible = await loginRoute(
      jsonRequest("http://localhost/api/event-auth/login", {
        loginName: "!!",
        password: PASSWORD,
      }),
    );

    expect([unknown.status, wrong.status, impossible.status]).toEqual([401, 401, 401]);
    const bodies = [await read(unknown), await read(wrong), await read(impossible)];
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).toEqual(bodies[2]);
    expect(JSON.stringify(bodies[0])).not.toContain("Summit");
  });

  it("gains nothing from naming an event id in the body", async () => {
    const created = await createEvent("summit-2026");
    cookieJar.clear();

    const response = await loginRoute(
      jsonRequest("http://localhost/api/event-auth/login", {
        loginName: "summit-2026",
        password: "wrong-but-long-enough",
        eventId: created.event.id,
      }),
    );

    expect(response.status).toBe(401);
    expect(cookieJar.size).toBe(0);
  });
});

describe("there is no global event listing", () => {
  it("exposes no route that returns more than the one authorized event", async () => {
    await createEvent("alpha-event", "Alpha");
    await createEvent("bravo-event", "Bravo");

    // Every read is addressed by a single id and gated by that id's session.
    const exported = Object.keys(eventRoute).sort();
    expect(exported).toEqual(["DELETE", "GET", "PUT"]);

    const { readdirSync } = await import("node:fs");
    const apiRoot = new URL("../../../app/api/", import.meta.url);
    // /api/events has exactly one child, the [eventId] segment. No index route.
    expect(readdirSync(new URL("events/", apiRoot))).toEqual(["[eventId]"]);
  });
});

describe("session scope", () => {
  it("refuses a session issued for one event when another is asked for", async () => {
    const alpha = await createEvent("alpha-event", "Alpha");
    const bravo = await createEvent("bravo-event", "Bravo");

    // Move Alpha's token into Bravo's cookie slot, as an attacker would.
    cookieJar.set(
      sessionCookieName(bravo.event.id),
      cookieJar.get(sessionCookieName(alpha.event.id))!,
    );

    const response = await eventRoute.GET(
      new Request(`http://localhost/api/events/${bravo.event.id}`),
      context(bravo.event.id),
    );

    expect(response.status).toBe(403);
    expect((await read(response)).error).toBe("wrong_event");
  });

  it("keeps two events open in the same browser independently", async () => {
    const alpha = await createEvent("alpha-event", "Alpha");
    const bravo = await createEvent("bravo-event", "Bravo");

    for (const created of [alpha, bravo]) {
      const response = await eventRoute.GET(
        new Request(`http://localhost/api/events/${created.event.id}`),
        context(created.event.id),
      );
      expect(response.status).toBe(200);
    }
  });

  it("signing out of one event leaves the other signed in", async () => {
    const alpha = await createEvent("alpha-event", "Alpha");
    const bravo = await createEvent("bravo-event", "Bravo");

    const logout = await logoutRoute(
      jsonRequest("http://localhost/api/event-auth/logout", { eventId: alpha.event.id }),
    );
    applyCookies(logout);

    expect(logout.status).toBe(200);
    expect(cookieJar.has(sessionCookieName(alpha.event.id))).toBe(false);
    expect(cookieJar.has(sessionCookieName(bravo.event.id))).toBe(true);

    const remaining = await rows<{ event_id: string }>(
      db,
      `select event_id from public.event_sessions`,
    );
    expect(remaining.map((row) => row.event_id)).toEqual([bravo.event.id]);
  });

  it("keeps a session across a browser restart and slides its deadline forward", async () => {
    const created = await createEvent("summit-2026");
    const before = await one<{ expires_at: string }>(
      db,
      `select expires_at from public.event_sessions where event_id = $1`,
      [created.event.id],
    );

    // A restart keeps the persistent cookie; the row is what is re-checked.
    const response = await eventRoute.GET(
      new Request(`http://localhost/api/events/${created.event.id}`),
      context(created.event.id),
    );
    applyCookies(response);

    expect(response.status).toBe(200);
    const after = await one<{ expires_at: string }>(
      db,
      `select expires_at from public.event_sessions where event_id = $1`,
      [created.event.id],
    );
    expect(new Date(after!.expires_at).getTime()).toBeGreaterThanOrEqual(
      new Date(before!.expires_at).getTime(),
    );
    expect(response.cookies.get(sessionCookieName(created.event.id))?.maxAge).toBe(
      SESSION_TTL_SECONDS,
    );
  });

  it("rejects a session past its deadline and prunes the row", async () => {
    const created = await createEvent("summit-2026");
    await db.query(`update public.event_sessions set expires_at = now() - interval '1 day'`);

    const response = await eventRoute.GET(
      new Request(`http://localhost/api/events/${created.event.id}`),
      context(created.event.id),
    );

    expect(response.status).toBe(401);
    expect((await read(response)).error).toBe("session_required");
    const remaining = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_sessions`,
    );
    expect(remaining?.count).toBe(0);
  });
});

describe("unauthorized access", () => {
  it("refuses every method without a session and changes nothing", async () => {
    const created = await createEvent("summit-2026");
    const { event } = created;
    cookieJar.clear();

    const get = await eventRoute.GET(
      new Request(`http://localhost/api/events/${event.id}`),
      context(event.id),
    );
    const put = await eventRoute.PUT(
      jsonRequest(`http://localhost/api/events/${event.id}`, { version: 0, event }, "PUT"),
      context(event.id),
    );
    const del = await eventRoute.DELETE(
      new Request(`http://localhost/api/events/${event.id}`, { method: "DELETE" }),
      context(event.id),
    );

    expect([get.status, put.status, del.status]).toEqual([401, 401, 401]);
    const stored = await one<{ count: number; version: string }>(
      db,
      `select count(*)::int as count, max(version) as version from public.events`,
    );
    expect(stored?.count).toBe(1);
    expect(Number(stored?.version)).toBe(0);
    expect(JSON.stringify(await read(get))).not.toContain("Summit");
  });

  it("answers a guessed id exactly as it answers a real one it cannot open", async () => {
    const created = await createEvent("summit-2026");
    cookieJar.clear();
    const ghost = await uuid();

    const real = await eventRoute.GET(
      new Request(`http://localhost/api/events/${created.event.id}`),
      context(created.event.id),
    );
    const guessed = await eventRoute.GET(
      new Request(`http://localhost/api/events/${ghost}`),
      context(ghost),
    );

    expect(real.status).toBe(guessed.status);
    expect(await read(real)).toEqual(await read(guessed));
  });

  it("rejects an event id that is not a uuid", async () => {
    const response = await eventRoute.GET(
      new Request("http://localhost/api/events/nonsense"),
      context("../../etc/passwd"),
    );
    expect(response.status).toBe(400);
  });

  it("refuses credential changes without a session", async () => {
    const created = await createEvent("summit-2026");
    cookieJar.clear();

    const change = await changePasswordRoute(
      jsonRequest("http://localhost/api/event-auth/change-password", {
        eventId: created.event.id,
        currentPassword: PASSWORD,
        newPassword: "another-long-password",
      }),
    );
    const rotate = await rotateRecoveryRoute(
      jsonRequest("http://localhost/api/event-auth/rotate-recovery", {
        eventId: created.event.id,
        currentPassword: PASSWORD,
      }),
    );

    expect([change.status, rotate.status]).toEqual([401, 401]);
    const access = await one<{ password_version: number }>(
      db,
      `select password_version from public.event_access where event_id = $1`,
      [created.event.id],
    );
    expect(access?.password_version).toBe(1);
  });
});

describe("saving an event", () => {
  it("replaces the event and increments the version", async () => {
    const created = await createEvent("summit-2026");
    const renamed = { ...created.event, name: "Renamed", status: "live" as const };

    const response = await eventRoute.PUT(
      jsonRequest(
        `http://localhost/api/events/${created.event.id}`,
        { version: 0, event: renamed },
        "PUT",
      ),
      context(created.event.id),
    );
    const body = await read(response);

    expect(response.status).toBe(200);
    expect(body.version).toBe(1);
    expect((body.event as TimerEvent).name).toBe("Renamed");
    expect(JSON.stringify(body)).not.toMatch(/team/i);

    const stored = await one<{ name: string; version: string }>(
      db,
      `select name, version from public.events where id = $1`,
      [created.event.id],
    );
    expect(stored?.name).toBe("Renamed");
    expect(Number(stored?.version)).toBe(1);
  });

  it("keeps a timer's overtime as a negative number through the round trip", async () => {
    const created = await createEvent("summit-2026");
    const overtime = {
      ...created.event,
      runtime: {
        ...created.event.runtime,
        status: "paused" as const,
        remainingSeconds: -42.5,
        panelRemainingSeconds: -90,
      },
    };

    const response = await eventRoute.PUT(
      jsonRequest(
        `http://localhost/api/events/${created.event.id}`,
        { version: 0, event: overtime },
        "PUT",
      ),
      context(created.event.id),
    );
    const body = await read(response);

    expect(response.status).toBe(200);
    // Not clamped on the way in...
    const stored = await one<{ remaining_seconds: string; panel_remaining_seconds: string }>(
      db,
      `select remaining_seconds, panel_remaining_seconds
       from public.event_runtime where event_id = $1`,
      [created.event.id],
    );
    expect(Number(stored?.remaining_seconds)).toBe(-42.5);
    expect(Number(stored?.panel_remaining_seconds)).toBe(-90);
    // ...nor on the way back out.
    const runtime = (body.event as TimerEvent).runtime;
    expect(Number(runtime.remainingSeconds)).toBe(-42.5);
    expect(Number(runtime.panelRemainingSeconds)).toBe(-90);

    // The audience and Zoom readers see the same negative value.
    const audience = await one<{ payload: { event: TimerEvent } }>(
      db,
      `select public.get_public_event($1) as payload`,
      [created.event.viewerToken],
    );
    expect(Number(audience?.payload.event.runtime.remainingSeconds)).toBe(-42.5);
  });

  it("still refuses an absurd remaining value", async () => {
    const created = await createEvent("summit-2026");
    const response = await eventRoute.PUT(
      jsonRequest(
        `http://localhost/api/events/${created.event.id}`,
        {
          version: 0,
          event: {
            ...created.event,
            runtime: { ...created.event.runtime, remainingSeconds: -999_999 },
          },
        },
        "PUT",
      ),
      context(created.event.id),
    );
    expect(response.status).toBe(400);
  });

  it("returns runtime timestamps as epoch milliseconds", async () => {
    const created = await createEvent("summit-2026");
    const endsAt = Date.now() + 60_000;

    const response = await eventRoute.PUT(
      jsonRequest(
        `http://localhost/api/events/${created.event.id}`,
        {
          version: 0,
          event: {
            ...created.event,
            runtime: { ...created.event.runtime, status: "running" as const, endsAt },
          },
        },
        "PUT",
      ),
      context(created.event.id),
    );
    const runtime = ((await read(response)).event as TimerEvent).runtime;

    expect(typeof runtime.endsAt).toBe("number");
    expect(Math.abs((runtime.endsAt ?? 0) - endsAt)).toBeLessThan(1000);
  });

  it("reports a conflict and does not overwrite the newer write", async () => {
    const created = await createEvent("summit-2026");

    // Another device saves first.
    await eventRoute.PUT(
      jsonRequest(
        `http://localhost/api/events/${created.event.id}`,
        { version: 0, event: { ...created.event, name: "From the other device" } },
        "PUT",
      ),
      context(created.event.id),
    );

    // This device still believes it is at version 0.
    const stale = await eventRoute.PUT(
      jsonRequest(
        `http://localhost/api/events/${created.event.id}`,
        { version: 0, event: { ...created.event, name: "From this device" } },
        "PUT",
      ),
      context(created.event.id),
    );
    const body = await read(stale);

    expect(stale.status).toBe(409);
    expect(body.error).toBe("conflict");
    // The authoritative state travels with the conflict.
    expect((body.event as TimerEvent).name).toBe("From the other device");
    expect(body.version).toBe(1);

    const stored = await one<{ name: string; version: string }>(
      db,
      `select name, version from public.events where id = $1`,
      [created.event.id],
    );
    expect(stored?.name).toBe("From the other device");
    expect(Number(stored?.version)).toBe(1);
  });

  /*
   * Required regression test 1, against the real route and the real database.
   *
   * The whole concurrency design in one test. Two controllers hold their own
   * sessions for one event and both stay editable; nothing leases, owns or takes
   * control of anything. The database decides: the first save against a version
   * wins and increments it, and a later save against the version it superseded is
   * refused with a 409 carrying the state that won, so the losing controller still
   * has its own edit and a real choice about what to do with it.
   */
  it("lets two controllers edit concurrently and resolves it by version, either way", async () => {
    const created = await createEvent("summit-2026");
    const eventId = created.event.id;
    const controllerA = cookieJar.get(sessionCookieName(eventId))!;
    const controllerB = await secondSession(eventId, "summit-2026");
    expect(controllerB).not.toBe(controllerA);

    // Both read the same version. Neither is told anything about the other.
    asController(eventId, controllerA);
    const readByA = await read(await eventRoute.GET(new Request(`http://localhost/api/events/${eventId}`), context(eventId)));
    asController(eventId, controllerB);
    const readByB = await read(await eventRoute.GET(new Request(`http://localhost/api/events/${eventId}`), context(eventId)));
    expect(readByA.version).toBe(0);
    expect(readByB.version).toBe(0);

    // A saves first and wins, taking version 1.
    asController(eventId, controllerA);
    const savedByA = await eventRoute.PUT(
      jsonRequest(
        `http://localhost/api/events/${eventId}`,
        { version: 0, event: { ...created.event, name: "From A" } },
        "PUT",
      ),
      context(eventId),
    );
    expect(savedByA.status).toBe(200);
    expect((await read(savedByA)).version).toBe(1);

    // B saves the edit it started from version 0. It is refused, not applied.
    asController(eventId, controllerB);
    const refusedForB = await eventRoute.PUT(
      jsonRequest(
        `http://localhost/api/events/${eventId}`,
        { version: 0, event: { ...created.event, name: "From B" } },
        "PUT",
      ),
      context(eventId),
    );
    const conflict = await read(refusedForB);

    expect(refusedForB.status).toBe(409);
    expect(conflict.error).toBe("conflict");
    // The winning state travels with the refusal, so B can show both sides.
    expect((conflict.event as TimerEvent).name).toBe("From A");
    expect(conflict.version).toBe(1);
    // B's session is still perfectly good; losing a race is not losing authorization.
    expect(cookieJar.get(sessionCookieName(eventId))).toBeTruthy();

    // Choice one — "Use the other version": B reads and adopts what won.
    const adoptedByB = await read(
      await eventRoute.GET(new Request(`http://localhost/api/events/${eventId}`), context(eventId)),
    );
    expect((adoptedByB.event as TimerEvent).name).toBe("From A");
    expect(adoptedByB.version).toBe(1);

    // Choice two — "Keep my changes": B rewrites its edit on top of version 1.
    const keptByB = await eventRoute.PUT(
      jsonRequest(
        `http://localhost/api/events/${eventId}`,
        { version: 1, event: { ...created.event, name: "From B" } },
        "PUT",
      ),
      context(eventId),
    );
    expect(keptByB.status).toBe(200);
    expect((await read(keptByB)).version).toBe(2);

    const stored = await one<{ name: string; version: string }>(
      db,
      `select name, version from public.events where id = $1`,
      [eventId],
    );
    expect(stored?.name).toBe("From B");
    expect(Number(stored?.version)).toBe(2);

    // And it is symmetric: A is the stale one now, and finds out the same way.
    asController(eventId, controllerA);
    const refusedForA = await eventRoute.PUT(
      jsonRequest(
        `http://localhost/api/events/${eventId}`,
        { version: 1, event: { ...created.event, name: "From A again" } },
        "PUT",
      ),
      context(eventId),
    );
    const conflictForA = await read(refusedForA);

    expect(refusedForA.status).toBe(409);
    expect((conflictForA.event as TimerEvent).name).toBe("From B");
    expect(conflictForA.version).toBe(2);
    // Nothing was overwritten by the loser.
    const after = await one<{ name: string }>(
      db,
      `select name from public.events where id = $1`,
      [eventId],
    );
    expect(after?.name).toBe("From B");
  });

  it("refuses a document for a different event than the session covers", async () => {
    const alpha = await createEvent("alpha-event", "Alpha");
    const bravo = await createEvent("bravo-event", "Bravo");

    const response = await eventRoute.PUT(
      jsonRequest(
        `http://localhost/api/events/${alpha.event.id}`,
        { version: 0, event: bravo.event },
        "PUT",
      ),
      context(alpha.event.id),
    );

    expect(response.status).toBe(400);
    const untouched = await one<{ name: string }>(
      db,
      `select name from public.events where id = $1`,
      [bravo.event.id],
    );
    expect(untouched?.name).toBe("Bravo");
  });

  it("rejects durations and statuses the database would refuse", async () => {
    const created = await createEvent("summit-2026");
    const broken = [
      { ...created.event, status: "archived" },
      { ...created.event, agenda: [{ ...created.event.agenda[0], durationSeconds: 0 }] },
      { ...created.event, agenda: [{ ...created.event.agenda[0], durationSeconds: 90_000 }] },
      { ...created.event, runtime: { ...created.event.runtime, status: "spinning" } },
      { ...created.event, runtime: { ...created.event.runtime, segmentIndex: -1 } },
      { ...created.event, date: "01-08-2026" },
      { ...created.event, name: "n".repeat(121) },
    ];

    for (const event of broken) {
      const response = await eventRoute.PUT(
        jsonRequest(
          `http://localhost/api/events/${created.event.id}`,
          { version: 0, event },
          "PUT",
        ),
        context(created.event.id),
      );
      expect(response.status, JSON.stringify(event).slice(0, 50)).toBe(400);
    }
  });

  it("keeps a Zoom pairing code once minted", async () => {
    const created = await createEvent("summit-2026");

    await eventRoute.PUT(
      jsonRequest(
        `http://localhost/api/events/${created.event.id}`,
        { version: 0, event: { ...created.event, zoomToken: "ABCDE12345" } },
        "PUT",
      ),
      context(created.event.id),
    );
    await eventRoute.PUT(
      jsonRequest(
        `http://localhost/api/events/${created.event.id}`,
        { version: 1, event: { ...created.event, zoomToken: "ZZZZZ99999" } },
        "PUT",
      ),
      context(created.event.id),
    );

    const stored = await one<{ zoom_token: string }>(
      db,
      `select zoom_token from public.events where id = $1`,
      [created.event.id],
    );
    expect(stored?.zoom_token).toBe("ABCDE12345");
  });
});

describe("public and Zoom reads of a teamless event", () => {
  it("serves the audience display by viewer token", async () => {
    const created = await createEvent("summit-2026");
    await eventRoute.PUT(
      jsonRequest(
        `http://localhost/api/events/${created.event.id}`,
        { version: 0, event: { ...created.event, status: "live" as const } },
        "PUT",
      ),
      context(created.event.id),
    );

    const payload = await one<{ payload: { event: TimerEvent } }>(
      db,
      `select public.get_public_event($1) as payload`,
      [created.event.viewerToken],
    );

    expect(payload?.payload.event.name).toBe("Summit");
    expect(Object.keys(payload!.payload)).toEqual(["event"]);
    expect(JSON.stringify(payload!.payload)).not.toMatch(/team/i);
  });

  it("serves the Zoom App by pairing code", async () => {
    const created = await createEvent("summit-2026");
    await eventRoute.PUT(
      jsonRequest(
        `http://localhost/api/events/${created.event.id}`,
        { version: 0, event: { ...created.event, zoomToken: "PAIRME1234" } },
        "PUT",
      ),
      context(created.event.id),
    );

    const payload = await one<{ payload: { event: TimerEvent } | null }>(
      db,
      `select public.get_zoom_event($1) as payload`,
      ["pairme1234"],
    );
    expect(payload?.payload?.event.id).toBe(created.event.id);
  });

  it("finds nothing for a code or token that matches no event", async () => {
    const ghost = await uuid();
    const audience = await one<{ payload: unknown }>(
      db,
      `select public.get_public_event($1) as payload`,
      [ghost],
    );
    const zoom = await one<{ payload: unknown }>(
      db,
      `select public.get_zoom_event($1) as payload`,
      ["NOSUCHCODE"],
    );
    expect(audience?.payload).toBeNull();
    expect(zoom?.payload).toBeNull();
  });
});

describe("deleting an event", () => {
  it("removes the event and everything hanging off it", async () => {
    const created = await createEvent("summit-2026");

    const response = await eventRoute.DELETE(
      new Request(`http://localhost/api/events/${created.event.id}`, { method: "DELETE" }),
      context(created.event.id),
    );
    applyCookies(response);

    expect(response.status).toBe(200);
    for (const table of ["events", "event_access", "event_sessions", "agenda_items", "speakers", "event_runtime"]) {
      const remaining = await one<{ count: number }>(
        db,
        `select count(*)::int as count from public.${table}`,
      );
      expect(remaining?.count, table).toBe(0);
    }
    expect(cookieJar.has(sessionCookieName(created.event.id))).toBe(false);
  });

  it("frees the controller username for reuse", async () => {
    const first = await createEvent("summit-2026");
    await eventRoute.DELETE(
      new Request(`http://localhost/api/events/${first.event.id}`, { method: "DELETE" }),
      context(first.event.id),
    );
    const second = await createEvent("summit-2026", "A new summit");
    expect(second.response.status).toBe(201);
  });

  it("reports a repeat delete as unauthorized rather than as a success", async () => {
    const created = await createEvent("summit-2026");
    await eventRoute.DELETE(
      new Request(`http://localhost/api/events/${created.event.id}`, { method: "DELETE" }),
      context(created.event.id),
    );
    const again = await eventRoute.DELETE(
      new Request(`http://localhost/api/events/${created.event.id}`, { method: "DELETE" }),
      context(created.event.id),
    );
    // The session went with the event, so the retry cannot even authenticate.
    expect(again.status).toBe(401);
  });
});

describe("credential changes are transactional", () => {
  it("changes a password, signs other devices out, and keeps this one in", async () => {
    const created = await createEvent("summit-2026");
    const firstDeviceCookies = new Map(cookieJar);

    // A second device signs in.
    cookieJar.clear();
    const secondLogin = await loginRoute(
      jsonRequest("http://localhost/api/event-auth/login", {
        loginName: "summit-2026",
        password: PASSWORD,
      }),
    );
    applyCookies(secondLogin);
    const secondToken = cookieJar.get(sessionCookieName(created.event.id))!;
    const sessions = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_sessions`,
    );
    expect(sessions?.count).toBe(2);

    // Back on the first device.
    cookieJar.clear();
    for (const [name, value] of firstDeviceCookies) cookieJar.set(name, value);
    const change = await changePasswordRoute(
      jsonRequest("http://localhost/api/event-auth/change-password", {
        eventId: created.event.id,
        currentPassword: PASSWORD,
        newPassword: "a-brand-new-password",
      }),
    );
    applyCookies(change);

    expect(change.status).toBe(200);
    const access = await one<{ password_version: number }>(
      db,
      `select password_version from public.event_access where event_id = $1`,
      [created.event.id],
    );
    expect(access?.password_version).toBe(2);

    // Exactly one session, created in the same commit as the new hash.
    const after = await rows<{ password_version: number }>(
      db,
      `select password_version from public.event_sessions`,
    );
    expect(after).toHaveLength(1);
    expect(after[0].password_version).toBe(2);

    // This device carries on without signing in again.
    const stillWorks = await eventRoute.GET(
      new Request(`http://localhost/api/events/${created.event.id}`),
      context(created.event.id),
    );
    expect(stillWorks.status).toBe(200);

    // The second device is out.
    cookieJar.set(sessionCookieName(created.event.id), secondToken);
    const other = await eventRoute.GET(
      new Request(`http://localhost/api/events/${created.event.id}`),
      context(created.event.id),
    );
    expect(other.status).toBe(401);
  });

  it("leaves everything untouched when the current password is wrong", async () => {
    const created = await createEvent("summit-2026");

    const response = await changePasswordRoute(
      jsonRequest("http://localhost/api/event-auth/change-password", {
        eventId: created.event.id,
        currentPassword: "not-the-current-one",
        newPassword: "a-brand-new-password",
      }),
    );

    expect(response.status).toBe(401);
    const access = await one<{ password_version: number; password_hash: string }>(
      db,
      `select password_version, password_hash from public.event_access where event_id = $1`,
      [created.event.id],
    );
    expect(access?.password_version).toBe(1);
    // The session that made the request still works.
    const sessions = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_sessions`,
    );
    expect(sessions?.count).toBe(1);
  });

  it("makes the new password the only one that works", async () => {
    const created = await createEvent("summit-2026");
    await changePasswordRoute(
      jsonRequest("http://localhost/api/event-auth/change-password", {
        eventId: created.event.id,
        currentPassword: PASSWORD,
        newPassword: "a-brand-new-password",
      }),
    );
    cookieJar.clear();

    const withOld = await loginRoute(
      jsonRequest("http://localhost/api/event-auth/login", {
        loginName: "summit-2026",
        password: PASSWORD,
      }),
    );
    const withNew = await loginRoute(
      jsonRequest("http://localhost/api/event-auth/login", {
        loginName: "summit-2026",
        password: "a-brand-new-password",
      }),
    );

    expect(withOld.status).toBe(401);
    expect(withNew.status).toBe(200);
  });
});

describe("recovery", () => {
  it("replaces the password, rotates the code, and retires every session at once", async () => {
    const created = await createEvent("summit-2026");
    const firstCode = String(created.body.recoveryCode);
    const originalHash = (
      await one<{ recovery_code_hash: string }>(
        db,
        `select recovery_code_hash from public.event_access where event_id = $1`,
        [created.event.id],
      )
    )?.recovery_code_hash;
    cookieJar.clear();

    const response = await recoverRoute(
      jsonRequest("http://localhost/api/event-auth/recover", {
        loginName: "summit-2026",
        recoveryCode: firstCode,
        newPassword: "recovered-password-1",
      }),
    );
    applyCookies(response);
    const body = await read(response);

    expect(response.status).toBe(200);
    const access = await one<{ password_version: number; recovery_code_hash: string }>(
      db,
      `select password_version, recovery_code_hash from public.event_access where event_id = $1`,
      [created.event.id],
    );
    expect(access?.password_version).toBe(2);
    expect(access?.recovery_code_hash).not.toBe(originalHash);
    expect(body.recoveryCode).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);
    expect(body.recoveryCode).not.toBe(firstCode);

    const sessions = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_sessions`,
    );
    expect(sessions?.count).toBe(1);
    expect(cookieJar.has(sessionCookieName(created.event.id))).toBe(true);
  });

  it("accepts the code however it was written down, and only once", async () => {
    const created = await createEvent("summit-2026");
    const code = String(created.body.recoveryCode);
    cookieJar.clear();

    const first = await recoverRoute(
      jsonRequest("http://localhost/api/event-auth/recover", {
        loginName: "summit-2026",
        recoveryCode: ` ${code.replace(/-/g, "").toLowerCase()} `,
        newPassword: "recovered-password-1",
      }),
    );
    expect(first.status).toBe(200);

    const reused = await recoverRoute(
      jsonRequest("http://localhost/api/event-auth/recover", {
        loginName: "summit-2026",
        recoveryCode: code,
        newPassword: "recovered-password-2",
      }),
    );
    expect(reused.status).toBe(401);
  });

  /*
   * The boundary this closes: the route used to re-read the event after the
   * recovery transaction committed. If that second read failed, the password and
   * the recovery code had already changed but the caller got a 500 — losing the one
   * and only copy of the new recovery code, permanently.
   *
   * The payload now comes back from the transaction itself, so there is nothing
   * between the commit and the response that can fail.
   */
  it("needs no database read after the recovery transaction commits", async () => {
    const created = await createEvent("summit-2026");
    const code = String(created.body.recoveryCode);
    cookieJar.clear();

    const store = await import("@/lib/server/event-store");
    const loadSpy = vi.spyOn(store, "loadControllerEvent");

    const response = await recoverRoute(
      jsonRequest("http://localhost/api/event-auth/recover", {
        loginName: "summit-2026",
        recoveryCode: code,
        newPassword: "recovered-password-1",
      }),
    );
    const body = await read(response);

    expect(response.status).toBe(200);
    // The new code is in hand, and no post-commit read was needed to get it.
    expect(body.recoveryCode).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);
    expect(body.event).toBeTruthy();
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("still returns the new recovery code when tidying the rate limiter fails", async () => {
    const created = await createEvent("summit-2026");
    const code = String(created.body.recoveryCode);
    cookieJar.clear();

    // Anything after the point of no return is best-effort.
    const limiter = await import("@/lib/server/rate-limit");
    vi.spyOn(limiter, "clearAttempts").mockRejectedValue(new Error("limiter unavailable"));

    const response = await recoverRoute(
      jsonRequest("http://localhost/api/event-auth/recover", {
        loginName: "summit-2026",
        recoveryCode: code,
        newPassword: "recovered-password-1",
      }),
    );
    const body = await read(response);

    expect(response.status).toBe(200);
    expect(body.recoveryCode).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);
    // And the password really did change, so the code is the live one.
    const access = await one<{ password_version: number }>(
      db,
      `select password_version from public.event_access where event_id = $1`,
      [created.event.id],
    );
    expect(access?.password_version).toBe(2);
  });

  it("answers a wrong code and an unknown username identically", async () => {
    await createEvent("summit-2026");

    const wrong = await recoverRoute(
      jsonRequest("http://localhost/api/event-auth/recover", {
        loginName: "summit-2026",
        recoveryCode: "AAAAA-AAAAA-AAAAA-AAAAA-AAAAA",
        newPassword: "recovered-password-1",
      }),
    );
    const unknown = await recoverRoute(
      jsonRequest("http://localhost/api/event-auth/recover", {
        loginName: "no-such-event",
        recoveryCode: "AAAAA-AAAAA-AAAAA-AAAAA-AAAAA",
        newPassword: "recovered-password-1",
      }),
    );

    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(await read(wrong)).toEqual(await read(unknown));
  });
});

describe("rotating a recovery code", () => {
  it("requires the current password, not just a session", async () => {
    const created = await createEvent("summit-2026");
    const originalHash = (
      await one<{ recovery_code_hash: string }>(
        db,
        `select recovery_code_hash from public.event_access where event_id = $1`,
        [created.event.id],
      )
    )?.recovery_code_hash;

    const withoutPassword = await rotateRecoveryRoute(
      jsonRequest("http://localhost/api/event-auth/rotate-recovery", {
        eventId: created.event.id,
      }),
    );
    expect(withoutPassword.status).toBe(400);

    const wrongPassword = await rotateRecoveryRoute(
      jsonRequest("http://localhost/api/event-auth/rotate-recovery", {
        eventId: created.event.id,
        currentPassword: "not-the-password",
      }),
    );
    expect(wrongPassword.status).toBe(401);

    // Nothing changed on either failed attempt.
    const unchanged = await one<{ recovery_code_hash: string }>(
      db,
      `select recovery_code_hash from public.event_access where event_id = $1`,
      [created.event.id],
    );
    expect(unchanged?.recovery_code_hash).toBe(originalHash);
  });

  it("issues a replacement once, and invalidates the previous code", async () => {
    const created = await createEvent("summit-2026");
    const firstCode = String(created.body.recoveryCode);

    const rotate = await rotateRecoveryRoute(
      jsonRequest("http://localhost/api/event-auth/rotate-recovery", {
        eventId: created.event.id,
        currentPassword: PASSWORD,
      }),
    );
    const body = await read(rotate);

    expect(rotate.status).toBe(200);
    expect(body.recoveryCode).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);
    expect(body.recoveryCode).not.toBe(firstCode);

    // A code change is not a password change, so sessions survive.
    const access = await one<{ password_version: number }>(
      db,
      `select password_version from public.event_access where event_id = $1`,
      [created.event.id],
    );
    expect(access?.password_version).toBe(1);
    const sessions = await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_sessions`,
    );
    expect(sessions?.count).toBe(1);

    // The old code no longer works; the new one does.
    cookieJar.clear();
    const withOld = await recoverRoute(
      jsonRequest("http://localhost/api/event-auth/recover", {
        loginName: "summit-2026",
        recoveryCode: firstCode,
        newPassword: "recovered-password-1",
      }),
    );
    expect(withOld.status).toBe(401);

    const withNew = await recoverRoute(
      jsonRequest("http://localhost/api/event-auth/recover", {
        loginName: "summit-2026",
        recoveryCode: String(body.recoveryCode),
        newPassword: "recovered-password-1",
      }),
    );
    expect(withNew.status).toBe(200);
  });
});

describe("rate limiting", () => {
  it("stops repeated wrong passwords with a generic 429", async () => {
    await createEvent("summit-2026");

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await loginRoute(
        jsonRequest("http://localhost/api/event-auth/login", {
          loginName: "summit-2026",
          password: "wrong-but-long-enough",
        }),
      );
      statuses.push(response.status);
      if (response.status === 429) {
        const body = await read(response);
        expect(body.error).toBe("rate_limited");
        expect(JSON.stringify(body)).not.toContain("Summit");
        expect(response.headers.get("Retry-After")).toBeTruthy();
      }
    }

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses.at(-1)).toBe(429);
  });

  it("stores only hashes of the username and the client address", async () => {
    await loginRoute(
      jsonRequest("http://localhost/api/event-auth/login", {
        loginName: "summit-2026",
        password: "wrong-but-long-enough",
      }),
    );

    const attempt = await one<{ identifier_hash: string; address_hash: string }>(
      db,
      `select identifier_hash, address_hash from public.event_auth_attempts`,
    );
    expect(attempt?.identifier_hash).toHaveLength(64);
    expect(attempt?.address_hash).toHaveLength(64);
    const serialized = JSON.stringify(attempt);
    expect(serialized).not.toContain("summit-2026");
    expect(serialized).not.toContain("203.0.113.7");
  });

  it("meters recovery-code rotation as well", async () => {
    const created = await createEvent("summit-2026");

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await rotateRecoveryRoute(
        jsonRequest("http://localhost/api/event-auth/rotate-recovery", {
          eventId: created.event.id,
          currentPassword: "not-the-password",
        }),
      );
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses.at(-1)).toBe(429);
  });
});
