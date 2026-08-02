import { describe, expect, it } from "vitest";
import {
  LOGIN_NAME_MAX_LENGTH,
  isLoginName,
  isLoginNameLookup,
  loginNameProblem,
  normalizeLoginName,
  sanitizeLoginNameInput,
  suggestLoginName,
} from "@/lib/event-auth/login-name";
import { isPassword, passwordProblem } from "@/lib/event-auth/password-rules";

/*
 * These rules are also CHECK constraints on `event_access`, so the pattern here
 * has to stay the same shape as the database's new-row constraint.
 */
describe("controller login names", () => {
  it("folds case and surrounding whitespace before judging a name", () => {
    expect(normalizeLoginName("  Global   Call  ")).toBe("global call");
    expect(normalizeLoginName("LEADERSHIP")).toBe("leadership");
    expect(isLoginName("  Summit  ")).toBe(true);
  });

  it("accepts the shapes the database accepts", () => {
    for (const name of ["A", "global-call", "9-lives", "a".repeat(120)]) {
      expect(loginNameProblem(name), name).toBeNull();
    }
  });

  it("rejects the shapes the database would refuse", () => {
    expect(loginNameProblem("   ")).toMatch(/enter an event login name/i);
    expect(loginNameProblem("a".repeat(121))).toMatch(/120 characters or fewer/);
    for (const name of ["global call", "leadership✨", "-start", "end-", "two--dashes", "under_score"]) {
      expect(loginNameProblem(name), name).toMatch(/letters, numbers, and single dashes/i);
    }
  });

  it("keeps a field from ever holding a value the server would refuse", () => {
    expect(sanitizeLoginNameInput("Summit 2026!")).toBe("summit2026");
    expect(sanitizeLoginNameInput("--summit---west")).toBe("summit-west");
    expect(sanitizeLoginNameInput("a".repeat(140))).toHaveLength(LOGIN_NAME_MAX_LENGTH);
  });

  it("suggests a valid dashed name for imported event titles", () => {
    expect(suggestLoginName("  Summit 2026! West  ")).toBe("summit-2026-west");
    expect(isLoginName(suggestLoginName("Leadership ✨"))).toBe(true);
  });

  it("keeps legacy names usable only for sign-in lookup", () => {
    expect(isLoginName("global call")).toBe(false);
    expect(isLoginNameLookup("global call")).toBe(true);
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
