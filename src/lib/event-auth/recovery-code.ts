/*
 * The one secret an operator is asked to write down. It replaces a forgotten
 * controller password, and losing it together with the password means the event
 * cannot be recovered at all — there is no email address to fall back on.
 *
 * Crockford's base32 alphabet drops I, L, O and U, so no character in a code can
 * be misread as another when it is copied off a screen onto paper. Twenty-five
 * characters is 125 bits, which is far beyond guessing.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 25;
const GROUP_SIZE = 5;
const CODE_PATTERN = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{25}$/;

/** Generated only on the server; the browser never mints its own. */
export function makeRecoveryCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  // The alphabet length divides 256 exactly, so the remainder stays unbiased.
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

/**
 * Accept what somebody actually types back: lower case, the display hyphens, a
 * stray space, and the three letters Crockford excludes because they look like
 * digits.
 */
export function normalizeRecoveryCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .slice(0, CODE_LENGTH);
}

export function isRecoveryCode(value: string) {
  return CODE_PATTERN.test(value);
}

/** Grouped so it can be read aloud, checked by eye, and copied by hand. */
export function formatRecoveryCode(code: string) {
  const groups: string[] = [];
  for (let index = 0; index < code.length; index += GROUP_SIZE) {
    groups.push(code.slice(index, index + GROUP_SIZE));
  }
  return groups.join("-");
}
