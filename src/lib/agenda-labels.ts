import type { AgendaItemValues } from "@/lib/agenda-schema";

/**
 * What an agenda item is called in lists and headers.
 *
 * Items carry no separate title — they are identified by who is on them, so a
 * panel reads as "Panel led by …" once a host exists and falls back to its
 * line-up otherwise. The index-based fallback keeps a brand-new empty row
 * addressable in labels and confirmation copy.
 */
export function agendaItemTitle(item: AgendaItemValues, index: number) {
  if (item.type === "speaker") {
    return item.speaker.name.trim() || `Speaker ${index + 1}`;
  }

  const host = item.panel.host.trim();
  if (host) return `Panel led by ${host}`;

  const names = item.panel.panelists
    .map((panelist) => panelist.name.trim())
    .filter(Boolean);
  if (!names.length) return `Panel ${index + 1}`;
  if (names.length <= 2) return names.join(" and ");
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}
