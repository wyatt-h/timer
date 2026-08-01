import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pullPublicEvent, pullZoomEvent } from "@/lib/supabase/remote";

/*
 * The two anonymous read paths, which this change deliberately leaves alone.
 *
 * An audience display and the Zoom App hold no controller session and no
 * credentials. Each reads one event through one security-definer function,
 * addressed by an unguessable token, and neither ever writes. These tests pin
 * the function names, the argument names and the payload mapping, because a
 * rename on either side would take every audience screen down.
 */

const PAYLOAD = {
  event: {
    id: "11111111-2222-4333-8444-555555555555",
    name: "Leadership Summit",
    date: "2026-08-01",
    status: "live",
    viewerToken: "66666666-7777-4888-8999-aaaaaaaaaaaa",
    createdAt: 1_754_000_000_000,
    agenda: [
      {
        id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
        kind: "single",
        host: null,
        soundMuted: null,
        durationSeconds: 600,
        speakerDefaultSeconds: null,
        speakers: [
          {
            id: "cccccccc-dddd-4eee-8fff-000000000000",
            name: "Maya Chen",
            durationSeconds: 600,
            soundMuted: null,
          },
        ],
      },
    ],
    runtime: {
      status: "running",
      segmentIndex: 0,
      remainingSeconds: 540,
      // timestamptz inside jsonb, exactly as PostgREST returns it.
      endsAt: "2026-08-01T10:09:00.000Z",
      panelStatus: null,
      panelRemainingSeconds: null,
      panelEndsAt: null,
      soundEnabled: true,
      updatedAt: "2026-08-01T10:00:00.000Z",
    },
  },
};

function clientReturning(data: unknown, error: unknown = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("audience lookup", () => {
  it("reads one event through get_public_event, by viewer token", async () => {
    const { client, rpc } = clientReturning(PAYLOAD);

    const result = await pullPublicEvent(client, "66666666-7777-4888-8999-aaaaaaaaaaaa");

    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_public_event", {
      p_token: "66666666-7777-4888-8999-aaaaaaaaaaaa",
    });
    expect(result.status).toBe("found");
    expect(result.status === "found" && result.event.name).toBe("Leadership Summit");
    // No team property survives anywhere in the payload.
    expect(JSON.stringify(result)).not.toMatch(/team/i);
  });

  it("converts the durable clock to epoch milliseconds", async () => {
    const { client } = clientReturning(PAYLOAD);

    const result = await pullPublicEvent(client, "token");

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.event.runtime.endsAt).toBe(Date.parse("2026-08-01T10:09:00.000Z"));
    expect(result.event.runtime.updatedAt).toBe(Date.parse("2026-08-01T10:00:00.000Z"));
    expect(result.event.runtime.panelEndsAt).toBeNull();
  });

  it("reports not-found when the database answers that nothing matches", async () => {
    const { client } = clientReturning(null);
    await expect(pullPublicEvent(client, "not-a-real-token")).resolves.toEqual({
      status: "not-found",
    });
  });

  it("reports unavailable when the lookup itself fails", async () => {
    const { client } = clientReturning(null, { message: "boom" });
    // Distinct from not-found: nothing is known, so the caller must keep what it
    // has rather than blanking a display on a blip.
    await expect(pullPublicEvent(client, "token")).resolves.toEqual({ status: "unavailable" });
  });

  it("reports unavailable when the request throws outright", async () => {
    const client = {
      rpc: async () => {
        throw new TypeError("Failed to fetch");
      },
    } as unknown as SupabaseClient;
    await expect(pullPublicEvent(client, "token")).resolves.toEqual({ status: "unavailable" });
  });
});

describe("Zoom pairing-code lookup", () => {
  it("reads the same payload through get_zoom_event, by pairing code", async () => {
    const { client, rpc } = clientReturning(PAYLOAD);

    const result = await pullZoomEvent(client, "ABCDE12345");

    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_zoom_event", { p_token: "ABCDE12345" });
    expect(result.status === "found" && result.event.id).toBe(PAYLOAD.event.id);
  });

  it("maps the payload identically to the audience path", async () => {
    const audience = await pullPublicEvent(clientReturning(PAYLOAD).client, "token");
    const zoom = await pullZoomEvent(clientReturning(PAYLOAD).client, "ABCDE12345");

    // One function, one payload shape: the two lookups cannot drift apart.
    expect(zoom).toEqual(audience);
  });

  it("reports not-found for a code that matches nothing", async () => {
    const { client } = clientReturning(null);
    await expect(pullZoomEvent(client, "ZZZZZ99999")).resolves.toEqual({ status: "not-found" });
  });

  it("reports unavailable when the Zoom lookup fails", async () => {
    const { client } = clientReturning(null, { message: "boom" });
    await expect(pullZoomEvent(client, "ABCDE12345")).resolves.toEqual({ status: "unavailable" });
  });
});
