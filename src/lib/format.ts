import type { AgendaItem, Speaker, TimerEvent, TimerSegment } from "@/lib/types";

export type TimerTone = "normal" | "caution" | "critical";

export const TIMER_CAUTION_SECONDS = 30;
export const TIMER_CRITICAL_SECONDS = 10;

/**
 * Countdowns keep running past zero. Negative values render with a leading
 * minus so the room can see exactly how far over a speaker has gone.
 */
export function formatTimer(totalSeconds: number) {
  const rounded = Math.ceil(totalSeconds);
  const absolute = Math.abs(rounded);
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  const seconds = absolute % 60;
  const body = hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return rounded < 0 ? `−${body}` : body;
}

/** A spoken form of the clock, for screen readers. */
export function describeTimer(totalSeconds: number) {
  const rounded = Math.ceil(totalSeconds);
  const absolute = Math.abs(rounded);
  const minutes = Math.floor(absolute / 60);
  const seconds = absolute % 60;
  const parts = [
    minutes ? `${minutes} minute${minutes === 1 ? "" : "s"}` : "",
    seconds ? `${seconds} second${seconds === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  const body = parts.length ? parts.join(" ") : "zero seconds";
  return rounded < 0 ? `${body} over time` : `${body} remaining`;
}

/** The shared yellow threshold for controller, audience, and Zoom displays. */
export function cautionThreshold(durationSeconds?: number) {
  void durationSeconds;
  return TIMER_CAUTION_SECONDS;
}

export function timerTone(remainingSeconds: number, durationSeconds?: number): TimerTone {
  void durationSeconds;
  if (remainingSeconds <= TIMER_CRITICAL_SECONDS) return "critical";
  if (remainingSeconds <= TIMER_CAUTION_SECONDS) return "caution";
  return "normal";
}

/** Fraction of the slot already spent, clamped to 0–1 for progress bars. */
export function elapsedRatio(remainingSeconds: number, durationSeconds: number) {
  if (durationSeconds <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - remainingSeconds / durationSeconds));
}

export function formatDuration(totalSeconds: number) {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

export function formatClockTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(
    new Date(timestamp),
  );
}

export function eventDuration(event: TimerEvent) {
  return event.agenda.reduce((sum, item) => sum + item.durationSeconds, 0);
}

export function agendaDuration(item: AgendaItem) {
  return item.durationSeconds;
}

export function kindLabel(kind: AgendaItem["kind"]) {
  return kind === "panel" ? "Panel" : "Speaker";
}

/**
 * A panel is named by its host when one is set — "Panel led by Ana" — and
 * otherwise by its line-up, which collapses to "Ana, Ben and 3 more" rather
 * than wrapping across the screen.
 */
export function panelLabel(item: AgendaItem) {
  const host = item.host?.trim();
  if (host) return `Panel led by ${host}`;
  const names = item.speakers.map((speaker) => speaker.name.trim()).filter(Boolean);
  if (!names.length) return "Panel";
  if (names.length <= 2) return names.join(" and ");
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/**
 * Whether the whole-panel countdown chimes. Panels default to silent: the
 * total runs out mid-sentence for whoever holds the microphone, so an alert
 * there interrupts rather than informs. Opt in per panel to override.
 */
export function isPanelMuted(item: AgendaItem) {
  return item.soundMuted ?? true;
}

/**
 * The control room's master switch for audience sound. Older events have no
 * value stored, and those should keep chiming, so absence means enabled.
 */
export function isSoundEnabled(runtime: { soundEnabled?: boolean }) {
  return runtime.soundEnabled ?? true;
}

/** Whether a speaker's own countdown chimes. Speakers alert by default. */
export function isSpeakerMuted(speaker: Speaker | undefined) {
  return speaker?.soundMuted ?? false;
}

/** The heading for an agenda item in lists and on the audience screen. */
export function itemLabel(item: AgendaItem) {
  if (item.kind === "panel") return panelLabel(item);
  return item.speakers[0]?.name.trim() || "Speaker";
}

export function flattenSegments(event: TimerEvent): TimerSegment[] {
  return event.agenda.flatMap((item) => {
    if (item.kind === "panel" && item.speakers.length) {
      return item.speakers.map((speaker) => ({
        id: speaker.id,
        agendaItemId: item.id,
        speaker: speaker.name || "Panelist",
        durationSeconds: speaker.durationSeconds,
        kind: item.kind,
      }));
    }
    return [
      {
        id: item.id,
        agendaItemId: item.id,
        speaker: item.speakers[0]?.name || "Speaker",
        durationSeconds: item.durationSeconds,
        kind: item.kind,
      },
    ];
  });
}

export function dateLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Date not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
