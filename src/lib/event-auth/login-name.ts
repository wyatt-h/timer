/*
 * An event login name is separate from its display name. The database stores a
 * canonical lowercase form so capitalization and repeated whitespace do not
 * accidentally create two credentials that look identical to a person.
 *
 * The same constraints are written into `event_access` as a CHECK, so a value
 * that slipped past this module would still be refused by the database.
 */

export const LOGIN_NAME_MIN_LENGTH = 1;
export const LOGIN_NAME_MAX_LENGTH = 120;

/**
 * Case and surrounding whitespace are accidents of typing rather than part of
 * the name, so both are removed before anything else looks at the value. A name
 * cannot contain a space, so trimming one can never change which event is
 * addressed.
 */
export function normalizeLoginName(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

/** The reason a name is unusable, phrased for the person typing it. */
export function loginNameProblem(value: string): string | null {
  const name = normalizeLoginName(value);
  if (name.length < LOGIN_NAME_MIN_LENGTH) {
    return `Use at least ${LOGIN_NAME_MIN_LENGTH} characters.`;
  }
  if (name.length > LOGIN_NAME_MAX_LENGTH) {
    return `Use ${LOGIN_NAME_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

export function isLoginName(value: string) {
  return loginNameProblem(value) === null;
}

/**
 * What a name field should hold as somebody types. Uppercase is folded rather
 * than rejected, because typing a capital is a habit and not a mistake; every
 * other disallowed character is dropped so the field can never hold a value the
 * server would refuse.
 */
export function sanitizeLoginNameInput(value: string) {
  return value.toLowerCase().slice(0, LOGIN_NAME_MAX_LENGTH);
}
