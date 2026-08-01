"use client";

import type { EventAuthErrorCode } from "@/lib/event-auth/errors";
import type { ControllerEvent } from "@/lib/event-auth/types";
import type { TimerEvent } from "@/lib/types";

/*
 * The browser's side of the controller API.
 *
 * Nothing in this module holds a credential. The session lives in an HTTP-only
 * cookie the browser attaches on its own, which is why every call is a plain
 * same-origin fetch with no Authorization header to forget.
 *
 * Failures are returned rather than thrown, because every caller has a state to
 * show for them: a wrong password is a message under a field, a lost network is
 * an "Offline" badge, and a version conflict is a refetch.
 */

export type ApiFailureCode = EventAuthErrorCode | "network";

export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: ApiFailureCode;
      message: string;
      retryAfterSeconds?: number;
      /** Authoritative state that came back with a 409. */
      payload?: ControllerEvent | null;
    };

const OFFLINE_MESSAGE = "No connection. Changes are kept on this device until it returns.";

function readPayload(body: unknown): ControllerEvent | null {
  if (!body || typeof body !== "object") return null;
  const candidate = body as Partial<ControllerEvent>;
  if (!candidate.event || typeof candidate.version !== "number") return null;
  return {
    version: candidate.version,
    loginName: candidate.loginName ?? "",
    event: candidate.event,
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    return { ok: false, code: "network", message: OFFLINE_MESSAGE };
  }

  const body = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & { error?: EventAuthErrorCode; message?: string })
    | null;

  if (!response.ok) {
    return {
      ok: false,
      code: body?.error ?? "internal",
      message: body?.message ?? "Something went wrong.",
      retryAfterSeconds:
        typeof body?.retryAfterSeconds === "number" ? body.retryAfterSeconds : undefined,
      payload: readPayload(body),
    };
  }

  return { ok: true, data: body as T };
}

export function createControllerEvent(input: {
  password: string;
  event: TimerEvent;
}) {
  return request<ControllerEvent>("/api/event-auth/create", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function loginToEvent(eventName: string, password: string) {
  return request<ControllerEvent>("/api/event-auth/login", {
    method: "POST",
    body: JSON.stringify({ eventName, password }),
  });
}

export function logoutOfEvent(eventId: string) {
  return request<{ ok: true }>("/api/event-auth/logout", {
    method: "POST",
    body: JSON.stringify({ eventId }),
  });
}

export function changeControllerPassword(input: {
  eventId: string;
  currentPassword: string;
  newPassword: string;
}) {
  return request<{ ok: true }>("/api/event-auth/change-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchControllerEvent(eventId: string) {
  return request<ControllerEvent>(`/api/events/${eventId}`);
}

export function saveControllerEvent(eventId: string, version: number, event: TimerEvent) {
  return request<ControllerEvent>(`/api/events/${eventId}`, {
    method: "PUT",
    body: JSON.stringify({ version, event }),
  });
}

export function deleteControllerEvent(eventId: string) {
  return request<{ ok: true }>(`/api/events/${eventId}`, { method: "DELETE" });
}

export type EventInvite = {
  inviteId: string;
  inviteUrl: string;
  expiresAt: string;
};

export function createEventInvite(eventId: string) {
  return request<EventInvite>(`/api/events/${eventId}/invites`, { method: "POST" });
}

export function revokeEventInvite(eventId: string, inviteId: string) {
  return request<{ ok: true }>(`/api/events/${eventId}/invites`, {
    method: "DELETE",
    body: JSON.stringify({ inviteId }),
  });
}

export function redeemEventInvite(token: string) {
  return request<ControllerEvent>("/api/event-auth/redeem-invite", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}
