import { describe, expect, it } from "vitest";
import {
  LOGIN_NAME_MAX_LENGTH,
  isLoginName,
  loginNameProblem,
  normalizeLoginName,
  sanitizeLoginNameInput,
} from "@/lib/event-auth/login-name";
import { isPassword, passwordProblem } from "@/lib/event-auth/password-rules";
import {
  formatRecoveryCode,
  isRecoveryCode,
  makeRecoveryCode,
  normalizeRecoveryCode,
} from "@/lib/event-auth/recovery-code";

/*
 * These rules are also CHECK constraints on `event_access`, so the pattern here
 * has to stay the same shape as the one in the migration: three to forty-eight
 * characters, starting with a lowercase letter or a digit, and containing only
 * lowercase letters, digits and hyphens.
 */
describe("controller login names", () => {
  it("folds case and surrounding whitespace before judging a name", () => {
    expect(normalizeLoginName("  Summit-2026 ".replace("2026 ", "2026"))).toBe("summit-2026");
    expect(normalizeLoginName("LEADERSHIP")).toBe("leadership");
    expect(isLoginName("  Summit  ")).toBe(true);
  });

  it("accepts the shapes the database accepts", () => {
    for (const name of ["abc", "a-b", "9lives", "summit-2026", "a".repeat(48)]) {
      expect(loginNameProblem(name), name).toBeNull();
    }
  });

  it("rejects the shapes the database would refuse", () => {
    expect(loginNameProblem("ab")).toMatch(/at least 3/);
    expect(loginNameProblem("a".repeat(49))).toMatch(/48 characters or fewer/);
    expect(loginNameProblem("-leading")).toMatch(/Start with/);
    expect(loginNameProblem("has space")).toMatch(/lowercase letters, numbers, and hyphens/);
    expect(loginNameProblem("under_score")).toMatch(/lowercase letters, numbers, and hyphens/);
    expect(loginNameProblem("emoji✨name")).toMatch(/lowercase letters, numbers, and hyphens/);
  });

  it("keeps a field from ever holding a value the server would refuse", () => {
    expect(sanitizeLoginNameInput("Summit 2026!")).toBe("summit2026");
    expect(sanitizeLoginNameInput("a".repeat(80))).toHaveLength(LOGIN_NAME_MAX_LENGTH);
  });
});

describe("controller passwords", () => {
  it("requires twelve characters and allows a hundred and twenty-eight", () => {
    expect(passwordProblem("a".repeat(11))).toMatch(/at least 12/);
    expect(passwordProblem("a".repeat(12))).toBeNull();
    expect(passwordProblem("a".repeat(128))).toBeNull();
    expect(passwordProblem("a".repeat(129))).toMatch(/128 characters or fewer/);
  });

  it("counts surrounding spaces rather than trimming them away", () => {
    // Ten characters plus two spaces is a twelve-character password, and the
    // spaces are part of it. Trimming would lock the owner out from a second
    // device with no explanation.
    expect(isPassword(" abcdefghij ")).toBe(true);
    expect(isPassword(" abcdefghi ")).toBe(false);
  });
});

describe("recovery codes", () => {
  it("generates twenty-five unambiguous characters", () => {
    const code = makeRecoveryCode();
    expect(code).toHaveLength(25);
    expect(isRecoveryCode(code)).toBe(true);
    // Crockford's alphabet excludes the characters that misread as digits.
    expect(code).not.toMatch(/[ILOU]/);
  });

  it("does not repeat itself", () => {
    const codes = new Set(Array.from({ length: 50 }, () => makeRecoveryCode()));
    expect(codes.size).toBe(50);
  });

  it("reads back a code however it was written down", () => {
    const code = makeRecoveryCode();
    const written = formatRecoveryCode(code).toLowerCase();
    expect(normalizeRecoveryCode(written)).toBe(code);
    expect(normalizeRecoveryCode(` ${written} `)).toBe(code);
  });

  it("maps the letters people substitute for digits", () => {
    expect(normalizeRecoveryCode("iloilo")).toBe("110110");
    expect(normalizeRecoveryCode("O0o")).toBe("000");
  });

  it("groups a code so it can be checked by eye", () => {
    expect(formatRecoveryCode("ABCDEFGHJKMNPQRSTVWXYZ012")).toBe(
      "ABCDE-FGHJK-MNPQR-STVWX-YZ012",
    );
  });
});
