import { z } from "zod";

/*
 * The editor works in whole minutes because that is how a run of show is
 * planned and spoken about. The persisted domain model stores seconds, so the
 * mappers in `agenda-mapping.ts` convert at the boundary rather than letting
 * two units mix inside the form.
 */
const minutes = z
  .number({ message: "Enter a number of minutes" })
  .int("Use whole minutes")
  .positive("Must be at least 1 minute")
  .max(1440, "That is longer than a day");

const requiredName = (label: string) =>
  z.string().trim().min(1, `${label} is required`).max(120, "That name is too long");

export const panelistSchema = z.object({
  id: z.string(),
  name: requiredName("Panelist name"),
  durationMinutes: minutes,
});

const speakerItemSchema = z.object({
  id: z.string(),
  type: z.literal("speaker"),
  durationMinutes: minutes,
  speaker: z.object({ name: requiredName("Speaker name") }),
});

const panelItemSchema = z.object({
  id: z.string(),
  type: z.literal("panel"),
  durationMinutes: minutes,
  panel: z.object({
    host: requiredName("Host name"),
    defaultPanelistMinutes: minutes,
    panelists: z.array(panelistSchema).min(1, "A panel needs at least one panelist"),
  }),
});

/*
 * Cross-field rules live on the item rather than on individual fields, because
 * they are only meaningful once both sides are known. Attaching them with a
 * path puts the message on the card that owns the problem.
 */
export const agendaItemSchema = z.discriminatedUnion("type", [
  speakerItemSchema,
  panelItemSchema,
]).superRefine((item, ctx) => {
  if (item.type === "panel") {
    const used = item.panel.panelists.reduce(
      (sum, panelist) => sum + (Number.isFinite(panelist.durationMinutes) ? panelist.durationMinutes : 0),
      0,
    );
    if (used > item.durationMinutes) {
      ctx.addIssue({
        code: "custom",
        path: ["panel", "panelists"],
        message: `Panelists total ${used} min, which is ${used - item.durationMinutes} min over the ${item.durationMinutes} min panel.`,
      });
    }
    item.panel.panelists.forEach((panelist, index) => {
      if (panelist.durationMinutes > item.durationMinutes) {
        ctx.addIssue({
          code: "custom",
          path: ["panel", "panelists", index, "durationMinutes"],
          message: "Longer than the whole panel",
        });
      }
    });
  }
});

export const agendaFormSchema = z.object({
  agendaItems: z.array(agendaItemSchema).min(1, "Add at least one agenda item"),
});

export type PanelistValues = z.infer<typeof panelistSchema>;
export type AgendaItemValues = z.infer<typeof agendaItemSchema>;
export type AgendaFormValues = z.infer<typeof agendaFormSchema>;

/** Minutes already allocated to panelists. Derived, never stored. */
export function usedPanelMinutes(item: AgendaItemValues) {
  if (item.type !== "panel") return 0;
  return item.panel.panelists.reduce(
    (sum, panelist) =>
      sum + (Number.isFinite(panelist.durationMinutes) ? panelist.durationMinutes : 0),
    0,
  );
}

/**
 * Unallocated panel time. Negative when panelists overrun, which the card
 * surfaces as an error; a positive remainder is allowed, because a host
 * routinely holds back time for questions.
 */
export function remainingPanelMinutes(item: AgendaItemValues) {
  if (item.type !== "panel") return 0;
  return item.durationMinutes - usedPanelMinutes(item);
}

/** Whole-programme total, used by the editor summary. */
export function totalProgrammeMinutes(values: AgendaFormValues) {
  return values.agendaItems.reduce(
    (sum, item) => sum + (Number.isFinite(item.durationMinutes) ? item.durationMinutes : 0),
    0,
  );
}

/** True once a row holds something a person would be sorry to lose. */
export function itemHasContent(item: AgendaItemValues) {
  if (item.type === "speaker") return item.speaker.name.trim().length > 0;
  return (
    item.panel.host.trim().length > 0 ||
    item.panel.panelists.some((panelist) => panelist.name.trim().length > 0)
  );
}
