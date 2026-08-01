import { z } from "zod";
import { EventAuthError } from "@/lib/event-auth/errors";
import { formatRecoveryCode, makeRecoveryCode } from "@/lib/event-auth/recovery-code";
import { findAccessByEventId, rotateControllerRecoveryCode } from "@/lib/server/event-store";
import { hashSecret, verifySecret } from "@/lib/server/password";
import { clearAttempts, enforceRateLimit } from "@/lib/server/rate-limit";
import { apiError, apiSuccess, readJsonBody } from "@/lib/server/respond";
import { requireEventSession } from "@/lib/server/session";

/*
 * Issues a fresh recovery code for an event — for the case where the written-down
 * copy was lost, shared, or already used.
 *
 * A session is not enough on its own. The current password is required as well,
 * because a recovery code is a password-equivalent: minting one from a logged-in
 * tab left open on a shared machine would hand over permanent access to the event.
 * The attempt is rate-limited for the same reason a sign-in is.
 *
 * Replacing the stored hash is what invalidates the previous code; there is never
 * more than one live at a time. The replacement is returned here and nowhere else,
 * because only its hash is kept. Sessions are untouched: the password has not
 * changed, so no other device needs to be signed out.
 */

const bodySchema = z.object({
  eventId: z.uuid(),
  currentPassword: z.string().min(1).max(512),
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new EventAuthError("invalid_request");

    const { eventId } = parsed.data;
    const { refresh } = await requireEventSession(eventId);

    // Metered on the event id, which is what a session already proves knowledge of.
    await enforceRateLimit("rotate", eventId, request);

    const access = await findAccessByEventId(eventId);
    if (!access) throw new EventAuthError("not_found");
    if (!(await verifySecret(parsed.data.currentPassword, access.password_hash))) {
      throw new EventAuthError("invalid_credentials");
    }

    const recoveryCode = makeRecoveryCode();
    const result = await rotateControllerRecoveryCode({
      eventId,
      expectedVersion: access.password_version,
      recoveryCodeHash: await hashSecret(recoveryCode),
    });
    if (result.status === "not_found") throw new EventAuthError("not_found");
    if (result.status === "version_mismatch") throw new EventAuthError("invalid_credentials");

    // Best-effort: the session or the new code already exists, and failing to
    // tidy the limiter must not turn a completed operation into an error.
    try {
      await clearAttempts("rotate", eventId, request);
    } catch {
      // Intentionally ignored; the limiter self-expires.
    }

    return apiSuccess({ recoveryCode: formatRecoveryCode(recoveryCode) }, [refresh]);
  } catch (error) {
    return apiError("rotate-recovery", error);
  }
}
