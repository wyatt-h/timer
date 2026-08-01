import { NextResponse } from "next/server";
import {
  EventAuthError,
  NO_STORE_HEADERS,
  logInternal,
  messageForCode,
  statusForCode,
  type EventAuthErrorCode,
} from "@/lib/event-auth/errors";
import type { CookieInstruction } from "@/lib/server/session";

/*
 * One response shape for the whole controller API, so no handler can forget the
 * two things every one of them needs: `Cache-Control: no-store`, and an error
 * body that carries a code the browser can branch on but no detail a caller
 * could learn something from.
 */

export type ApiFailure = {
  error: EventAuthErrorCode;
  message: string;
  retryAfterSeconds?: number;
};

function withCookies(response: NextResponse, cookies: CookieInstruction[]) {
  for (const cookie of cookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}

export function apiSuccess<T extends object>(
  body: T,
  cookies: CookieInstruction[] = [],
  status = 200,
) {
  return withCookies(
    NextResponse.json(body, { status, headers: NO_STORE_HEADERS }),
    cookies,
  );
}

export function apiFailure(
  code: EventAuthErrorCode,
  options: {
    retryAfterSeconds?: number;
    cookies?: CookieInstruction[];
    /*
     * Only ever authoritative state the caller is already authorized to read —
     * a version conflict returns the event that won. Never credential detail.
     */
    data?: object;
  } = {},
) {
  const body: ApiFailure & Record<string, unknown> = {
    error: code,
    message: messageForCode(code),
    ...options.data,
  };
  const headers: Record<string, string> = { ...NO_STORE_HEADERS };
  if (options.retryAfterSeconds !== undefined) {
    body.retryAfterSeconds = options.retryAfterSeconds;
    headers["Retry-After"] = String(options.retryAfterSeconds);
  }
  return withCookies(
    NextResponse.json(body, { status: statusForCode(code), headers }),
    options.cookies ?? [],
  );
}

/**
 * The single catch for every handler. An `EventAuthError` is a decision this
 * code made and is reported as such; anything else is a bug or an outage, which
 * the caller learns nothing about beyond a 500.
 */
export function apiError(scope: string, error: unknown) {
  if (error instanceof EventAuthError) {
    if (error.code === "internal" || error.code === "unavailable") logInternal(scope, error);
    return apiFailure(error.code, { retryAfterSeconds: error.retryAfterSeconds });
  }
  logInternal(scope, error);
  return apiFailure("internal");
}

/** A body that is not JSON is a malformed request, not a crash. */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new EventAuthError("invalid_request");
  }
}
