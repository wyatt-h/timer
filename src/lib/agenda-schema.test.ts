import { describe, expect, it } from "vitest";
import {
  agendaFormSchema,
  itemHasContent,
  remainingPanelMinutes,
  totalProgrammeMinutes,
  usedPanelMinutes,
  type AgendaItemValues,
} from "@/lib/agenda-schema";
import {
  makePanelItem,
  makePanelist,
  makeSpeakerItem,
  toAgendaItems,
  toFormValues,
} from "@/lib/agenda-mapping";
import type { AgendaItem } from "@/lib/types";

function panelWith(panelistMinutes: number[], totalMinutes = 30): AgendaItemValues {
  return {
    id: "panel-1",
    type: "panel",
    durationMinutes: totalMinutes,
    panel: {
      host: "Ana Torres",
      defaultPanelistMinutes: 5,
      panelists: panelistMinutes.map((durationMinutes, index) => ({
        id: `p-${index}`,
        name: `Panelist ${index + 1}`,
        durationMinutes,
      })),
    },
  };
}

describe("derived durations", () => {
  it("sums panelist minutes without storing the total", () => {
    expect(usedPanelMinutes(panelWith([8, 7, 9]))).toBe(24);
  });

  it("reports remaining minutes when a panel is underfilled", () => {
    expect(remainingPanelMinutes(panelWith([8, 7], 30))).toBe(15);
  });

  it("reports a negative remainder when panelists overrun", () => {
    expect(remainingPanelMinutes(panelWith([20, 20], 30))).toBe(-10);
  });

  it("ignores a speaker item when computing panel usage", () => {
    expect(usedPanelMinutes(makeSpeakerItem(12))).toBe(0);
  });

  it("totals the whole programme across mixed item types", () => {
    const values = {
      agendaItems: [makeSpeakerItem(12), panelWith([8, 7], 30), makeSpeakerItem(8)],
    };
    expect(totalProgrammeMinutes(values)).toBe(50);
  });
});

describe("validation", () => {
  it("accepts a well-formed agenda", () => {
    const speaker = makeSpeakerItem(10);
    if (speaker.type === "speaker") speaker.speaker.name = "Maya Chen";
    const result = agendaFormSchema.safeParse({
      agendaItems: [speaker, panelWith([8, 7], 30)],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a blank speaker name", () => {
    const result = agendaFormSchema.safeParse({ agendaItems: [makeSpeakerItem(10)] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "agendaItems.0.speaker.name")).toBe(
        true,
      );
    }
  });

  it("rejects a blank panel host", () => {
    const panel = panelWith([5, 5]);
    if (panel.type === "panel") panel.panel.host = "   ";
    const result = agendaFormSchema.safeParse({ agendaItems: [panel] });
    expect(result.success).toBe(false);
  });

  it("rejects fractional and non-positive durations", () => {
    for (const minutes of [0, -5, 2.5]) {
      const speaker = makeSpeakerItem(minutes);
      if (speaker.type === "speaker") speaker.speaker.name = "Someone";
      expect(agendaFormSchema.safeParse({ agendaItems: [speaker] }).success).toBe(false);
    }
  });

  it("flags a panel whose panelists exceed the panel duration", () => {
    const result = agendaFormSchema.safeParse({ agendaItems: [panelWith([20, 20], 30)] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join(".") === "agendaItems.0.panel.panelists",
      );
      expect(issue?.message).toContain("10 min over");
    }
  });

  it("flags an individual panelist longer than the whole panel", () => {
    const result = agendaFormSchema.safeParse({ agendaItems: [panelWith([45], 30)] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => i.path.join(".") === "agendaItems.0.panel.panelists.0.durationMinutes",
        ),
      ).toBe(true);
    }
  });

  it("allows unused panel time, since a host may hold minutes back", () => {
    const result = agendaFormSchema.safeParse({ agendaItems: [panelWith([5, 5], 30)] });
    expect(result.success).toBe(true);
    expect(remainingPanelMinutes(panelWith([5, 5], 30))).toBe(20);
  });

  it("requires at least one panelist", () => {
    const panel = panelWith([]);
    const result = agendaFormSchema.safeParse({ agendaItems: [panel] });
    expect(result.success).toBe(false);
  });
});

describe("stable identity", () => {
  it("gives every new item and panelist a distinct id", () => {
    const ids = [
      makeSpeakerItem().id,
      makeSpeakerItem().id,
      makePanelItem().id,
      makePanelist().id,
      makePanelist().id,
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("seeds a new panel with two panelists holding separate ids", () => {
    const panel = makePanelItem();
    const [first, second] = panel.type === "panel" ? panel.panel.panelists : [];
    expect(first.id).not.toBe(second.id);
  });
});

describe("apply to all", () => {
  it("copies the default onto every panelist", () => {
    const panel = panelWith([8, 3, 12]);
    if (panel.type !== "panel") throw new Error("expected a panel");
    const applied = {
      ...panel,
      panel: {
        ...panel.panel,
        panelists: panel.panel.panelists.map((p) => ({
          ...p,
          durationMinutes: panel.panel.defaultPanelistMinutes,
        })),
      },
    };
    expect(applied.panel.panelists.map((p) => p.durationMinutes)).toEqual([5, 5, 5]);
    expect(usedPanelMinutes(applied)).toBe(15);
    /* Names and ids are untouched — only the duration is copied. */
    expect(applied.panel.panelists.map((p) => p.id)).toEqual(["p-0", "p-1", "p-2"]);
  });
});

describe("domain mapping", () => {
  const stored: AgendaItem[] = [
    {
      id: "a",
      kind: "single",
      durationSeconds: 720,
      speakers: [{ id: "s1", name: "Maya Chen", durationSeconds: 720, soundMuted: true }],
    },
    {
      id: "b",
      kind: "panel",
      durationSeconds: 1800,
      speakerDefaultSeconds: 420,
      host: "Ana Torres",
      speakers: [
        { id: "s2", name: "Noah", durationSeconds: 480 },
        { id: "s3", name: "Sofia", durationSeconds: 420 },
      ],
    },
  ];

  it("converts seconds to whole minutes for the form", () => {
    const values = toFormValues(stored);
    expect(values.agendaItems[0].durationMinutes).toBe(12);
    expect(values.agendaItems[1].durationMinutes).toBe(30);
    expect(
      values.agendaItems[1].type === "panel" && values.agendaItems[1].panel.host,
    ).toBe("Ana Torres");
  });

  it("round-trips without losing ids or per-speaker settings", () => {
    const back = toAgendaItems(toFormValues(stored), stored);
    expect(back[0].id).toBe("a");
    expect(back[0].speakers[0].id).toBe("s1");
    /* soundMuted is not editable here, so it must survive the round trip. */
    expect(back[0].speakers[0].soundMuted).toBe(true);
    expect(back[1].speakers.map((s) => s.id)).toEqual(["s2", "s3"]);
    expect(back[1].durationSeconds).toBe(1800);
  });

  it("keeps a speaker item's own duration in step with the item total", () => {
    const values = toFormValues(stored);
    values.agendaItems[0].durationMinutes = 15;
    const back = toAgendaItems(values, stored);
    expect(back[0].durationSeconds).toBe(900);
    expect(back[0].speakers[0].durationSeconds).toBe(900);
  });
});

describe("delete confirmation", () => {
  it("does not prompt for an untouched row", () => {
    expect(itemHasContent(makeSpeakerItem())).toBe(false);
    expect(itemHasContent(makePanelItem())).toBe(false);
  });

  it("prompts once a speaker has been named", () => {
    const speaker = makeSpeakerItem();
    if (speaker.type === "speaker") speaker.speaker.name = "Maya";
    expect(itemHasContent(speaker)).toBe(true);
  });

  it("prompts for a panel with a host or any named panelist", () => {
    expect(itemHasContent(panelWith([5, 5]))).toBe(true);
    const bare = makePanelItem();
    if (bare.type === "panel") bare.panel.panelists[0].name = "Noah";
    expect(itemHasContent(bare)).toBe(true);
  });
});
