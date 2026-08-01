import { z } from "zod";
import { EventAuthError } from "@/lib/event-auth/errors";
import { isLoginName, normalizeLoginName } from "@/lib/event-auth/login-name";
import { findAccessByLoginName, loadControllerEvent } from "@/lib/server/event-store";
import { verifyAgainstDecoy, verifySecret } from "@/lib/server/password";
import { clearAttempts, enforceRateLimit } from "@/lib/server/rate-limit";
import { apiError, apiSuccess, readJsonBody } from "@/lib/server/respond";
import { issueEventSession } from "@/lib/server/session";

/*
 * Opens one event from any device with its lowercase login name and password.
 *
 * The body carries no event id, and the response reveals no event the caller did
 * not just prove they hold the credentials for. An unknown username and a wrong
 * password take the same path, cost the same scrypt derivation, and produce the
 * same 401 with the same message, so this endpoint cannot be used to find out
 * which event names exist.
 */

const bodySchema = z.object({
  loginName: z.string().min(1).max(200),
  password: z.string().min(1).max(512),
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new EventAuthError("invalid_request");

    const loginName = normalizeLoginName(parsed.data.loginName);
    const password = parsed.data.password;

    await enforceRateLimit("login", loginName, request);

    /*
     * A name that cannot satisfy the rules cannot exist, but it is answered as a
     * failed sign-in rather than a malformed request: the shape of a username is
     * not something a failed attempt should confirm.
     */
    const access = isLoginName(loginName) ? await findAccessByLoginName(loginName) : null;
    if (!access) {
      await verifyAgainstDecoy(password);
      throw new EventAuthError("invalid_credentials");
    }

    if (!(await verifySecret(password, access.password_hash))) {
      throw new EventAuthError("invalid_credentials");
    }

    const payload = await loadControllerEvent(access.event_id);
    if (!payload) throw new EventAuthError("internal");

    const cookie = await issueEventSession(access.event_id, access.password_version);
    // Best-effort: the session or the new code already exists, and failing to
    // tidy the limiter must not turn a completed operation into an error.
    try {
      await clearAttempts("login", loginName, request);
    } catch {
      // Intentionally ignored; the limiter self-expires.
    }

    return apiSuccess(payload, [cookie]);
  } catch (error) {
    return apiError("login", error);
  }
}
