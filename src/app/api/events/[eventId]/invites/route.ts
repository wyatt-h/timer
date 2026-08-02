import { z } from "zod";
import { EventAuthError } from "@/lib/event-auth/errors";
import { createEventInvite, revokeEventInvite } from "@/lib/server/event-store";
import { apiError, apiSuccess, readJsonBody } from "@/lib/server/respond";
import {
  hashSessionToken,
  makeSessionToken,
  requireEventSession,
} from "@/lib/server/session";

const INVITE_TTL_SECONDS = 24 * 60 * 60;
const eventIdSchema = z.uuid();
const deleteSchema = z.object({ inviteId: z.uuid() });

type Context = { params: Promise<{ eventId: string }> };

async function eventIdFrom(context: Context) {
  const parsed = eventIdSchema.safeParse((await context.params).eventId);
  if (!parsed.success) throw new EventAuthError("invalid_request");
  return parsed.data;
}

function siteOrigin(request: Request) {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? request.url).origin;
  } catch {
    return new URL(request.url).origin;
  }
}

/** Creates one reusable 24-hour link and revokes any older outstanding link. */
export async function POST(request: Request, context: Context) {
  try {
    const eventId = await eventIdFrom(context);
    const { refresh } = await requireEventSession(eventId);
    const token = makeSessionToken();
    const invite = await createEventInvite({
      eventId,
      tokenHash: hashSessionToken(token),
      ttlSeconds: INVITE_TTL_SECONDS,
    });
    if (!invite) throw new EventAuthError("not_found");

    return apiSuccess(
      {
        ...invite,
        inviteUrl: `${siteOrigin(request)}/invite#${token}`,
      },
      [refresh],
      201,
    );
  } catch (error) {
    return apiError("invite-create", error);
  }
}

/** Revokes a link that has not expired or already been replaced. */
export async function DELETE(request: Request, context: Context) {
  try {
    const eventId = await eventIdFrom(context);
    const { refresh } = await requireEventSession(eventId);
    const parsed = deleteSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new EventAuthError("invalid_request");

    const revoked = await revokeEventInvite(eventId, parsed.data.inviteId);
    if (!revoked) throw new EventAuthError("not_found");
    return apiSuccess({ ok: true }, [refresh]);
  } catch (error) {
    return apiError("invite-revoke", error);
  }
}
