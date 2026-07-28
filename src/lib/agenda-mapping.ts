import type { AgendaItem, Speaker } from "@/lib/types";
import type { AgendaFormValues, AgendaItemValues } from "@/lib/agenda-schema";

/*
 * The form and the stored model differ deliberately.
 *
 * Storage keeps a flat shape in seconds because the timer engine counts in
 * seconds and Supabase columns are typed that way. The form uses a
 * discriminated union in minutes because that is what the editor's fields
 * actually represent, and a union lets TypeScript prove that panel-only
 * fields cannot be read off a speaker item.
 *
 * Converting in one place keeps the two from leaking into each other.
 */

const toMinutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));
const toSeconds = (minutes: number) => Math.max(1, Math.round(minutes)) * 60;

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function toFormValues(agenda: AgendaItem[]): AgendaFormValues {
  return {
    agendaItems: agenda.map((item): AgendaItemValues => {
      if (item.kind === "panel") {
        return {
          id: item.id,
          type: "panel",
          durationMinutes: toMinutes(item.durationSeconds),
          panel: {
            host: item.host ?? "",
            defaultPanelistMinutes: toMinutes(item.speakerDefaultSeconds ?? 5 * 60),
            panelists: item.speakers.map((speaker) => ({
              id: speaker.id,
              name: speaker.name,
              durationMinutes: toMinutes(speaker.durationSeconds),
            })),
          },
        };
      }
      return {
        id: item.id,
        type: "speaker",
        durationMinutes: toMinutes(item.durationSeconds),
        speaker: { name: item.speakers[0]?.name ?? "" },
      };
    }),
  };
}

/**
 * Back to storage. Existing speaker rows keep their ids so per-speaker
 * settings such as `soundMuted` survive a round trip through the editor.
 */
export function toAgendaItems(
  values: AgendaFormValues,
  previous: AgendaItem[] = [],
): AgendaItem[] {
  const previousById = new Map(previous.map((item) => [item.id, item]));

  return values.agendaItems.map((item): AgendaItem => {
    const existing = previousById.get(item.id);

    if (item.type === "panel") {
      const existingSpeakers = new Map(
        (existing?.speakers ?? []).map((speaker) => [speaker.id, speaker]),
      );
      return {
        id: item.id,
        kind: "panel",
        durationSeconds: toSeconds(item.durationMinutes),
        speakerDefaultSeconds: toSeconds(item.panel.defaultPanelistMinutes),
        host: item.panel.host.trim() || undefined,
        soundMuted: existing?.soundMuted,
        speakers: item.panel.panelists.map((panelist): Speaker => {
          const previousSpeaker = existingSpeakers.get(panelist.id);
          return {
            id: panelist.id,
            name: panelist.name,
            durationSeconds: toSeconds(panelist.durationMinutes),
            soundMuted: previousSpeaker?.soundMuted,
          };
        }),
      };
    }

    const previousSpeaker = existing?.speakers[0];
    return {
      id: item.id,
      kind: "single",
      durationSeconds: toSeconds(item.durationMinutes),
      soundMuted: existing?.soundMuted,
      speakers: [
        {
          id: previousSpeaker?.id ?? newId(),
          name: item.speaker.name,
          durationSeconds: toSeconds(item.durationMinutes),
          soundMuted: previousSpeaker?.soundMuted,
        },
      ],
    };
  });
}

export function makeSpeakerItem(durationMinutes = 10): AgendaItemValues {
  return {
    id: newId(),
    type: "speaker",
    durationMinutes,
    speaker: { name: "" },
  };
}

export function makePanelItem(defaultPanelistMinutes = 5): AgendaItemValues {
  return {
    id: newId(),
    type: "panel",
    durationMinutes: 20,
    panel: {
      host: "",
      defaultPanelistMinutes,
      panelists: [makePanelist(defaultPanelistMinutes), makePanelist(defaultPanelistMinutes)],
    },
  };
}

export function makePanelist(durationMinutes = 5) {
  return { id: newId(), name: "", durationMinutes };
}
