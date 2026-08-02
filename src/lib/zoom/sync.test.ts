import { describe, expect, it } from "vitest";
import {
  DRIFT_TOLERANCE_SECONDS,
  planZoomCommand,
  sourceTimerFromEvent,
  toZoomDurationUnits,
  toZoomTimerUnits,
  zoomIndicatorTone,
  type PublishedTimer,
  type SourceTimer,
} from "@/lib/zoom/sync";
import type { RuntimeState, TimerEvent } from "@/lib/types";

const NOW = 1_700_000_000_000;

function source(overrides: Partial<SourceTimer> = {}): SourceTimer {
  return {
    segmentId: "speaker-1",
    label: "Maya Chen",
    phase: "running",
    remainingSeconds: 300,
    tone: "normal",
    revision: 10,
    ...overrides,
  };
}

function published(overrides: Partial<PublishedTimer> = {}): PublishedTimer {
  return {
    segmentId: "speaker-1",
    label: "Maya Chen",
    phase: "running",
    remainingSeconds: 300,
    tone: "normal",
    at: NOW,
    revision: 10,
    ...overrides,
  };
}

function plan(
  overrides: {
    source?: SourceTimer | null;
    published?: PublishedTimer | null;
    enabled?: boolean;
    now?: number;
    canExtend?: boolean;
    canStyle?: boolean;
  } = {},
) {
  return planZoomCommand({
    source: overrides.source === undefined ? source() : overrides.source,
    published: overrides.published ?? null,
    enabled: overrides.enabled ?? true,
    now: overrides.now ?? NOW,
    canExtend: overrides.canExtend,
    canStyle: overrides.canStyle,
  });
}

function timerEvent(runtime: Partial<RuntimeState> = {}): TimerEvent {
  return {
    id: "event-1",
    name: "Leadership Summit",
    date: "2026-07-31",
    status: "live",
    viewerToken: "viewer-token",
    agenda: [
      {
        id: "item-1",
        kind: "single",
        durationSeconds: 600,
        speakers: [{ id: "speaker-1", name: "Maya Chen", durationSeconds: 600 }],
      },
      {
        id: "item-2",
        kind: "panel",
        durationSeconds: 1200,
        speakers: [
          { id: "speaker-2", name: "Noah Williams", durationSeconds: 600 },
          { id: "speaker-3", name: "Sofia Patel", durationSeconds: 600 },
        ],
      },
    ],
    runtime: {
      status: "running",
      segmentIndex: 0,
      remainingSeconds: 600,
      endsAt: NOW + 480_000,
      panelStatus: null,
      panelRemainingSeconds: null,
      panelEndsAt: null,
      updatedAt: 10,
      ...runtime,
    },
    createdAt: 0,
  };
}

describe("remaining seconds from authoritative state", () => {
  it("derives a running clock from its deadline, not a stored counter", () => {
    const result = sourceTimerFromEvent(timerEvent(), NOW);

    expect(result).toMatchObject({
      // A lone speaker's segment is keyed by its agenda item, as elsewhere.
      segmentId: "item-1",
      label: "Maya Chen",
      phase: "running",
      remainingSeconds: 480,
      tone: "normal",
      revision: 10,
    });
  });

  it("reads a paused clock from its stored remainder", () => {
    const result = sourceTimerFromEvent(
      timerEvent({ status: "paused", remainingSeconds: 132, endsAt: null }),
      NOW,
    );

    expect(result).toMatchObject({ phase: "paused", remainingSeconds: 132 });
  });

  it("keeps overrun negative so it stays in step with Zoom's countdown", () => {
    const result = sourceTimerFromEvent(timerEvent({ endsAt: NOW - 12_000 }), NOW);

    expect(result?.remainingSeconds).toBe(-12);
    expect(result?.tone).toBe("overtime");
  });

  it("uses the shared 30-second warning threshold for the contour", () => {
    const result = sourceTimerFromEvent(timerEvent({ endsAt: NOW + 30_000 }), NOW);

    expect(result?.tone).toBe("caution");
  });

  it("uses the same neutral, yellow, and red thresholds as the app", () => {
    expect(zoomIndicatorTone(31, 600)).toBe("normal");
    expect(zoomIndicatorTone(30, 600)).toBe("caution");
    expect(zoomIndicatorTone(11, 600)).toBe("caution");
    expect(zoomIndicatorTone(10, 600)).toBe("critical");
    expect(zoomIndicatorTone(0, 600)).toBe("critical");
    expect(zoomIndicatorTone(-16, 600)).toBe("overtime");
  });

  it("tracks the current panelist rather than the panel total", () => {
    const result = sourceTimerFromEvent(
      timerEvent({ segmentIndex: 2, endsAt: NOW + 60_000 }),
      NOW,
    );

    expect(result).toMatchObject({ segmentId: "speaker-3", label: "Sofia Patel" });
  });

  it("treats a completed event as finished whatever the clock says", () => {
    const event = { ...timerEvent(), status: "completed" as const };

    expect(sourceTimerFromEvent(event, NOW)?.phase).toBe("finished");
  });

  it("preserves the tick boundary while matching the web display", () => {
    expect(toZoomTimerUnits(299.2)).toBe(298_200);
    expect(toZoomTimerUnits(10.01)).toBe(9_010);
    expect(toZoomTimerUnits(10)).toBe(9_000);
    expect(toZoomTimerUnits(0.5)).toBe(0);
    expect(toZoomTimerUnits(-0.5)).toBe(0);
    expect(toZoomTimerUnits(-12)).toBe(0);
  });

  it("converts extensions without adding the display offset", () => {
    expect(toZoomDurationUnits(15)).toBe(15_000);
    expect(toZoomDurationUnits(1.234)).toBe(1_234);
    expect(toZoomDurationUnits(-12)).toBe(0);
  });
});

describe("publishing a countdown", () => {
  it("starts a complete indicator when nothing is published", () => {
    const result = plan();

    expect(result.command).toEqual({
      kind: "start",
      remainingSeconds: 300,
      label: "Maya Chen",
      tone: "normal",
    });
    expect(result.published).toMatchObject({ phase: "running", remainingSeconds: 300 });
  });

  it("publishes nothing until the operator enables sync", () => {
    expect(plan({ enabled: false }).command).toEqual({ kind: "noop" });
  });

  it("does not publish a paused timer, because a paused start would count down", () => {
    expect(plan({ source: source({ phase: "paused" }) }).command).toEqual({ kind: "noop" });
  });

  it("does not publish a timer that has already run out", () => {
    expect(plan({ source: source({ remainingSeconds: 0 }) }).command).toEqual({ kind: "noop" });
  });

  it("leaves an in-step countdown alone", () => {
    const result = plan({
      published: published(),
      now: NOW + 30_000,
      source: source({ remainingSeconds: 270 }),
    });

    expect(result.command).toEqual({ kind: "noop" });
  });

  it("absorbs sub-tolerance drift without touching Zoom", () => {
    const result = plan({
      published: published(),
      now: NOW + 30_000,
      source: source({ remainingSeconds: 270 - DRIFT_TOLERANCE_SECONDS + 0.5 }),
    });

    expect(result.command).toEqual({ kind: "noop" });
  });
});

describe("transitions", () => {
  it("pauses a running indicator", () => {
    const result = plan({
      source: source({ phase: "paused", remainingSeconds: 240, revision: 11 }),
      published: published(),
    });

    expect(result.command).toEqual({ kind: "pause" });
    expect(result.published).toMatchObject({ phase: "paused", remainingSeconds: 240 });
  });

  it("resumes a paused indicator that still holds the right time", () => {
    const result = plan({
      source: source({ remainingSeconds: 240, revision: 12 }),
      published: published({ phase: "paused", remainingSeconds: 240 }),
    });

    expect(result.command).toEqual({ kind: "resume" });
    expect(result.published).toMatchObject({ phase: "running", remainingSeconds: 240 });
  });

  it("restarts instead of resuming when time was adjusted while paused", () => {
    const result = plan({
      source: source({ remainingSeconds: 255, revision: 12 }),
      published: published({ phase: "paused", remainingSeconds: 240 }),
    });

    expect(result.command).toEqual({
      kind: "start",
      remainingSeconds: 255,
      label: "Maya Chen",
      tone: "normal",
    });
  });

  it("cannot correct a paused indicator, and waits for the resume to do it", () => {
    const result = plan({
      source: source({ phase: "paused", remainingSeconds: 400, revision: 13 }),
      published: published({ phase: "paused", remainingSeconds: 240 }),
    });

    expect(result.command).toEqual({ kind: "noop" });
  });

  it("extends when the operator adds time to a running countdown", () => {
    const result = plan({
      published: published(),
      now: NOW + 30_000,
      source: source({ remainingSeconds: 285, revision: 11 }),
    });

    expect(result.command).toEqual({ kind: "extend", seconds: 15 });
    expect(result.published).toMatchObject({ remainingSeconds: 285, revision: 11 });
  });

  it("republishes rather than extending when the client cannot extend", () => {
    const result = plan({
      published: published(),
      now: NOW + 30_000,
      source: source({ remainingSeconds: 285, revision: 11 }),
      canExtend: false,
    });

    expect(result.command).toMatchObject({ kind: "start", remainingSeconds: 285 });
  });

  it("restarts when time is removed", () => {
    const result = plan({
      published: published(),
      now: NOW + 30_000,
      source: source({ remainingSeconds: 255, revision: 11 }),
    });

    expect(result.command).toMatchObject({ kind: "start", remainingSeconds: 255 });
  });

  it("restarts on a new speaker instead of editing the running timer", () => {
    const result = plan({
      published: published(),
      source: source({ segmentId: "speaker-2", label: "Noah Williams", revision: 11 }),
    });

    expect(result.command).toEqual({
      kind: "start",
      remainingSeconds: 300,
      label: "Noah Williams",
      tone: "normal",
    });
  });

  it("retracts the indicator when a paused timer moves to another speaker", () => {
    const result = plan({
      source: source({ phase: "paused", segmentId: "speaker-2", revision: 11 }),
      published: published({ phase: "paused" }),
    });

    expect(result.command).toEqual({ kind: "remove" });
    expect(result.published).toBeNull();
  });

  it("removes the indicator when the event ends", () => {
    const result = plan({
      source: source({ phase: "finished", revision: 11 }),
      published: published(),
    });

    expect(result.command).toEqual({ kind: "remove" });
    expect(result.published).toBeNull();
  });

  it("removes the indicator when the timer is reset to ready", () => {
    expect(plan({ source: source({ phase: "idle" }), published: published() }).command).toEqual({
      kind: "remove",
    });
  });

  it("removes the indicator when sync is switched off", () => {
    expect(plan({ enabled: false, published: published() }).command).toEqual({ kind: "remove" });
  });

  it("removes the indicator when the source event disappears", () => {
    expect(plan({ source: null, published: published() }).command).toEqual({ kind: "remove" });
  });

  it("does not send a removal when nothing was ever published", () => {
    expect(plan({ source: null }).command).toEqual({ kind: "noop" });
  });
});

describe("duplicate and stale delivery", () => {
  it("ignores a repeated event that would otherwise extend twice", () => {
    const alreadyExtended = published({ remainingSeconds: 285, revision: 11 });

    const result = plan({
      published: alreadyExtended,
      source: source({ remainingSeconds: 285, revision: 11 }),
      now: NOW + 1,
    });

    expect(result.command).toEqual({ kind: "noop" });
    expect(result.published).toBe(alreadyExtended);
  });

  it("treats a fresh revision at the same remaining time as no change", () => {
    const result = plan({
      published: published(),
      source: source({ revision: 99 }),
      now: NOW + 1,
    });

    expect(result.command).toEqual({ kind: "noop" });
  });

  it("republishes from authoritative state after a reconnect clears what Zoom knew", () => {
    // A reconnect drops the published snapshot; the next plan starts afresh
    // from the deadline rather than trusting the old countdown.
    const event = timerEvent({ endsAt: NOW + 137_000 });
    const recovered = sourceTimerFromEvent(event, NOW);

    const result = plan({ source: recovered, published: null });

    expect(result.command).toEqual({
      kind: "start",
      remainingSeconds: 137,
      label: "Maya Chen",
      tone: "normal",
    });
  });

  it("changes the contour when the audience warning tone changes", () => {
    const result = plan({
      source: source({ remainingSeconds: 60, tone: "caution" }),
      published: published({ remainingSeconds: 60, tone: "normal" }),
    });

    expect(result.command).toEqual({ kind: "style", tone: "caution" });
    expect(result.published).toMatchObject({ tone: "caution" });
  });

  it("republishes with the new contour when style updates are unavailable", () => {
    const result = plan({
      source: source({ remainingSeconds: 60, tone: "caution" }),
      published: published({ remainingSeconds: 60, tone: "normal" }),
      canStyle: false,
    });

    expect(result.command).toEqual({
      kind: "start",
      remainingSeconds: 60,
      label: "Maya Chen",
      tone: "caution",
    });
  });
});
