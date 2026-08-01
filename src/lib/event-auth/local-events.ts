"use client";

/*
 * Which events this browser has been let into, remembered locally so the home
 * screen can offer them again.
 *
 * Only what a person would see on the screen anyway is kept: an event id, its
 * display name. No password and no
 * session token — the session is an HTTP-only cookie the browser
 * manages, and localStorage is readable by any script that ever runs on this
 * origin.
 *
 * The list is a convenience, never an authorization, and it exists only on this
 * device — no endpoint offers a directory of events. Every entry is re-checked
 * against the server, and one that no longer resolves is dropped.
 */

const STORAGE_KEY = "aura:events";

export type RecentEvent = {
  eventId: string;
  name: string;
};

function isRecentEvent(value: unknown): value is RecentEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RecentEvent>;
  return (
    typeof candidate.eventId === "string" &&
    typeof candidate.name === "string"
  );
}

export function listRecentEvents(): RecentEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isRecentEvent) : [];
  } catch {
    return [];
  }
}

function write(entries: RecentEvent[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/** Newest first, and one entry per event however many times it is reopened. */
export function rememberEvent(entry: RecentEvent) {
  const rest = listRecentEvents().filter((existing) => existing.eventId !== entry.eventId);
  write([entry, ...rest]);
}

export function forgetEvent(eventId: string) {
  write(listRecentEvents().filter((entry) => entry.eventId !== eventId));
}

/** Keeps the listed name in step with a rename made in the editor. */
export function renameRecentEvent(eventId: string, name: string) {
  const entries = listRecentEvents();
  const match = entries.find((entry) => entry.eventId === eventId);
  if (!match || match.name === name) return;
  write(entries.map((entry) => (entry.eventId === eventId ? { ...entry, name } : entry)));
}
