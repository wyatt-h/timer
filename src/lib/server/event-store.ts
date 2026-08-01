import "server-only";

import { EventAuthError } from "@/lib/event-auth/errors";
import { normalizeControllerPayload, type ControllerEvent } from "@/lib/event-auth/types";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/*
 * Controller credentials and the transactional event writers.
 *
 * Credential rows are read and written directly, because only `service_role`
 * can see the table at all. The event writes go through the `SECURITY DEFINER`
 * functions added by the controller-auth migration, so an event and its agenda,
 * speakers and runtime are replaced in one commit rather than by a series of
 * separately committed requests that could half-apply.
 *
 * Every function here takes the event id as an argument the caller has already
 * proved a session for. None of them derives its target from anything else the
 * browser supplied, and there is no membership or ownership table left that could
 * widen a write past the one event a session covers.
 */

export type EventAccessRow = {
  event_id: string;
  login_name: string;
  password_hash: string;
  password_version: number;
};

const ACCESS_COLUMNS = "event_id, login_name, password_hash, password_version";

/** Returns null for an unknown login name. The caller must not say which it was. */
export async function findAccessByLoginName(loginName: string): Promise<EventAccessRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("event_access")
    .select(ACCESS_COLUMNS)
    .eq("login_name", loginName)
    .maybeSingle();
  if (error) throw new EventAuthError("internal");
  return (data as EventAccessRow | null) ?? null;
}

export async function findAccessByEventId(eventId: string): Promise<EventAccessRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("event_access")
    .select(ACCESS_COLUMNS)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw new EventAuthError("internal");
  return (data as EventAccessRow | null) ?? null;
}

/*
 * Credential mutations, each one a single database transaction.
 *
 * A password change is five writes — new hash, version bump, every old session
 * deleted, the replacement session inserted — and none of them may happen without
 * the others. Done as separate statements, a failure in the middle could leave an
 * event with a new password and stale sessions still trusted, or with no session
 * at all and an operator locked out of the request they just made.
 *
 * The password itself is verified here in Node, because scrypt lives here.
 * `expectedVersion` is what makes that verification safe under concurrency: the
 * function locks the credential row and re-reads the version, so two simultaneous
 * changes cannot both believe they checked against the current secret.
 */

function payloadOrThrow(raw: unknown): ControllerEvent {
  const payload = normalizeControllerPayload(raw);
  if (!payload) throw new EventAuthError("internal");
  return payload;
}

export type CredentialResult =
  | { status: "ok"; passwordVersion: number; payload: ControllerEvent | null }
  | { status: "version_mismatch" }
  | { status: "not_found" };

function credentialResult(raw: unknown): CredentialResult {
  const result = raw as
    | { status?: string; passwordVersion?: number; payload?: unknown }
    | null;
  if (result?.status === "version_mismatch") return { status: "version_mismatch" };
  if (result?.status === "not_found") return { status: "not_found" };
  if (typeof result?.passwordVersion !== "number") throw new EventAuthError("internal");
  return {
    status: "ok",
    passwordVersion: result.passwordVersion,
    payload: result.payload ? payloadOrThrow(result.payload) : null,
  };
}

export async function changeControllerPassword(input: {
  eventId: string;
  expectedVersion: number;
  passwordHash: string;
  sessionTokenHash: string;
  sessionTtlSeconds: number;
}): Promise<CredentialResult> {
  const { data, error } = await supabaseAdmin().rpc("change_controller_password", {
    p_event_id: input.eventId,
    p_expected_version: input.expectedVersion,
    p_password_hash: input.passwordHash,
    p_token_hash: input.sessionTokenHash,
    p_ttl_seconds: input.sessionTtlSeconds,
  });
  if (error) throw new EventAuthError("internal");
  return credentialResult(data);
}

export type CreateResult =
  | { status: "created"; payload: ControllerEvent }
  | { status: "login_taken" };

export async function createControllerEvent(input: {
  event: unknown;
  passwordHash: string;
  /** The digest of the creating device's session token. The token stays in Node. */
  sessionTokenHash: string;
  sessionTtlSeconds: number;
}): Promise<CreateResult> {
  const { data, error } = await supabaseAdmin().rpc("create_controller_event", {
    p_event: input.event,
    p_password_hash: input.passwordHash,
    p_token_hash: input.sessionTokenHash,
    p_ttl_seconds: input.sessionTtlSeconds,
  });
  if (error) throw new EventAuthError("internal");
  const result = data as { status?: string; payload?: unknown } | null;
  if (result?.status === "login_taken") return { status: "login_taken" };
  if (result?.status !== "created") throw new EventAuthError("internal");
  return { status: "created", payload: payloadOrThrow(result.payload) };
}

/** Null means no such controller event, which is also the answer for a guessed id. */
export async function loadControllerEvent(eventId: string): Promise<ControllerEvent | null> {
  const { data, error } = await supabaseAdmin().rpc("controller_event_payload", {
    p_event_id: eventId,
  });
  if (error) throw new EventAuthError("internal");
  if (!data) return null;
  return normalizeControllerPayload(data);
}

export type ReplaceResult =
  | { status: "updated"; payload: ControllerEvent }
  /* The authoritative state comes back with the conflict so the browser can
   * show what actually happened instead of asking for it in a second round trip. */
  | { status: "conflict"; payload: ControllerEvent }
  | { status: "login_taken" }
  | { status: "not_found" };

export async function replaceControllerEvent(
  eventId: string,
  expectedVersion: number,
  event: unknown,
): Promise<ReplaceResult> {
  const { data, error } = await supabaseAdmin().rpc("replace_controller_event", {
    p_event_id: eventId,
    p_expected_version: expectedVersion,
    p_event: event,
  });
  if (error) throw new EventAuthError("internal");
  const result = data as { status?: string; payload?: unknown } | null;
  if (result?.status === "not_found") return { status: "not_found" };
  if (result?.status === "login_taken") return { status: "login_taken" };
  if (result?.status === "conflict") {
    return { status: "conflict", payload: payloadOrThrow(result.payload) };
  }
  if (result?.status !== "updated") throw new EventAuthError("internal");
  return { status: "updated", payload: payloadOrThrow(result.payload) };
}

export async function deleteControllerEvent(eventId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc("delete_controller_event", {
    p_event_id: eventId,
  });
  if (error) throw new EventAuthError("internal");
  return (data as { status?: string } | null)?.status === "deleted";
}

export type EventInvite = {
  inviteId: string;
  expiresAt: string;
};

/** Replaces any outstanding invitation for this event and returns its metadata. */
export async function createEventInvite(input: {
  eventId: string;
  tokenHash: string;
  ttlSeconds: number;
}): Promise<EventInvite | null> {
  const { data, error } = await supabaseAdmin().rpc("create_event_invite", {
    p_event_id: input.eventId,
    p_token_hash: input.tokenHash,
    p_ttl_seconds: input.ttlSeconds,
  });
  if (error) throw new EventAuthError("internal");
  const result = data as {
    status?: string;
    inviteId?: string;
    expiresAt?: string;
  } | null;
  if (result?.status === "not_found") return null;
  if (
    result?.status !== "created" ||
    typeof result.inviteId !== "string" ||
    typeof result.expiresAt !== "string"
  ) {
    throw new EventAuthError("internal");
  }
  return { inviteId: result.inviteId, expiresAt: result.expiresAt };
}

export async function revokeEventInvite(eventId: string, inviteId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc("revoke_event_invite", {
    p_event_id: eventId,
    p_invite_id: inviteId,
  });
  if (error) throw new EventAuthError("internal");
  return (data as { status?: string } | null)?.status === "revoked";
}

export async function redeemEventInvite(input: {
  tokenHash: string;
  sessionTokenHash: string;
  sessionTtlSeconds: number;
}): Promise<{ eventId: string; payload: ControllerEvent } | null> {
  const { data, error } = await supabaseAdmin().rpc("redeem_event_invite", {
    p_token_hash: input.tokenHash,
    p_session_token_hash: input.sessionTokenHash,
    p_session_ttl_seconds: input.sessionTtlSeconds,
  });
  if (error) throw new EventAuthError("internal");
  const result = data as { status?: string; eventId?: string; payload?: unknown } | null;
  if (result?.status === "invalid") return null;
  if (result?.status !== "redeemed" || typeof result.eventId !== "string") {
    throw new EventAuthError("internal");
  }
  return { eventId: result.eventId, payload: payloadOrThrow(result.payload) };
}
