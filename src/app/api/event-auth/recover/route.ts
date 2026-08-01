import { z } from "zod";
import { EventAuthError } from "@/lib/event-auth/errors";
import { isLoginName, normalizeLoginName } from "@/lib/event-auth/login-name";
import { passwordProblem } from "@/lib/event-auth/password-rules";
import {
  formatRecoveryCode,
  makeRecoveryCode,
  normalizeRecoveryCode,
} from "@/lib/event-auth/recovery-code";
import { findAccessByLoginName, recoverControllerPassword } from "@/lib/server/event-store";
import { hashSecret, verifyAgainstDecoy, verifySecret } from "@/lib/server/password";
import { clearAttempts, enforceRateLimit } from "@/lib/server/rate-limit";
import { apiError, apiSuccess, readJsonBody } from "@/lib/server/respond";
import { SESSION_TTL_SECONDS, prepareEventSession } from "@/lib/server/session";

/*
 * The only way back into an event whose controller password has been forgotten:
 * the login name, the recovery code that was shown once, and a new password.
 *
 * One transaction does all of it — the new password hash, a rotated recovery code
 * so the piece of paper that was just used cannot be used again, the version bump
 * that retires every session issued against the old secret, the deletion of those
 * sessions, and this device's replacement session. None of that can half-apply.
 *
 * There is no third factor. Losing both the password and the recovery code means
 * the event cannot be recovered, which is the stated cost of an event that needs
 * no account.
 */

const bodySchema = z.object({
  loginName: z.string().min(1).max(200),
  recoveryCode: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(512),
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new EventAuthError("invalid_request");

    // The new password is the caller's own choice, so a bad one is a malformed
    // request rather than a failed credential check.
    if (passwordProblem(parsed.data.newPassword)) throw new EventAuthError("invalid_request");

    const loginName = normalizeLoginName(parsed.data.loginName);
    const recoveryCode = normalizeRecoveryCode(parsed.data.recoveryCode);

    await enforceRateLimit("recover", loginName, request);

    const access = isLoginName(loginName) ? await findAccessByLoginName(loginName) : null;
    if (!access) {
      await verifyAgainstDecoy(recoveryCode);
      throw new EventAuthError("invalid_credentials");
    }
    if (!(await verifySecret(recoveryCode, access.recovery_code_hash))) {
      throw new EventAuthError("invalid_credentials");
    }

    const nextRecoveryCode = makeRecoveryCode();
    const [passwordHash, recoveryCodeHash] = await Promise.all([
      hashSecret(parsed.data.newPassword),
      hashSecret(nextRecoveryCode),
    ]);
    const session = prepareEventSession(access.event_id);

    const result = await recoverControllerPassword({
      eventId: access.event_id,
      // The version verified against a moment ago. The function locks the row and
      // re-reads it, so a simultaneous change makes this fail rather than race.
      expectedVersion: access.password_version,
      passwordHash,
      recoveryCodeHash,
      sessionTokenHash: session.tokenHash,
      sessionTtlSeconds: SESSION_TTL_SECONDS,
    });
    if (result.status === "not_found") throw new EventAuthError("not_found");
    if (result.status === "version_mismatch") {
      // Somebody else changed the password between the check and the write.
      throw new EventAuthError("invalid_credentials");
    }
    /*
     * The payload came back from the transaction itself. There is deliberately no
     * second database read between the commit and this response: the password and
     * the recovery code have already changed, and a failure here would hand the
     * caller an error while destroying the only copy of the new recovery code.
     */
    if (!result.payload) throw new EventAuthError("internal");

    // Best-effort, and after the point of no return. A failure to tidy the
    // rate-limit rows must not cost the caller their recovery code.
    try {
      await clearAttempts("recover", loginName, request);
    } catch {
      // Intentionally ignored; the limiter self-expires.
    }

    return apiSuccess(
      { ...result.payload, recoveryCode: formatRecoveryCode(nextRecoveryCode) },
      [session.cookie],
    );
  } catch (error) {
    return apiError("recover", error);
  }
}
