import { z } from "zod";
import { EventAuthError } from "@/lib/event-auth/errors";
import { redeemEventInvite } from "@/lib/server/event-store";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { apiError, apiSuccess, readJsonBody } from "@/lib/server/respond";
import {
  hashSessionToken,
  makeSessionToken,
  prepareEventSessionWithToken,
  SESSION_TTL_SECONDS,
} from "@/lib/server/session";

const bodySchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });

/** Exchanges a one-time bearer token for a normal event-scoped session. */
export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new EventAuthError("invalid_invite");
    const tokenHash = hashSessionToken(parsed.data.token);
    await enforceRateLimit("invite", tokenHash, request);

    const sessionToken = makeSessionToken();
    const result = await redeemEventInvite({
      tokenHash,
      sessionTokenHash: hashSessionToken(sessionToken),
      sessionTtlSeconds: SESSION_TTL_SECONDS,
    });
    if (!result) throw new EventAuthError("invalid_invite");

    const session = prepareEventSessionWithToken(result.eventId, sessionToken);
    return apiSuccess(result.payload, [session.cookie]);
  } catch (error) {
    return apiError("invite-redeem", error);
  }
}
