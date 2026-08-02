import { flattenSegments, timerTone, type TimerTone } from "@/lib/format";
import { readTimerClock } from "@/lib/timer-clock";
import type { TimerEvent } from "@/lib/types";

/*
 * Pure translation from this application's authoritative timer state into Zoom
 * Dynamic Indicator commands. Nothing here touches React, Supabase, or the Zoom
 * SDK, so every transition below is unit-testable in isolation.
 *
 * Zoom leaves several runtime semantics undocumented, so the rules are
 * deliberately conservative:
 *
 * - `pause` and `resume` are only used for a straight transition where Zoom's
 *   own countdown should already hold the right value. Anything else — a time
 *   adjustment, a reset, a new speaker, a refresh, a reconnect — is republished
 *   as a complete fresh `start`, because a new value cannot be attached to a
 *   resume (`DynamicIndicatorOptions.timer` has no `current` field).
 * - `extendDynamicIndicator` is reserved for an explicit positive extension of
 *   an already-synchronized countdown.
 * - Removal is always `removeDynamicIndicator()`. The visual behaviour of
 *   `timer.action: "end"` is undocumented, so it is not used.
 */

/** How far Zoom's projected countdown may drift before it is republished. */
export const DRIFT_TOLERANCE_SECONDS = 2;

/** Below this, a difference is drift rather than an operator's adjustment. */
export const EXTEND_THRESHOLD_SECONDS = 2;

/** Nothing is worth publishing to a meeting below this. */
const MINIMUM_PUBLISHABLE_SECONDS = 1;

/** Indicator text sits beside a participant's name, so it stays short. */
const MAX_LABEL_LENGTH = 30;

export type TimerPhase = "idle" | "running" | "paused" | "finished";
/** Zoom adds a filled overtime state beyond the three shared app tones. */
export type ZoomIndicatorTone = TimerTone | "overtime";

/**
 * The Zoom contour deliberately uses the same thresholds as the controller and
 * audience displays. The duration argument remains for a stable call signature.
 */
export function zoomIndicatorTone(
  remainingSeconds: number,
  durationSeconds: number,
): ZoomIndicatorTone {
  if (remainingSeconds < 0) return "overtime";
  return timerTone(remainingSeconds, durationSeconds);
}

/**
 * The authoritative timer, flattened to the one clock Zoom can show. Remaining
 * time is signed: this application deliberately counts past zero, and keeping
 * the sign means an overrunning countdown stays in step with Zoom's instead of
 * looking like a large positive extension.
 */
export type SourceTimer = {
  /** Identifies the clock itself, so a new speaker is not mistaken for drift. */
  segmentId: string;
  label: string;
  phase: TimerPhase;
  remainingSeconds: number;
  autoStopped: boolean;
  /** Neutral/yellow/red urgency for the compact contour. */
  tone: ZoomIndicatorTone;
  /** `RuntimeState.updatedAt`; advances on every control-room write. */
  revision: number;
};

/** What this app last successfully told Zoom, and when. */
export type PublishedTimer = {
  segmentId: string;
  label: string;
  phase: "running" | "paused";
  remainingSeconds: number;
  tone: ZoomIndicatorTone;
  /** Local clock reading when the command was acknowledged. */
  at: number;
  revision: number;
};

export type ZoomTimerCommand =
  | { kind: "start"; remainingSeconds: number; label: string; tone: ZoomIndicatorTone }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "extend"; seconds: number }
  | { kind: "style"; tone: ZoomIndicatorTone }
  | { kind: "remove" }
  | { kind: "noop" };

export type ZoomTimerPlan = {
  command: ZoomTimerCommand;
  /** What `published` becomes once the command is acknowledged. */
  published: PublishedTimer | null;
};

/**
 * Zoom's Dynamic Indicator displays one count above the millisecond duration
 * supplied by the app, while the web clock already rounds its source upward.
 * Preserve the source clock's sub-second position and remove one second so the
 * two rendered values change together. Rounding to a whole second would reset
 * Zoom's tick boundary and reintroduce intermittent drift.
 */
export function toZoomTimerUnits(seconds: number) {
  if (seconds <= 0) return 0;
  return Math.max(0, Math.ceil(seconds * 1000) - 1000);
}

/** Extensions are durations, so they must not receive the display offset. */
export function toZoomDurationUnits(seconds: number) {
  return Math.max(0, Math.ceil(seconds * 1000));
}

function shortLabel(label: string) {
  const trimmed = label.trim() || "Speaker";
  return trimmed.length > MAX_LABEL_LENGTH
    ? `${trimmed.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`
    : trimmed;
}

/** Remaining time on a running clock, derived from its authoritative deadline. */
export function remainingFromDeadline(endsAt: number, now: number) {
  return (endsAt - now) / 1000;
}

/**
 * Reduce an event to the single countdown Zoom can display: the current
 * speaker's clock, which is the number the room reacts to. A panel's overall
 * total stays in this application's own displays.
 */
export function sourceTimerFromEvent(event: TimerEvent, now: number): SourceTimer | null {
  const segments = flattenSegments(event);
  if (!segments.length) return null;

  const runtime = event.runtime;
  const index = Math.min(Math.max(0, runtime.segmentIndex), segments.length - 1);
  const segment = segments[index];

  const clock = readTimerClock(
    runtime.status,
    runtime.endsAt,
    runtime.remainingSeconds,
    now,
  );
  const phase: TimerPhase =
    clock.autoStopped || event.status === "completed" || runtime.status === "ended"
      ? "finished"
      : runtime.status === "running"
        ? "running"
        : runtime.status === "paused"
          ? "paused"
          : "idle";

  const remainingSeconds = clock.remainingSeconds;

  return {
    segmentId: segment.id,
    label: shortLabel(segment.speaker),
    phase,
    remainingSeconds,
    autoStopped: clock.autoStopped,
    tone: zoomIndicatorTone(remainingSeconds, segment.durationSeconds),
    revision: runtime.updatedAt,
  };
}

/** Where Zoom's countdown should have reached by now, if it is still running. */
function projectPublished(published: PublishedTimer, now: number) {
  if (published.phase !== "running") return published.remainingSeconds;
  return published.remainingSeconds - (now - published.at) / 1000;
}

function startCommand(source: SourceTimer, now: number): ZoomTimerPlan {
  if (source.remainingSeconds < MINIMUM_PUBLISHABLE_SECONDS) {
    return { command: { kind: "noop" }, published: null };
  }
  return {
    command: {
      kind: "start",
      remainingSeconds: source.remainingSeconds,
      label: source.label,
      tone: source.tone,
    },
    published: {
      segmentId: source.segmentId,
      label: source.label,
      phase: "running",
      remainingSeconds: source.remainingSeconds,
      tone: source.tone,
      at: now,
      revision: source.revision,
    },
  };
}

function removal(published: PublishedTimer | null): ZoomTimerPlan {
  return {
    command: published ? { kind: "remove" } : { kind: "noop" },
    published: null,
  };
}

/**
 * Decide the single command that moves Zoom from what it was last told to what
 * the authoritative timer now says. Identical input yields `noop`, which is what
 * makes repeated Supabase events and React rerenders harmless.
 */
export function planZoomCommand({
  source,
  published,
  enabled,
  now,
  canExtend = true,
  canStyle = true,
}: {
  source: SourceTimer | null;
  published: PublishedTimer | null;
  enabled: boolean;
  now: number;
  /** Clients without `extendDynamicIndicator` republish the whole timer. */
  canExtend?: boolean;
  /** Clients without `setDynamicIndicatorStyle` keep the initial contour. */
  canStyle?: boolean;
}): ZoomTimerPlan {
  // Publishing is opt-in, so losing the source or switching sync off retracts
  // whatever the meeting is currently being shown.
  if (!enabled || !source) return removal(published);

  if (source.phase === "idle" || source.phase === "finished") return removal(published);

  if (source.phase === "paused") {
    if (!published) {
      // A paused clock cannot be published as paused — it would have to be
      // started first, which would show the meeting time draining while nobody
      // is speaking. It publishes when the operator starts the timer.
      return { command: { kind: "noop" }, published: null };
    }
    if (published.segmentId !== source.segmentId) return removal(published);
    if (published.phase === "paused") {
      if (published.tone !== source.tone && canStyle) {
        return {
          command: { kind: "style", tone: source.tone },
          published: { ...published, tone: source.tone },
        };
      }
      /*
       * Zoom is already paused. An adjustment made while paused cannot be
       * corrected here, because the only way to change the value is a fresh
       * `start`, which would begin counting. The correction is applied by the
       * resume branch below when the operator starts again.
       */
      return { command: { kind: "noop" }, published };
    }
    return {
      command: { kind: "pause" },
      published: {
        ...published,
        phase: "paused",
        remainingSeconds: source.remainingSeconds,
        at: now,
        revision: source.revision,
      },
    };
  }

  // Running from here down.
  if (!published) return startCommand(source, now);
  if (published.segmentId !== source.segmentId) return startCommand(source, now);
  if (published.label !== source.label) return startCommand(source, now);

  if (published.phase === "paused") {
    const drift = source.remainingSeconds - published.remainingSeconds;
    if (Math.abs(drift) > DRIFT_TOLERANCE_SECONDS) return startCommand(source, now);
    return {
      command: { kind: "resume" },
      published: {
        ...published,
        phase: "running",
        remainingSeconds: source.remainingSeconds,
        at: now,
        revision: source.revision,
      },
    };
  }

  if (published.tone !== source.tone) {
    if (!canStyle) return startCommand(source, now);
    return {
      command: { kind: "style", tone: source.tone },
      published: { ...published, tone: source.tone },
    };
  }

  const difference = source.remainingSeconds - projectPublished(published, now);

  if (difference < -DRIFT_TOLERANCE_SECONDS) {
    // Time was removed, or Zoom's countdown has run ahead of ours.
    return startCommand(source, now);
  }

  if (difference >= EXTEND_THRESHOLD_SECONDS) {
    /*
     * Time was added. A repeated delivery of the same revision must not extend
     * twice, so an unchanged revision is treated as an echo rather than a
     * second adjustment.
     */
    if (source.revision === published.revision) {
      return { command: { kind: "noop" }, published };
    }
    if (!canExtend) return startCommand(source, now);
    const seconds = Math.round(difference);
    return {
      command: { kind: "extend", seconds },
      published: {
        ...published,
        remainingSeconds: projectPublished(published, now) + seconds,
        at: now,
        revision: source.revision,
      },
    };
  }

  // In step: the common case, and the reason a one-second tick is not a
  // one-second stream of SDK calls.
  return { command: { kind: "noop" }, published };
}
