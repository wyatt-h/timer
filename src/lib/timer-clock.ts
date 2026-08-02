import type { TimerStatus } from "@/lib/types";

/** A forgotten timer may run this far past zero before every surface freezes it. */
export const MAX_OVERTIME_SECONDS = 15 * 60;
export const AUTO_STOPPED_REMAINING_SECONDS = -MAX_OVERTIME_SECONDS;

export type TimerClockSnapshot = {
  remainingSeconds: number;
  autoStopped: boolean;
};

/**
 * Read one countdown from its durable deadline.
 *
 * The deadline keeps a running timer accurate across sleeping tabs and closed
 * browsers. The overtime floor makes that same property safe: after 15 minutes
 * below zero, every client derives the identical frozen value even if no
 * controller was open to write a pause at the exact cutoff.
 *
 * A paused value at the floor is recognised as auto-stopped too. That preserves
 * the explanation after an open controller persists the derived stop.
 */
export function readTimerClock(
  status: TimerStatus | null | undefined,
  endsAt: number | null | undefined,
  fallback: number | null | undefined,
  now = Date.now(),
): TimerClockSnapshot {
  const stored = fallback ?? 0;
  const remainingSeconds = status === "running" && endsAt ? (endsAt - now) / 1000 : stored;
  const autoStopped =
    remainingSeconds <= AUTO_STOPPED_REMAINING_SECONDS &&
    (status === "running" || status === "paused");

  return {
    remainingSeconds: autoStopped ? AUTO_STOPPED_REMAINING_SECONDS : remainingSeconds,
    autoStopped,
  };
}
