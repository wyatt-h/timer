import { z } from "zod";
import { EventAuthError } from "@/lib/event-auth/errors";
import { apiError, apiSuccess, readJsonBody } from "@/lib/server/respond";
import { clearEventSessionCookie, revokeCurrentSession } from "@/lib/server/session";

/*
 * Signs out of exactly one event.
 *
 * Cookies are named after the event, so both the deleted session row and the
 * cleared cookie belong to this event alone: a browser authorized for three
 * events keeps the other two.
 *
 * No session check runs first: the call deletes the row matching the token the
 * caller already holds, which makes signing out of an already-expired session
 * succeed rather than fail.
 *
 * The cookie is cleared only once the row is gone. If the delete fails the error
 * is reported and the cookie is left alone, because clearing it while the database
 * session is still live would tell an operator a shared machine is safe when it is
 * not.
 */

const bodySchema = z.object({ eventId: z.uuid() });

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new EventAuthError("invalid_request");

    await revokeCurrentSession(parsed.data.eventId);

    return apiSuccess({ ok: true }, [clearEventSessionCookie(parsed.data.eventId)]);
  } catch (error) {
    return apiError("logout", error);
  }
}
