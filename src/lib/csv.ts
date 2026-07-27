import { makeEvent } from "@/lib/store";
import type { AgendaItem, AuraEvent, Speaker } from "@/lib/types";

type CsvRow = Record<string, string>;

function parseRows(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseEventCsv(source: string): AuraEvent[] {
  const rows = parseRows(source);
  if (rows.length < 2) throw new Error("The CSV needs a header and at least one data row.");
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const missing = ["event_name", "item_type", "item_title"].filter(
    (header) => !headers.includes(header),
  );
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}`);

  const records = rows.slice(1).map((values) =>
    headers.reduce<CsvRow>((record, header, index) => {
      record[header] = values[index] ?? "";
      return record;
    }, {}),
  );
  const byEvent = new Map<string, CsvRow[]>();
  records.forEach((record) => {
    if (!record.event_name) return;
    byEvent.set(record.event_name, [...(byEvent.get(record.event_name) ?? []), record]);
  });
  if (!byEvent.size) throw new Error("No event names were found in the CSV.");

  return Array.from(byEvent.entries()).map(([eventName, eventRows]) => {
    const event = makeEvent(eventName);
    event.date = eventRows[0].event_date || event.date;
    event.location = eventRows[0].location || "Main stage";
    const byItem = new Map<string, CsvRow[]>();
    eventRows.forEach((record, rowIndex) => {
      const key = `${record.item_order || record.item_title || rowIndex + 1}:${record.item_title}`;
      byItem.set(key, [...(byItem.get(key) ?? []), record]);
    });
    event.agenda = Array.from(byItem.entries())
      .sort(([left], [right]) => Number(left.split(":")[0]) - Number(right.split(":")[0]))
      .map(([, itemRows]): AgendaItem => {
        const first = itemRows[0];
        const kind = first.item_type.toLowerCase() === "panel" ? "panel" : "single";
        const defaultMinutes = positiveNumber(first.speaker_default_minutes, 5);
        const speakers: Speaker[] =
          kind === "panel"
            ? itemRows.map((record, index) => ({
                id: crypto.randomUUID(),
                name: record.speaker_name || `Panelist ${index + 1}`,
                durationSeconds: positiveNumber(record.speaker_minutes, defaultMinutes) * 60,
              }))
            : [
                {
                  id: crypto.randomUUID(),
                  name: first.speaker_name || "",
                  durationSeconds: positiveNumber(first.duration_minutes, 10) * 60,
                },
              ];
        return {
          id: crypto.randomUUID(),
          kind,
          title: first.item_title,
          durationSeconds:
            kind === "panel"
              ? positiveNumber(
                  first.panel_total_minutes,
                  speakers.reduce((sum, speaker) => sum + speaker.durationSeconds, 0) / 60,
                ) * 60
              : positiveNumber(first.duration_minutes, 10) * 60,
          speakerDefaultSeconds: kind === "panel" ? defaultMinutes * 60 : undefined,
          speakers,
        };
      });
    const first = event.agenda[0];
    event.runtime.remainingSeconds =
      first.kind === "panel"
        ? first.speakers[0]?.durationSeconds ?? first.speakerDefaultSeconds ?? 300
        : first.durationSeconds;
    event.runtime.panelStatus = first.kind === "panel" ? "ready" : null;
    event.runtime.panelRemainingSeconds = first.kind === "panel" ? first.durationSeconds : null;
    return event;
  });
}
