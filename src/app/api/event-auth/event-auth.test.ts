// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMigratedDatabase, one, rows, type TestDatabase } from "@/test/pg";
import { createPgSupabaseClient } from "@/test/pg-supabase";
import { normalizeLoginName } from "@/lib/event-auth/login-name";
import type { TimerEvent } from "@/lib/types";

let db: TestDatabase;
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
const { POST: changePasswordRoute } = await import("@/app/api/event-auth/change-password/route");
const eventRoute = await import("@/app/api/events/[eventId]/route");
const inviteRoute = await import("@/app/api/events/[eventId]/invites/route");
const { POST: redeemInviteRoute } = await import("@/app/api/event-auth/redeem-invite/route");
const { sessionCookieName, SESSION_TTL_SECONDS } = await import("@/lib/server/session");

const PASSWORD = "secret";

beforeAll(async () => {
  db = await createMigratedDatabase();
  client = createPgSupabaseClient(db);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`truncate public.events, public.event_auth_attempts cascade;`);
  cookieJar.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

async function uuid() {
  return (await one<{ id: string }>(db, "select gen_random_uuid() as id"))!.id;
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

async function read(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

function applyCookies(
  response: Response & { cookies: { getAll(): { name: string; value: string }[] } },
) {
  for (const cookie of response.cookies.getAll()) {
    if (!cookie.value) cookieJar.delete(cookie.name);
    else cookieJar.set(cookie.name, cookie.value);
  }
}

async function createEvent(
  name = "Summit",
  password = PASSWORD,
  loginName = normalizeLoginName(name),
) {
  const event = await draftEvent(name);
  const response = await createRoute(
    jsonRequest("http://localhost/api/event-auth/create", { loginName, password, event }),
  );
  applyCookies(response);
  return { response, body: await read(response), event };
}

async function login(loginName: string, password = PASSWORD) {
  const response = await loginRoute(
    jsonRequest("http://localhost/api/event-auth/login", { loginName, password }),
  );
  applyCookies(response);
  return { response, body: await read(response) };
}

function context(eventId: string) {
  return { params: Promise.resolve({ eventId }) };
}

describe("event creation", () => {
  it("stores a lowercase login name separately from the display name", async () => {
    const { response, body, event } = await createEvent(
      "Global Call 2026",
      PASSWORD,
      "  GLOBAL   CONTROL  ",
    );

    expect(response.status).toBe(201);
    expect(Object.keys(body).sort()).toEqual(["event", "loginName", "version"]);
    expect(body.loginName).toBe("global control");
    expect(body).not.toHaveProperty("recoveryCode");
    expect(JSON.stringify(body)).not.toMatch(/team/i);

    const access = await one<{ login_name: string; password_hash: string }>(
      db,
      `select login_name, password_hash from public.event_access where event_id = $1`,
      [event.id],
    );
    expect(access?.login_name).toBe("global control");
    expect(access?.password_hash).toMatch(/^scrypt\$/);
    expect(access?.password_hash).not.toContain(PASSWORD);

    const cookie = response.cookies.get(sessionCookieName(event.id));
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.maxAge).toBe(SESSION_TTL_SECONDS);
  });

  it("requires only a six-character password", async () => {
    expect((await createEvent("Too short", "12345")).response.status).toBe(400);
    expect((await createEvent("Long enough", "123456")).response.status).toBe(201);
  });

  it("rejects login names that canonicalize to the same identifier", async () => {
    await createEvent("Global Call", PASSWORD, "event controller");
    const duplicate = await createEvent("Different Display Name", PASSWORD, " EVENT   CONTROLLER ");

    expect(duplicate.response.status).toBe(409);
    expect(duplicate.body.error).toBe("login_taken");
    expect((await one<{ count: number }>(db, `select count(*)::int as count from public.events`))?.count).toBe(1);
  });

  it("validates the full event before writing anything", async () => {
    const event = await draftEvent("Invalid");
    const cases = [
      { loginName: "invalid", password: "12345", event },
      { password: PASSWORD },
      { loginName: "invalid", password: PASSWORD, event: { ...event, id: "not-a-uuid" } },
      { loginName: "invalid", password: PASSWORD, event: { ...event, agenda: [] } },
      { loginName: "invalid", password: PASSWORD, event: { ...event, name: "" } },
    ];
    for (const body of cases) {
      const response = await createRoute(
        jsonRequest("http://localhost/api/event-auth/create", body),
      );
      expect(response.status).toBe(400);
    }
    expect((await one<{ count: number }>(db, `select count(*)::int as count from public.events`))?.count).toBe(0);
  });
});

describe("opening an event", () => {
  it("accepts ordinary differences in case and whitespace", async () => {
    const created = await createEvent("Global Call");
    cookieJar.clear();
    const opened = await login("  global   CALL  ");

    expect(opened.response.status).toBe(200);
    expect((opened.body.event as TimerEvent).id).toBe(created.event.id);
    expect(cookieJar.has(sessionCookieName(created.event.id))).toBe(true);
  });

  it("answers an unknown event and a wrong password identically", async () => {
    await createEvent("Global Call");
    cookieJar.clear();
    const unknown = await login("No such event");
    const wrong = await login("Global Call", "wrong-password");

    expect([unknown.response.status, wrong.response.status]).toEqual([401, 401]);
    expect(unknown.body).toEqual(wrong.body);
    expect(JSON.stringify(unknown.body)).not.toContain("Global Call");
  });

  it("does not expose a global event listing", () => {
    expect(Object.keys(eventRoute).sort()).toEqual(["DELETE", "GET", "PUT"]);
  });
});

describe("event writes", () => {
  it("renames the event without changing its login name", async () => {
    const created = await createEvent("Global Call", PASSWORD, "global controller");
    const renamed = { ...created.event, name: "Leadership Q&A" };
    const response = await eventRoute.PUT(
      jsonRequest(`http://localhost/api/events/${created.event.id}`, {
        version: 0,
        event: renamed,
      }, "PUT"),
      context(created.event.id),
    );

    expect(response.status).toBe(200);
    expect((await read(response)).version).toBe(1);
    expect((await one<{ login_name: string }>(db, `select login_name from public.event_access`))?.login_name).toBe("global controller");

    cookieJar.clear();
    expect((await login("global controller")).response.status).toBe(200);
    expect((await login("Leadership Q&A")).response.status).toBe(401);
  });

  it("allows duplicate display names when login names differ", async () => {
    const alpha = await createEvent("Alpha", PASSWORD, "alpha login");
    await createEvent("Bravo", PASSWORD, "bravo login");
    cookieJar.clear();
    await login("alpha login");

    const response = await eventRoute.PUT(
      jsonRequest(`http://localhost/api/events/${alpha.event.id}`, {
        version: 0,
        event: { ...alpha.event, name: "BRAVO" },
      }, "PUT"),
      context(alpha.event.id),
    );

    expect(response.status).toBe(200);
    expect((await one<{ name: string; version: number }>(db, `select name, version from public.events where id = $1`, [alpha.event.id]))).toEqual({ name: "BRAVO", version: 1 });
  });

  it("returns the winner when a second device saves a stale version", async () => {
    const created = await createEvent("Summit");
    const firstToken = cookieJar.get(sessionCookieName(created.event.id))!;
    cookieJar.clear();
    await login("Summit");
    const secondToken = cookieJar.get(sessionCookieName(created.event.id))!;

    cookieJar.set(sessionCookieName(created.event.id), firstToken);
    const first = await eventRoute.PUT(
      jsonRequest("http://localhost", { version: 0, event: { ...created.event, date: "2026-08-02" } }, "PUT"),
      context(created.event.id),
    );
    expect(first.status).toBe(200);

    cookieJar.set(sessionCookieName(created.event.id), secondToken);
    const stale = await eventRoute.PUT(
      jsonRequest("http://localhost", { version: 0, event: { ...created.event, date: "2026-08-03" } }, "PUT"),
      context(created.event.id),
    );
    const body = await read(stale);
    expect(stale.status).toBe(409);
    expect((body.event as TimerEvent).date).toBe("2026-08-02");
  });

  it("deletes the event, children, credentials, sessions, and its cookie", async () => {
    const created = await createEvent("Disposable");
    const response = await eventRoute.DELETE(
      new Request(`http://localhost/api/events/${created.event.id}`, { method: "DELETE" }),
      context(created.event.id),
    );
    applyCookies(response);

    expect(response.status).toBe(200);
    for (const table of ["events", "agenda_items", "speakers", "event_runtime", "event_access", "event_sessions"]) {
      expect((await one<{ count: number }>(db, `select count(*)::int as count from public.${table}`))?.count, table).toBe(0);
    }
    expect(cookieJar.has(sessionCookieName(created.event.id))).toBe(false);
  });
});

describe("passwords and sessions", () => {
  it("changes the password, retires other devices, and keeps the current device signed in", async () => {
    const created = await createEvent("Summit");
    const firstToken = cookieJar.get(sessionCookieName(created.event.id))!;
    cookieJar.clear();
    await login("Summit");
    const secondToken = cookieJar.get(sessionCookieName(created.event.id))!;

    cookieJar.set(sessionCookieName(created.event.id), firstToken);
    const changed = await changePasswordRoute(
      jsonRequest("http://localhost/api/event-auth/change-password", {
        eventId: created.event.id,
        currentPassword: PASSWORD,
        newPassword: "newone",
      }),
    );
    applyCookies(changed);
    expect(changed.status).toBe(200);
    expect((await rows(db, `select * from public.event_sessions`))).toHaveLength(1);
    expect((await eventRoute.GET(new Request("http://localhost"), context(created.event.id))).status).toBe(200);

    cookieJar.set(sessionCookieName(created.event.id), secondToken);
    expect((await eventRoute.GET(new Request("http://localhost"), context(created.event.id))).status).toBe(401);

    cookieJar.clear();
    expect((await login("Summit", PASSWORD)).response.status).toBe(401);
    expect((await login("Summit", "newone")).response.status).toBe(200);
  });
});

describe("event invitations", () => {
  it("creates a reusable link without storing its raw token, then opens it twice", async () => {
    const created = await createEvent("Invited Event");
    const invitation = await inviteRoute.POST(
      new Request(`http://localhost/api/events/${created.event.id}/invites`, { method: "POST" }),
      context(created.event.id),
    );
    applyCookies(invitation);
    const invitationBody = await read(invitation);
    const inviteUrl = String(invitationBody.inviteUrl);
    const token = inviteUrl.split("#")[1];

    expect(invitation.status).toBe(201);
    expect(new URL(inviteUrl).pathname).toBe("/invite");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await one<{ token_hash: string }>(
      db,
      `select token_hash from public.event_invites where event_id = $1`,
      [created.event.id],
    );
    expect(stored?.token_hash).toHaveLength(64);
    expect(stored?.token_hash).not.toContain(token);

    cookieJar.clear();
    const redeemed = await redeemInviteRoute(
      jsonRequest("http://localhost/api/event-auth/redeem-invite", { token }),
    );
    applyCookies(redeemed);
    const redeemedBody = await read(redeemed);
    expect(redeemed.status).toBe(200);
    expect((redeemedBody.event as TimerEvent).id).toBe(created.event.id);
    expect(cookieJar.has(sessionCookieName(created.event.id))).toBe(true);
    expect((await one<{ count: number }>(
      db,
      `select count(*)::int as count from public.event_invites where event_id = $1`,
      [created.event.id],
    ))?.count).toBe(1);

    cookieJar.clear();
    const replay = await redeemInviteRoute(
      jsonRequest("http://localhost/api/event-auth/redeem-invite", { token }),
    );
    applyCookies(replay);
    expect(replay.status).toBe(200);
    expect(((await read(replay)).event as TimerEvent).id).toBe(created.event.id);
    expect(cookieJar.has(sessionCookieName(created.event.id))).toBe(true);
  });

  it("requires the event session to create or revoke an invitation", async () => {
    const created = await createEvent("Revocable Event");
    const ownerCookies = new Map(cookieJar);
    const invitation = await inviteRoute.POST(
      new Request(`http://localhost/api/events/${created.event.id}/invites`, { method: "POST" }),
      context(created.event.id),
    );
    const invitationBody = await read(invitation);

    cookieJar.clear();
    const unauthorizedCreate = await inviteRoute.POST(
      new Request(`http://localhost/api/events/${created.event.id}/invites`, { method: "POST" }),
      context(created.event.id),
    );
    const unauthorizedRevoke = await inviteRoute.DELETE(
      jsonRequest(`http://localhost/api/events/${created.event.id}/invites`, {
        inviteId: invitationBody.inviteId,
      }, "DELETE"),
      context(created.event.id),
    );
    expect([unauthorizedCreate.status, unauthorizedRevoke.status]).toEqual([401, 401]);

    for (const [name, value] of ownerCookies) cookieJar.set(name, value);
    const revoked = await inviteRoute.DELETE(
      jsonRequest(`http://localhost/api/events/${created.event.id}/invites`, {
        inviteId: invitationBody.inviteId,
      }, "DELETE"),
      context(created.event.id),
    );
    expect(revoked.status).toBe(200);

    cookieJar.clear();
    const token = String(invitationBody.inviteUrl).split("#")[1];
    const redemption = await redeemInviteRoute(
      jsonRequest("http://localhost/api/event-auth/redeem-invite", { token }),
    );
    expect(redemption.status).toBe(401);
  });
});

describe("rate limiting", () => {
  it("stops repeated wrong passwords and stores only identifier/address hashes", async () => {
    await createEvent("Summit");
    cookieJar.clear();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      statuses.push((await login("Summit", "wrong-password")).response.status);
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses[10]).toBe(429);

    const attempt = await one<{ identifier_hash: string; address_hash: string }>(
      db,
      `select identifier_hash, address_hash from public.event_auth_attempts limit 1`,
    );
    expect(attempt?.identifier_hash).toHaveLength(64);
    expect(attempt?.address_hash).toHaveLength(64);
    expect(JSON.stringify(attempt)).not.toContain("Summit");
    expect(JSON.stringify(attempt)).not.toContain("203.0.113.7");
  });
});
