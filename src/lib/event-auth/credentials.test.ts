import { describe, expect, it } from "vitest";
import {
  LOGIN_NAME_MAX_LENGTH,
  isLoginName,
  loginNameProblem,
  normalizeLoginName,
  sanitizeLoginNameInput,
} from "@/lib/event-auth/login-name";
import { isPassword, passwordProblem } from "@/lib/event-auth/password-rules";

/*
 * These rules are also CHECK constraints on `event_access`, so the pattern here
 * has to stay the same shape as the one in the migration: one to one hundred and
 * twenty characters after trimming, whitespace folding, and lowercasing.
 */
describe("controller login names", () => {
  it("folds case and surrounding whitespace before judging a name", () => {
    expect(normalizeLoginName("  Global   Call  ")).toBe("global call");
    expect(normalizeLoginName("LEADERSHIP")).toBe("leadership");
    expect(isLoginName("  Summit  ")).toBe(true);
  });

  it("accepts the shapes the database accepts", () => {
    for (const name of ["A", "Global Call", "9 lives", "Leadership ✨", "a".repeat(120)]) {
      expect(loginNameProblem(name), name).toBeNull();
    }
  });

  it("rejects the shapes the database would refuse", () => {
    expect(loginNameProblem("   ")).toMatch(/at least 1/);
    expect(loginNameProblem("a".repeat(121))).toMatch(/120 characters or fewer/);
  });

  it("keeps a field from ever holding a value the server would refuse", () => {
    expect(sanitizeLoginNameInput("Summit 2026!")).toBe("summit 2026!");
    expect(sanitizeLoginNameInput("a".repeat(140))).toHaveLength(LOGIN_NAME_MAX_LENGTH);
  });
});

describe("controller passwords", () => {
  it("requires six characters and allows a hundred and twenty-eight", () => {
    expect(passwordProblem("a".repeat(5))).toMatch(/at least 6/);
    expect(passwordProblem("a".repeat(6))).toBeNull();
    expect(passwordProblem("a".repeat(128))).toBeNull();
    expect(passwordProblem("a".repeat(129))).toMatch(/128 characters or fewer/);
  });

  it("counts surrounding spaces rather than trimming them away", () => {
    // Four characters plus two spaces is a six-character password, and the
    // spaces are part of it. Trimming would lock the owner out from a second
    // device with no explanation.
    expect(isPassword(" abcd ")).toBe(true);
    expect(isPassword(" abc ")).toBe(false);
  });
});
