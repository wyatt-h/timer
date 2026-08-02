import { describe, expect, it } from "vitest";
import {
  AUTO_STOPPED_REMAINING_SECONDS,
  MAX_OVERTIME_SECONDS,
  readTimerClock,
} from "@/lib/timer-clock";

const NOW = 1_700_000_000_000;

describe("readTimerClock", () => {
  it("continues legitimate overtime until the fifteen-minute limit", () => {
    const clock = readTimerClock("running", NOW - 899_000, 60, NOW);

    expect(clock).toEqual({ remainingSeconds: -899, autoStopped: false });
  });

  it("freezes an abandoned running timer at fifteen minutes overtime", () => {
    const clock = readTimerClock("running", NOW - (MAX_OVERTIME_SECONDS + 3600) * 1000, 60, NOW);

    expect(clock).toEqual({
      remainingSeconds: AUTO_STOPPED_REMAINING_SECONDS,
      autoStopped: true,
    });
  });

  it("keeps a persisted auto-stop identifiable after it is paused", () => {
    expect(readTimerClock("paused", null, AUTO_STOPPED_REMAINING_SECONDS, NOW)).toEqual({
      remainingSeconds: AUTO_STOPPED_REMAINING_SECONDS,
      autoStopped: true,
    });
  });

  it("does not reinterpret an ordinary manual pause", () => {
    expect(readTimerClock("paused", null, -45, NOW)).toEqual({
      remainingSeconds: -45,
      autoStopped: false,
    });
  });
});
