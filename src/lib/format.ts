import type { AgendaItem, AuraEvent, TimerSegment } from "@/lib/types";

export function formatTimer(totalSeconds: number) {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatDuration(totalSeconds: number) {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

export function eventDuration(event: AuraEvent) {
  return event.agenda.reduce((sum, item) => {
    if (item.kind === "panel" && item.speakers.length) {
      return sum + item.speakers.reduce((speakerSum, speaker) => speakerSum + speaker.durationSeconds, 0);
    }
    return sum + item.durationSeconds;
  }, 0);
}

export function agendaDuration(item: AgendaItem) {
  if (item.kind === "panel" && item.speakers.length) {
    return item.speakers.reduce((sum, speaker) => sum + speaker.durationSeconds, 0);
  }
  return item.durationSeconds;
}

export function flattenSegments(event: AuraEvent): TimerSegment[] {
  return event.agenda.flatMap((item) => {
    if (item.kind === "panel" && item.speakers.length) {
      return item.speakers.map((speaker) => ({
        id: speaker.id,
        agendaItemId: item.id,
        title: item.title,
        speaker: speaker.name || "Panelist",
        durationSeconds: speaker.durationSeconds,
        kind: item.kind,
      }));
    }
    return [
      {
        id: item.id,
        agendaItemId: item.id,
        title: item.title,
        speaker: item.speakers[0]?.name || "Single speaker",
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
