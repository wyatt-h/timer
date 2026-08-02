/*
 * An event login name is separate from its display name. The database stores a
 * canonical lowercase form. New events use a URL-slug shape: lowercase letters
 * and numbers separated by single dashes. The more permissive lookup helper is
 * retained only so events created before this rule can still be opened.
 *
 * A database CHECK enforces the strict shape for every new credential row, so a
 * value that slipped past this module would still be refused.
 */

export const LOGIN_NAME_MIN_LENGTH = 1;
export const LOGIN_NAME_MAX_LENGTH = 120;

/**
 * Case, surrounding whitespace, and repeated legacy whitespace are accidents of
 * typing rather than part of the stored key, so they are normalized before a
 * strict creation check or a backwards-compatible lookup.
 */
export function normalizeLoginName(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

/** The reason a name is unusable, phrased for the person typing it. */
export function loginNameProblem(value: string): string | null {
  const name = normalizeLoginName(value);
  if (name.length < LOGIN_NAME_MIN_LENGTH) {
    return "Enter an event login name.";
  }
  if (name.length > LOGIN_NAME_MAX_LENGTH) {
    return `Use ${LOGIN_NAME_MAX_LENGTH} characters or fewer.`;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name)) {
    return "Use lowercase letters, numbers, and single dashes only.";
  }
  return null;
}

export function isLoginName(value: string) {
  return loginNameProblem(value) === null;
}

/**
 * Existing credentials may predate the slug rule. Sign-in accepts their old
 * canonical shape, but event creation never calls this compatibility helper.
 */
export function isLoginNameLookup(value: string) {
  const name = normalizeLoginName(value);
  return name.length >= LOGIN_NAME_MIN_LENGTH && name.length <= LOGIN_NAME_MAX_LENGTH;
}

/**
 * What a new-event field should hold as somebody types. Uppercase is folded,
 * spaces and punctuation are removed, and repeated dashes collapse. A trailing
 * dash remains while typing so someone can enter the next word naturally; final
 * validation rejects it until another letter or number follows.
 */
export function sanitizeLoginNameInput(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/gu, "")
    .replace(/-{2,}/gu, "-")
    .replace(/^-+/u, "")
    .slice(0, LOGIN_NAME_MAX_LENGTH);
}

/** A valid initial suggestion for bulk-imported event titles. */
export function suggestLoginName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, LOGIN_NAME_MAX_LENGTH)
    .replace(/-+$/u, "");
}
