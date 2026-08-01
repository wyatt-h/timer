import { z } from "zod";
import { EventAuthError } from "@/lib/event-auth/errors";
import { eventPayloadSchema, toDatabaseEvent } from "@/lib/event-auth/event-payload";
import {
  deleteControllerEvent,
  loadControllerEvent,
  replaceControllerEvent,
} from "@/lib/server/event-store";
import { apiError, apiFailure, apiSuccess, readJsonBody } from "@/lib/server/respond";
import { clearEventSessionCookie, requireEventSession } from "@/lib/server/session";

/*
 * The controller's read and write path for one event.
 *
 * Every method proves a session for the event named in the URL before it touches
 * anything, and the id it proves is the id it acts on. A session for event A
 * presented against event B is refused; a guessed event id with no session behind
 * it is answered as "sign in", never with the event.
 *
 * Writes are one transaction each and carry the version the browser last read.
 * A mismatch is a 409 with the state that won, so a second device's work is never
 * silently overwritten.
 */

const eventIdSchema = z.uuid();

const putSchema = z.object({
  version: z.number().int().min(0),
  event: eventPayloadSchema,
});

type Context = { params: Promise<{ eventId: string }> };

async function resolveEventId(context: Context) {
  const { eventId } = await context.params;
  const parsed = eventIdSchema.safeParse(eventId);
  if (!parsed.success) throw new EventAuthError("invalid_request");
  return parsed.data;
}

export async function GET(_request: Request, context: Context) {
  try {
    const eventId = await resolveEventId(context);
    const { refresh } = await requireEventSession(eventId);

    const payload = await loadControllerEvent(eventId);
    if (!payload) throw new EventAuthError("not_found");

    // Re-sent so a month-long session keeps sliding while the event is in use.
    return apiSuccess(payload, [refresh]);
  } catch (error) {
    return apiError("event-get", error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const eventId = await resolveEventId(context);
    const { refresh } = await requireEventSession(eventId);

    const parsed = putSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new EventAuthError("invalid_request");
    /*
     * The document must be for the event the session covers. Without this a
     * caller authorized for one event could post another event's id and have the
     * database function write there instead.
     */
    if (parsed.data.event.id !== eventId) throw new EventAuthError("invalid_request");

    const result = await replaceControllerEvent(
      eventId,
      parsed.data.version,
      toDatabaseEvent(parsed.data.event),
    );
    if (result.status === "not_found") throw new EventAuthError("not_found");
    if (result.status === "conflict") {
      return apiFailure("conflict", { data: result.payload, cookies: [refresh] });
    }

    return apiSuccess(result.payload, [refresh]);
  } catch (error) {
    return apiError("event-put", error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const eventId = await resolveEventId(context);
    await requireEventSession(eventId);

    const deleted = await deleteControllerEvent(eventId);
    if (!deleted) throw new EventAuthError("not_found");

    /*
     * The rows are gone through `on delete cascade`, sessions included, so the
     * cookie is cleared too rather than left pointing at nothing.
     */
    return apiSuccess({ ok: true }, [clearEventSessionCookie(eventId)]);
  } catch (error) {
    return apiError("event-delete", error);
  }
}
