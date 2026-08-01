import { z } from "zod";
import type { TimerEvent } from "@/lib/types";

/*
 * The validation boundary for a controller write.
 *
 * The whole event travels as one JSON document because it is replaced as one
 * transaction, and this schema is the only place that document is trusted. Every
 * numeric bound below is also a CHECK constraint on the underlying table, so a
 * document that reached PostgreSQL without passing through here would still be
 * refused; validating in the server first is what turns a database error into a
 * useful 400.
 */

const MAX_DURATION_SECONDS = 86_400;
/* `events.name` and `agenda_items.host` are both CHECK-constrained to 120. */
const MAX_NAME_LENGTH = 120;
const MAX_HOST_LENGTH = 120;
/*
 * `speakers.name` carries no length CHECK, so this is the API's own bound rather
 * than a mirror of one. Kept generous enough for a real name with titles.
 */
const MAX_SPEAKER_LENGTH = 160;
/*
 * `event_runtime.remaining_seconds` and `panel_remaining_seconds` are bounded to
 * a day either side of zero, negative included, so a timer running into overtime
 * persists as the negative number it really is.
 */
const MAX_OVERTIME_SECONDS = 86_400;

/** Far enough ahead to be unreachable, close enough to reject a nonsense value. */
const MAX_EPOCH_MS = 4_000_000_000_000;

const durationSeconds = z.number().int().min(1).max(MAX_DURATION_SECONDS);
const epochMs = z.number().int().min(0).max(MAX_EPOCH_MS);
const timerStatus = z.enum(["ready", "running", "paused", "ended"]);

const speakerSchema = z.object({
  id: z.uuid(),
  name: z.string().max(MAX_SPEAKER_LENGTH),
  durationSeconds,
  soundMuted: z.boolean().nullish(),
});

const agendaItemSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["single", "panel"]),
  durationSeconds,
  speakerDefaultSeconds: durationSeconds.nullish(),
  host: z.string().max(MAX_HOST_LENGTH).nullish(),
  soundMuted: z.boolean().nullish(),
  speakers: z.array(speakerSchema).min(1).max(200),
});

/*
 * A countdown does not stop at zero: it keeps counting and the display turns red.
 * Negative is therefore a real, storable value, bounded rather than unbounded so
 * a nonsensical number is still refused. These bounds are the same ones the
 * `event_runtime` CHECK constraints enforce.
 */
const overtimeSeconds = z.number().min(-MAX_OVERTIME_SECONDS).max(MAX_OVERTIME_SECONDS);

const runtimeSchema = z.object({
  status: timerStatus,
  segmentIndex: z.number().int().min(0).max(10_000),
  remainingSeconds: overtimeSeconds,
  endsAt: epochMs.nullish(),
  panelStatus: timerStatus.nullish(),
  panelRemainingSeconds: overtimeSeconds.nullish(),
  panelEndsAt: epochMs.nullish(),
  soundEnabled: z.boolean().nullish(),
  updatedAt: z.number().finite().nullish(),
});

export const eventPayloadSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  status: z.enum(["draft", "live", "completed"]),
  viewerToken: z.uuid(),
  // Matches the char_length(8..64) CHECK on events.zoom_token.
  zoomToken: z.string().regex(/^[0-9A-Z]{8,64}$/).nullish(),
  agenda: z.array(agendaItemSchema).min(1).max(500),
  runtime: runtimeSchema,
  createdAt: z.number().finite().nullish(),
});

export type EventPayload = z.infer<typeof eventPayloadSchema>;

/**
 * Rounded to milliseconds, and otherwise left exactly as it is — negative
 * included. Clamping overtime to zero would throw away the one number an operator
 * running late is actually looking at.
 */
function roundSeconds(value: number) {
  return Math.round(value * 1000) / 1000;
}

/**
 * The document actually handed to PostgreSQL. Optional fields become explicit
 * nulls so a removed host or a cleared mute is written rather than left behind,
 * and derived fields the database owns are dropped.
 */
export function toDatabaseEvent(event: EventPayload) {
  return {
    id: event.id,
    name: event.name,
    date: event.date,
    status: event.status,
    viewerToken: event.viewerToken,
    zoomToken: event.zoomToken ?? null,
    agenda: event.agenda.map((item) => ({
      id: item.id,
      kind: item.kind,
      durationSeconds: item.durationSeconds,
      speakerDefaultSeconds: item.speakerDefaultSeconds ?? null,
      host: item.host ?? null,
      soundMuted: item.soundMuted ?? null,
      speakers: item.speakers.map((speaker) => ({
        id: speaker.id,
        name: speaker.name,
        durationSeconds: speaker.durationSeconds,
        soundMuted: speaker.soundMuted ?? null,
      })),
    })),
    runtime: {
      status: event.runtime.status,
      segmentIndex: event.runtime.segmentIndex,
      remainingSeconds: roundSeconds(event.runtime.remainingSeconds),
      endsAt: event.runtime.endsAt ?? null,
      panelStatus: event.runtime.panelStatus ?? null,
      panelRemainingSeconds:
        event.runtime.panelRemainingSeconds === null ||
        event.runtime.panelRemainingSeconds === undefined
          ? null
          : roundSeconds(event.runtime.panelRemainingSeconds),
      panelEndsAt: event.runtime.panelEndsAt ?? null,
      soundEnabled: event.runtime.soundEnabled ?? true,
    },
  };
}

/** What the application works in, once a validated document has been accepted. */
export function toTimerEvent(event: EventPayload): TimerEvent {
  return {
    id: event.id,
    name: event.name,
    date: event.date,
    status: event.status,
    viewerToken: event.viewerToken,
    zoomToken: event.zoomToken ?? undefined,
    agenda: event.agenda.map((item) => ({
      id: item.id,
      kind: item.kind,
      durationSeconds: item.durationSeconds,
      speakerDefaultSeconds: item.speakerDefaultSeconds ?? undefined,
      host: item.host ?? undefined,
      soundMuted: item.soundMuted ?? undefined,
      speakers: item.speakers.map((speaker) => ({
        id: speaker.id,
        name: speaker.name,
        durationSeconds: speaker.durationSeconds,
        soundMuted: speaker.soundMuted ?? undefined,
      })),
    })),
    runtime: {
      status: event.runtime.status,
      segmentIndex: event.runtime.segmentIndex,
      remainingSeconds: event.runtime.remainingSeconds,
      endsAt: event.runtime.endsAt ?? null,
      panelStatus: event.runtime.panelStatus ?? null,
      panelRemainingSeconds: event.runtime.panelRemainingSeconds ?? null,
      panelEndsAt: event.runtime.panelEndsAt ?? null,
      soundEnabled: event.runtime.soundEnabled ?? true,
      updatedAt: event.runtime.updatedAt ?? Date.now(),
    },
    createdAt: event.createdAt ?? Date.now(),
  };
}
