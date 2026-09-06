import { describe, expect, it } from "vitest";
import {
  panelTimerTogglePatch,
  panelistTimingIsLocked,
  remainingHostTransitionSeconds,
  speakerPatchForItem,
  speakerTimerTogglePatch,
} from "@/components/control-room";
import type { AgendaItem, RuntimeState } from "@/lib/types";

const NOW = 1_000_000;

function runtime(overrides: Partial<RuntimeState> = {}): RuntimeState {
  return {
    status: "ready",
    segmentIndex: 0,
    remainingSeconds: 5 * 60,
    endsAt: null,
    panelStatus: "ready",
    panelRemainingSeconds: 30 * 60,
    panelEndsAt: null,
    updatedAt: 0,
    ...overrides,
  };
}

describe("coupled panel timers", () => {
  it("starts the panel timer when a panelist starts", () => {
    expect(
      speakerTimerTogglePatch({
        runtime: runtime(),
        speakerDuration: 5 * 60,
        panelDuration: 30 * 60,
        isPanel: true,
        now: NOW,
      }),
    ).toEqual({
      status: "running",
      remainingSeconds: 5 * 60,
      endsAt: NOW + 5 * 60 * 1000,
      panelStatus: "running",
      panelRemainingSeconds: 30 * 60,
      panelEndsAt: NOW + 30 * 60 * 1000,
    });
  });

  it("does not restart a panel timer that is already running", () => {
    const existingPanelEnd = NOW + 22 * 60 * 1000;
    const patch = speakerTimerTogglePatch({
      runtime: runtime({
        panelStatus: "running",
        panelRemainingSeconds: 30 * 60,
        panelEndsAt: existingPanelEnd,
      }),
      speakerDuration: 5 * 60,
      panelDuration: 30 * 60,
      isPanel: true,
      now: NOW,
    });

    expect(patch).not.toHaveProperty("panelStatus");
    expect(patch).not.toHaveProperty("panelEndsAt");
  });

  it("pauses the speaker when the running panel is paused", () => {
    expect(
      panelTimerTogglePatch({
        runtime: runtime({
          status: "running",
          remainingSeconds: 5 * 60,
          endsAt: NOW + 4 * 60 * 1000,
          panelStatus: "running",
          panelRemainingSeconds: 30 * 60,
          panelEndsAt: NOW + 23 * 60 * 1000,
        }),
        panelDuration: 30 * 60,
        now: NOW,
      }),
    ).toEqual({
      status: "paused",
      remainingSeconds: 4 * 60,
      endsAt: null,
      panelStatus: "paused",
      panelRemainingSeconds: 23 * 60,
      panelEndsAt: null,
    });
  });
});

describe("live agenda editing", () => {
  it("counts host transitions between agenda items, not between panelists", () => {
    const opening: AgendaItem = {
      id: "opening",
      kind: "single",
      durationSeconds: 600,
      speakers: [{ id: "speaker-1", name: "Opening", durationSeconds: 600 }],
    };
    const panel: AgendaItem = {
      id: "panel",
      kind: "panel",
      durationSeconds: 1200,
      speakers: [
        { id: "panelist-1", name: "One", durationSeconds: 300 },
        { id: "panelist-2", name: "Two", durationSeconds: 300 },
      ],
    };
    const closing: AgendaItem = {
      id: "closing",
      kind: "single",
      durationSeconds: 600,
      speakers: [{ id: "speaker-2", name: "Closing", durationSeconds: 600 }],
    };
    const agenda = [opening, panel, closing];

    expect(remainingHostTransitionSeconds(agenda, opening.id, 90)).toBe(180);
    expect(remainingHostTransitionSeconds(agenda, panel.id, 90)).toBe(90);
    expect(remainingHostTransitionSeconds(agenda, closing.id, 90)).toBe(0);
  });

  it("locks timing for completed and currently speaking panelists", () => {
    expect(panelistTimingIsLocked(0, 1)).toBe(true);
    expect(panelistTimingIsLocked(1, 1)).toBe(true);
    expect(panelistTimingIsLocked(2, 1)).toBe(false);
  });

  it("keeps a single speaker's duration and item total synchronized", () => {
    const item: AgendaItem = {
      id: "single-1",
      kind: "single",
      durationSeconds: 10 * 60,
      speakers: [
        {
          id: "speaker-1",
          name: "Eddie",
          durationSeconds: 10 * 60,
        },
      ],
    };

    expect(
      speakerPatchForItem(item, "speaker-1", { durationSeconds: 12 * 60 }),
    ).toEqual({
      durationSeconds: 12 * 60,
      speakers: [
        {
          id: "speaker-1",
          name: "Eddie",
          durationSeconds: 12 * 60,
        },
      ],
    });
  });
});
