/*
 * The code an operator copies from the control room and pastes into the Zoom
 * App. It is deliberately not the audience viewer token: the Zoom code is typed
 * into a cramped meeting side panel, and Zoom's meeting webview may not carry
 * the operator's browser session, so this doubles as the pairing mechanism.
 *
 * Crockford's base32 alphabet drops I, L, O and U, so no character in a code can
 * be misread as another. Ten characters is fifty bits — far more than a
 * read-only pairing code needs, while still fitting on one line.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TOKEN_LENGTH = 10;
const TOKEN_PATTERN = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/;

export function makeZoomToken() {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  // The alphabet length divides 256 exactly, so the remainder stays unbiased.
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

/**
 * Accept what somebody actually pastes: lower case, the display hyphen, a
 * stray space, and the three letters Crockford excludes because they look like
 * digits. Anything else is left in place so it fails validation visibly rather
 * than being silently corrected into a different event's code.
 */
export function normalizeZoomToken(value: string) {
  return value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .slice(0, TOKEN_LENGTH);
}

export function isZoomToken(value: string) {
  return TOKEN_PATTERN.test(value);
}

/** Grouped so it can be read aloud and checked by eye. */
export function formatZoomToken(token: string) {
  return `${token.slice(0, 5)}-${token.slice(5)}`;
}
