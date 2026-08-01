"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import { formatTimer, type TimerTone } from "@/lib/format";

/**
 * The clock and its bar are the only things that change on every tick.
 * Keeping them in their own memoised components means a 5Hz update repaints
 * two small subtrees instead of the whole console — which is what made the
 * drag-and-drop list feel sticky.
 */
export const TimerReadout = memo(function TimerReadout({
  seconds,
  className,
}: {
  seconds: number;
  className?: string;
}) {
  return <strong className={className}>{formatTimer(seconds)}</strong>;
});

export const TimerProgress = memo(function TimerProgress({
  label,
  ratio,
  tone,
}: {
  label: string;
  ratio: number;
  tone: TimerTone;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      className="mb-3 h-1 overflow-hidden rounded-full bg-ink/10"
    >
      <i
        className={cn(
          "block h-full origin-left rounded-full transition-transform duration-200 ease-linear",
          tone === "critical" ? "bg-over" : tone === "caution" ? "bg-caution" : "bg-success",
        )}
        style={{ transform: `scaleX(${ratio})` }}
      />
    </div>
  );
});
