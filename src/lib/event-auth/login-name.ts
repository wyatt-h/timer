/*
 * Controller login names are the whole identity of an event's control access:
 * they are globally unique, so a login form needs nothing but a name and a
 * password. That makes the rules worth stating once, here, rather than in a
 * route handler and again in a form.
 *
 * The same constraints are written into `event_access` as a CHECK, so a value
 * that slipped past this module would still be refused by the database.
 */

export const LOGIN_NAME_MIN_LENGTH = 3;
export const LOGIN_NAME_MAX_LENGTH = 48;

const ALLOWED_CHARACTERS = /^[a-z0-9-]+$/;
const FIRST_CHARACTER = /^[a-z0-9]/;

/**
 * Case and surrounding whitespace are accidents of typing rather than part of
 * the name, so both are removed before anything else looks at the value. A name
 * cannot contain a space, so trimming one can never change which event is
 * addressed.
 */
export function normalizeLoginName(value: string) {
  return value.trim().toLowerCase();
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
  if (!FIRST_CHARACTER.test(name)) {
    return "Start with a lowercase letter or a number.";
  }
  if (!ALLOWED_CHARACTERS.test(name)) {
    return "Use lowercase letters, numbers, and hyphens only.";
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
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, LOGIN_NAME_MAX_LENGTH);
}
