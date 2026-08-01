"use client";

import type { TimerEvent } from "@/lib/types";

/*
 * Everything this browser keeps on disk about an event it can control.
 *
 * Three separate things, all scoped to one event id and none of them a
 * credential:
 *
 * - a cache of the last known **server** state, in `localStorage`, so a reload
 *   paints immediately and an audience or Zoom lookup on this device can resolve a
 *   token without a round trip. It only ever holds what the server has
 *   acknowledged, which is why it is safe to share between tabs;
 * - an outbox holding an edit that has not been acknowledged by the server yet, in
 *   `sessionStorage`, so navigating away, reloading or losing the network does not
 *   lose it;
 * - a list of events this device has opened, in `localStorage`, purely so the home
 *   screen can offer them again.
 *
 * ## Why the outbox is in `sessionStorage`
 *
 * `sessionStorage` is per tab. `localStorage` is per origin, so one slot per event
 * meant two tabs of the same browser shared it: each would overwrite the other's
 * unsaved edit before the server ever had the chance to answer, and an
 * acknowledgement in one tab could clear work that only existed in the other.
 *
 * The alternative was coordination — a lease, a leader, Web Locks — which buys
 * one editable tab at the cost of ownership, heartbeats, takeover and a read-only
 * mode. Concurrent controllers are rare here, and the database already resolves
 * them properly: every save carries the version it started from, the first one
 * wins, and a later one gets a 409 carrying the winning state. So the browser
 * boundary is the browser's own: each tab gets its own outbox, no tab can see or
 * touch another's, and genuine conflicts are settled by the version check rather
 * than by whichever tab wrote to `localStorage` last.
 *
 * **The tradeoff, stated plainly:** an edit that never reached the server dies
 * with its tab. `sessionStorage` survives a reload in that tab but not closing
 * it. The autosave debounce is a fraction of a second, so the window is small,
 * and it is the price of having no coordination protocol at all.
 *
 * No password and no session token is ever written here. The session is an
 * HTTP-only cookie the browser manages, and anything in web storage is readable
 * by any script that ever runs on this origin.
 */

const CACHE_PREFIX = "aura:event:";
const OUTBOX_PREFIX = "aura:outbox:";
const CHANNEL_NAME = "aura-timer-sync";

export type CachedEvent = {
  event: TimerEvent;
  /** The `events.version` this snapshot was read at. */
  version: number;
  cachedAt: number;
};

/**
 * An edit the server has not confirmed. It carries the version it expects, so a
 * retry after a reload keeps the same optimistic-concurrency guarantee the
 * original attempt had rather than blindly overwriting.
 *
 * `revision` is an opaque globally unique id, minted per edit and persisted with
 * it. It exists to close a data-loss race: edit A goes in flight, edit B replaces
 * it in the outbox, then A succeeds. Clearing the outbox on A's success would
 * discard B, which by then exists only in memory and dies on the next reload.
 * A save therefore reports which revision it acknowledged, and the entry is
 * cleared only when that is *exactly* the revision on disk.
 *
 * Deliberately opaque rather than a counter, even though the outbox is now per
 * tab. A counter derived from what is currently on disk restarts at 1 whenever
 * the outbox is empty, so equality would stop meaning identity within a single
 * tab's own sequence of edits. An opaque id cannot collide, so "the one I sent"
 * is always answerable.
 */
export type OutboxEntry = {
  eventId: string;
  event: TimerEvent;
  expectedVersion: number;
  /** Opaque and globally unique. Never derived from the previous value. */
  revision: string;
  status: "pending" | "failed";
  /** Why the last attempt failed, for the operator and for the retry decision. */
  lastError: string | null;
  updatedAt: number;
};

/**
 * Where a group of keys lives. Resolved per call rather than captured, because
 * these modules are imported during server rendering, where there is no
 * `window` at all.
 */
type StorageSource = () => Storage | null;

/** Shared between tabs: acknowledged server state only. */
const sharedStorage: StorageSource = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** This tab alone: unsaved work, which no other tab may see or overwrite. */
const tabStorage: StorageSource = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

function readJson<T>(source: StorageSource, key: string): T | null {
  const storage = source();
  if (!storage) return null;
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(source: StorageSource, key: string, value: unknown) {
  const storage = source();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked quota must not take the control room down; the server
    // remains authoritative and the in-memory state is still correct.
  }
}

function removeKey(source: StorageSource, key: string) {
  const storage = source();
  if (!storage) return;
  storage.removeItem(key);
}

// --- cached server state -----------------------------------------------------

export function readEventCache(eventId: string) {
  return readJson<CachedEvent>(sharedStorage, `${CACHE_PREFIX}${eventId}`);
}

export function writeEventCache(eventId: string, event: TimerEvent, version: number) {
  writeJson(sharedStorage, `${CACHE_PREFIX}${eventId}`, {
    event,
    version,
    cachedAt: Date.now(),
  });
}

export function clearEventCache(eventId: string) {
  removeKey(sharedStorage, `${CACHE_PREFIX}${eventId}`);
}

/** Every cached event on this device. Used by the two token lookups below. */
function eachCachedEvent(): CachedEvent[] {
  const storage = sharedStorage();
  if (!storage) return [];
  const found: CachedEvent[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(CACHE_PREFIX)) continue;
    const entry = readJson<CachedEvent>(sharedStorage, key);
    if (entry?.event?.id) found.push(entry);
  }
  return found;
}

/**
 * The offline half of the audience lookup: an operator previewing their own
 * audience link on the machine running the show resolves it without a round trip.
 */
export function findCachedEventByViewerToken(token: string) {
  return eachCachedEvent().find((entry) => entry.event.viewerToken === token)?.event ?? null;
}

/** The same, for a Zoom pairing code. */
export function findCachedEventByZoomToken(zoomToken: string) {
  return eachCachedEvent().find((entry) => entry.event.zoomToken === zoomToken)?.event ?? null;
}

// --- outbox -----------------------------------------------------------------

/**
 * A fresh revision id. Independent of anything already stored, so it cannot
 * collide with an id minted for a different edit.
 */
export function makeOutboxRevision() {
  const source: Crypto | undefined = typeof crypto === "undefined" ? undefined : crypto;
  if (source?.randomUUID) return source.randomUUID();
  return `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export type OutboxStore = {
  read: (eventId: string) => OutboxEntry | null;
  write: (entry: OutboxEntry) => void;
  clear: (eventId: string) => void;
  settle: (
    eventId: string,
    acknowledgedRevision: string,
    committedVersion: number,
  ) => OutboxEntry | null;
  markFailed: (eventId: string, revision: string, lastError: string) => void;
  listEventIds: () => string[];
};

/**
 * The outbox operations, bound to one storage area.
 *
 * A factory rather than six free functions because "one tab's outbox" is the
 * whole isolation guarantee, and the only way to test that two of them cannot
 * settle, fail, clear or overwrite each other is to be able to hold two. In a
 * browser there is exactly one, backed by that tab's `sessionStorage`.
 */
export function createOutboxStore(source: StorageSource): OutboxStore {
  const read = (eventId: string) =>
    readJson<OutboxEntry>(source, `${OUTBOX_PREFIX}${eventId}`);

  const write = (entry: OutboxEntry) =>
    writeJson(source, `${OUTBOX_PREFIX}${entry.eventId}`, entry);

  /*
   * Called only once the server has confirmed the write, or when the operator
   * explicitly discards the edit. Until then the entry stays, which is what makes
   * a reload mid-save recoverable.
   */
  const clear = (eventId: string) => removeKey(source, `${OUTBOX_PREFIX}${eventId}`);

  return {
    read,
    write,
    clear,

    /**
     * Clears the outbox only when it still holds exactly the revision the server
     * acknowledged.
     *
     * If a different edit arrived while that save was in flight, it stays — with
     * its expected version advanced to the version the acknowledged save just
     * created, so its retry is a legitimate write against current state rather
     * than a doomed one against a version that has moved on.
     *
     * Equality, never ordering. Comparing with `<=` assumed revisions were
     * comparable numbers; with opaque ids there is no ordering to rely on, and
     * "not the one I sent" is the only question worth asking.
     *
     * Returns the entry still outstanding, or null if the outbox is now empty.
     */
    settle: (eventId, acknowledgedRevision, committedVersion) => {
      const entry = read(eventId);
      if (!entry) return null;
      if (entry.revision === acknowledgedRevision) {
        clear(eventId);
        return null;
      }
      const advanced: OutboxEntry = {
        ...entry,
        expectedVersion: committedVersion,
        status: "pending",
        lastError: null,
        updatedAt: Date.now(),
      };
      write(advanced);
      return advanced;
    },

    /**
     * Records why an attempt failed without losing the edit itself.
     *
     * Only the revision that was actually attempted is marked. An older request
     * failing says nothing about a newer edit that has since replaced it, and
     * marking that newer entry `failed` would misreport work that has not been
     * tried yet.
     */
    markFailed: (eventId, revision, lastError) => {
      const entry = read(eventId);
      if (!entry || entry.revision !== revision) return;
      write({ ...entry, status: "failed", lastError, updatedAt: Date.now() });
    },

    listEventIds: () => {
      const storage = source();
      if (!storage) return [];
      const ids: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(OUTBOX_PREFIX)) ids.push(key.slice(OUTBOX_PREFIX.length));
      }
      return ids;
    },
  };
}

/** This tab's outbox. Another tab of the same browser has its own, and only its own. */
const outbox = createOutboxStore(tabStorage);

export function readOutbox(eventId: string) {
  return outbox.read(eventId);
}

export function writeOutbox(entry: OutboxEntry) {
  outbox.write(entry);
}

export function clearOutbox(eventId: string) {
  outbox.clear(eventId);
}

export function settleOutbox(
  eventId: string,
  acknowledgedRevision: string,
  committedVersion: number,
) {
  return outbox.settle(eventId, acknowledgedRevision, committedVersion);
}

export function markOutboxFailed(eventId: string, revision: string, lastError: string) {
  outbox.markFailed(eventId, revision, lastError);
}

export function listOutboxEventIds() {
  return outbox.listEventIds();
}

// --- same-device notification ----------------------------------------------

/**
 * Tells other tabs on this device that one event's saved state changed. Other
 * devices learn the same thing by polling; this is only for the second tab, where
 * a round trip would be wasted.
 *
 * Deliberately still `localStorage` and `BroadcastChannel`: everything travelling
 * this way is state the server has already acknowledged, so a tab adopting it
 * cannot lose anything of its own. Unsaved work never crosses tabs.
 */
export function notifyLocalChange(eventId: string) {
  if (typeof window === "undefined") return;
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ eventId, at: Date.now() });
    channel.close();
  } catch {
    // The storage event remains a reliable fallback.
  }
}

export function subscribeLocalChanges(eventId: string, onChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key === `${CACHE_PREFIX}${eventId}`) onChange();
  };
  window.addEventListener("storage", onStorage);

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (message) => {
      if (message.data?.eventId === eventId) onChange();
    };
  } catch {
    channel = null;
  }

  return () => {
    window.removeEventListener("storage", onStorage);
    channel?.close();
  };
}
