import { z } from "zod";
import { EventAuthError } from "@/lib/event-auth/errors";
import { passwordProblem } from "@/lib/event-auth/password-rules";
import { changeControllerPassword, findAccessByEventId } from "@/lib/server/event-store";
import { hashSecret, verifySecret } from "@/lib/server/password";
import { apiError, apiSuccess, readJsonBody } from "@/lib/server/respond";
import {
  SESSION_TTL_SECONDS,
  prepareEventSession,
  requireEventSession,
} from "@/lib/server/session";

/*
 * Changes an event's controller password from a device that already holds a
 * session for it, and asks for the current password as well — a borrowed
 * logged-in browser should not be enough to take an event over.
 *
 * One transaction writes the new hash, bumps the version, deletes every session
 * for the event, and inserts this device's replacement. Every other device is
 * signed out, which is usually the reason for changing a password; this one is
 * not, because the response carries a cookie for the session created in that same
 * commit.
 */

const bodySchema = z.object({
  eventId: z.uuid(),
  currentPassword: z.string().min(1).max(512),
  newPassword: z.string().min(1).max(512),
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new EventAuthError("invalid_request");
    if (passwordProblem(parsed.data.newPassword)) throw new EventAuthError("invalid_request");

    const { eventId } = parsed.data;
    await requireEventSession(eventId);

    const access = await findAccessByEventId(eventId);
    if (!access) throw new EventAuthError("not_found");
    if (!(await verifySecret(parsed.data.currentPassword, access.password_hash))) {
      throw new EventAuthError("invalid_credentials");
    }

    const session = prepareEventSession(eventId);
    const result = await changeControllerPassword({
      eventId,
      expectedVersion: access.password_version,
      passwordHash: await hashSecret(parsed.data.newPassword),
      sessionTokenHash: session.tokenHash,
      sessionTtlSeconds: SESSION_TTL_SECONDS,
    });
    if (result.status === "not_found") throw new EventAuthError("not_found");
    if (result.status === "version_mismatch") {
      // The password changed under this request. The check just performed was
      // against a secret that is no longer current, so it proves nothing.
      throw new EventAuthError("invalid_credentials");
    }

    return apiSuccess({ ok: true }, [session.cookie]);
  } catch (error) {
    return apiError("change-password", error);
  }
}
