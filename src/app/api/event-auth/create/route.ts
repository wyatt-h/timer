import { z } from "zod";
import { EventAuthError } from "@/lib/event-auth/errors";
import { eventPayloadSchema, toDatabaseEvent } from "@/lib/event-auth/event-payload";
import { isLoginName, normalizeLoginName } from "@/lib/event-auth/login-name";
import { passwordProblem } from "@/lib/event-auth/password-rules";
import { createControllerEvent } from "@/lib/server/event-store";
import { hashSecret } from "@/lib/server/password";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { apiError, apiFailure, apiSuccess, readJsonBody } from "@/lib/server/respond";
import { SESSION_TTL_SECONDS, prepareEventSession } from "@/lib/server/session";

/*
 * Creates an independent event and the controller credentials that own it.
 *
 * There is no team, no owner account and nothing to belong to: the request is the
 * event and the credentials for it, and that is the whole model. The event, its
 * credential record, its agenda, its speakers, its runtime and this device's
 * session are written by one transactional database function, so a half-created
 * event cannot exist.
 *
 * The event name itself is the sign-in identifier; no separate username or
 * recovery credential is created.
 */

const bodySchema = z.object({
  password: z.string().min(1).max(512),
  event: eventPayloadSchema,
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new EventAuthError("invalid_request");

    const loginName = normalizeLoginName(parsed.data.event.name);
    // Both rules are also CHECK constraints, so this is the useful 400 rather
    // than the only line of defence.
    if (!isLoginName(loginName)) throw new EventAuthError("invalid_request");
    if (passwordProblem(parsed.data.password)) throw new EventAuthError("invalid_request");

    // Public endpoint, so it is metered like the credential endpoints are.
    await enforceRateLimit("create", loginName, request);

    const passwordHash = await hashSecret(parsed.data.password);

    /*
     * The token is generated here and only its digest is sent to the database, so
     * the session row is created in the same commit as the event without the raw
     * token ever being stored.
     */
    const session = prepareEventSession(parsed.data.event.id);

    const result = await createControllerEvent({
      event: toDatabaseEvent(parsed.data.event),
      passwordHash,
      sessionTokenHash: session.tokenHash,
      sessionTtlSeconds: SESSION_TTL_SECONDS,
    });
    if (result.status === "login_taken") return apiFailure("login_taken");

    return apiSuccess(result.payload, [session.cookie], 201);
  } catch (error) {
    return apiError("create", error);
  }
}
