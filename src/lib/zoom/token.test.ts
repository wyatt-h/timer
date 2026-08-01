import { describe, expect, it } from "vitest";
import {
  formatZoomToken,
  isZoomToken,
  makeZoomToken,
  normalizeZoomToken,
} from "@/lib/zoom/token";

describe("Zoom pairing codes", () => {
  it("mints codes from the unambiguous alphabet", () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const token = makeZoomToken();
      expect(token).toHaveLength(10);
      expect(isZoomToken(token)).toBe(true);
      expect(token).not.toMatch(/[ILOU]/);
    }
  });

  it("accepts a code as it is actually pasted", () => {
    expect(normalizeZoomToken("abcde-fghjk")).toBe("ABCDEFGHJK");
    expect(normalizeZoomToken(" A2C4E FGHJK ")).toBe("A2C4EFGHJK");
  });

  it("forgives the characters the alphabet leaves out", () => {
    expect(normalizeZoomToken("i1o0l23456")).toBe("1100123456");
  });

  it("never silently accepts a truncated code", () => {
    expect(isZoomToken(normalizeZoomToken("abc-de"))).toBe(false);
    expect(isZoomToken(normalizeZoomToken(""))).toBe(false);
  });

  it("rejects a character with no unambiguous reading", () => {
    expect(isZoomToken(normalizeZoomToken("UUUUUUUUUU"))).toBe(false);
  });

  it("ignores anything typed past the end of a code", () => {
    expect(normalizeZoomToken("A2C4EFGHJK-EXTRA")).toBe("A2C4EFGHJK");
  });

  it("groups a code for reading aloud", () => {
    expect(formatZoomToken("A2C4EFGHJK")).toBe("A2C4E-FGHJK");
  });
});
