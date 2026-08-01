/*
 * Every public failure this API can report, and the exact status and message
 * that goes with it.
 *
 * Two properties matter here. A caller never learns anything from the message
 * that it could not already have guessed — an unknown login name and a wrong
 * password are indistinguishable — and a database error never reaches the
 * response, because a PostgreSQL message can name tables, columns and
 * constraints.
 */

export type EventAuthErrorCode =
  | "invalid_request"
  | "invalid_credentials"
  | "session_required"
  | "wrong_event"
  | "not_found"
  | "conflict"
  | "login_taken"
  | "rate_limited"
  | "unavailable"
  | "internal";

const STATUS: Record<EventAuthErrorCode, number> = {
  invalid_request: 400,
  invalid_credentials: 401,
  session_required: 401,
  wrong_event: 403,
  not_found: 404,
  conflict: 409,
  login_taken: 409,
  rate_limited: 429,
  unavailable: 503,
  internal: 500,
};

const MESSAGE: Record<EventAuthErrorCode, string> = {
  invalid_request: "That request could not be understood.",
  // Deliberately identical for an unknown login name and a wrong password.
  invalid_credentials: "That username and password do not match an event.",
  session_required: "Sign in to this event again.",
  wrong_event: "This session is not for that event.",
  not_found: "That event could not be found.",
  conflict: "This event changed somewhere else. Reloading the latest version.",
  login_taken: "That controller username is already in use.",
  rate_limited: "Too many attempts. Wait a moment and try again.",
  unavailable: "Event storage is not configured.",
  internal: "Something went wrong saving that.",
};

export class EventAuthError extends Error {
  readonly code: EventAuthErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(code: EventAuthErrorCode, retryAfterSeconds?: number) {
    // The internal message is the code, never a database or credential detail.
    super(code);
    this.name = "EventAuthError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function statusForCode(code: EventAuthErrorCode) {
  return STATUS[code];
}

export function messageForCode(code: EventAuthErrorCode) {
  return MESSAGE[code];
}

/*
 * Controller and credential responses are never cached, by a browser or by any
 * proxy between one. A cached session response on a shared machine would hand
 * the next person an event they were never authorized for.
 */
export const NO_STORE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

/**
 * Records that something failed without recording what. Passwords, hashes,
 * session tokens and recovery codes are never arguments to this function, and
 * the caught value is reduced to a type name and a short message.
 */
export function logInternal(scope: string, error: unknown) {
  const detail =
    error instanceof EventAuthError
      ? error.code
      : error instanceof Error
        ? `${error.name}: ${error.message.slice(0, 200)}`
        : "unknown";
  console.error(`[event-auth] ${scope}: ${detail}`);
}
