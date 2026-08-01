import type { SupabaseClient } from "@supabase/supabase-js";
import type { TimerEvent } from "@/lib/types";

/*
 * The two anonymous reads, and nothing else.
 *
 * Controller reads and writes go through the authenticated `/api` route handlers,
 * which reach the database as `service_role` inside one transaction per write.
 * `anon` and `authenticated` hold no privilege on any event table, so there is
 * nothing here for a browser-side client to write.
 *
 * Both lookups distinguish three answers, because collapsing them loses the one
 * piece of information the caller actually needs:
 *
 * - `found`      — this is the event; display it.
 * - `not-found`  — the database answered, and there is no such event. It was
 *                  deleted, or the token is wrong. Stale state must be cleared.
 * - `unavailable` — the request failed. Nothing is known. The last good state must
 *                  be kept, with a connection warning.
 *
 * Returning a bare `null` for the last two made a dropped connection look exactly
 * like a deleted event, so a display would blank itself on a blip and keep showing
 * a deleted event forever.
 */

export type PublicEventResult =
  | { status: "found"; event: TimerEvent }
  | { status: "not-found" }
  | { status: "unavailable" };

/**
 * Both public lookups return the same payload from the same database function,
 * so they share one mapper: timestamps arrive as ISO strings and become the
 * epoch milliseconds the rest of the application works in.
 */
function mapPublicPayload(data: unknown): TimerEvent {
  const payload = data as {
    event: TimerEvent & {
      runtime: TimerEvent["runtime"] & {
        endsAt: string | null;
        panelEndsAt: string | null;
        updatedAt: string;
      };
    };
  };
  return {
    ...payload.event,
    runtime: {
      ...payload.event.runtime,
      endsAt: payload.event.runtime.endsAt
        ? new Date(payload.event.runtime.endsAt).getTime()
        : null,
      panelEndsAt: payload.event.runtime.panelEndsAt
        ? new Date(payload.event.runtime.panelEndsAt).getTime()
        : null,
      updatedAt: new Date(payload.event.runtime.updatedAt).getTime(),
    },
  };
}

function interpret(data: unknown, error: unknown): PublicEventResult {
  // An error means the answer is unknown, which is not the same as "no".
  if (error) return { status: "unavailable" };
  // The function returns SQL NULL when no row matches, which is a real answer.
  if (!data) return { status: "not-found" };
  return { status: "found", event: mapPublicPayload(data) };
}

export async function pullPublicEvent(
  client: SupabaseClient,
  token: string,
): Promise<PublicEventResult> {
  try {
    const { data, error } = await client.rpc("get_public_event", { p_token: token });
    return interpret(data, error);
  } catch {
    // A thrown fetch is a lost connection, never a missing event.
    return { status: "unavailable" };
  }
}

/**
 * The same read, addressed by an event's Zoom pairing code. Read-only and
 * anonymous, exactly like the audience lookup — the Zoom App never writes.
 */
export async function pullZoomEvent(
  client: SupabaseClient,
  zoomToken: string,
): Promise<PublicEventResult> {
  try {
    const { data, error } = await client.rpc("get_zoom_event", { p_token: zoomToken });
    return interpret(data, error);
  } catch {
    return { status: "unavailable" };
  }
}
