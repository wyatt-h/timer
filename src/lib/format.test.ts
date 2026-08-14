import { describe, expect, it } from "vitest";
import {
  TIMER_CAUTION_SECONDS,
  TIMER_CRITICAL_SECONDS,
  formatDuration,
  timerTone,
} from "@/lib/format";

describe("duration formatting", () => {
  it("shows fractional minutes without rounding them to a whole minute", () => {
    expect(formatDuration(150)).toBe("2.5 min");
    expect(formatDuration(3750)).toBe("1 hr 2.5 min");
  });

  it("keeps whole-minute durations concise", () => {
    expect(formatDuration(600)).toBe("10 min");
    expect(formatDuration(3600)).toBe("1 hr");
  });
});

describe("shared timer colors", () => {
  it("uses neutral above 30, yellow through 11, and red at 10 or below", () => {
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
