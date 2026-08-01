import { describe, expect, it } from "vitest";
import {
  TIMER_CAUTION_SECONDS,
  TIMER_CRITICAL_SECONDS,
  timerTone,
} from "@/lib/format";

describe("shared timer colors", () => {
  it("uses green above 30, yellow through 11, and red at 10 or below", () => {
    expect(TIMER_CAUTION_SECONDS).toBe(30);
    expect(TIMER_CRITICAL_SECONDS).toBe(10);
    expect(timerTone(31)).toBe("normal");
    expect(timerTone(30)).toBe("caution");
    expect(timerTone(11)).toBe("caution");
    expect(timerTone(10)).toBe("critical");
    expect(timerTone(0)).toBe("critical");
    expect(timerTone(-1)).toBe("critical");
  });

  it("does not vary the thresholds with the original segment duration", () => {
    expect(timerTone(25, 60)).toBe("caution");
    expect(timerTone(25, 3600)).toBe("caution");
  });
});
