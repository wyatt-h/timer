/*
 * Event password rules, shared by the creation form and the route handlers
 * that are the actual authority.
 *
 * Nothing here trims or otherwise rewrites a password. A password that begins
 * or ends with a space is a password whose owner meant to type a space, and
 * silently removing it would lock them out of their own event from a second
 * device with no explanation.
 */

export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;

export function passwordProblem(value: string): string | null {
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Use ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

export function isPassword(value: string) {
  return passwordProblem(value) === null;
}
