"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgendaItem, TimerEvent } from "@/lib/types";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { pullPublicEvent, pullZoomEvent, type PublicEventResult } from "@/lib/supabase/remote";
import {
  findCachedEventByViewerToken,
  findCachedEventByZoomToken,
  subscribeLocalChanges,
} from "@/lib/controller/persistence";
import { usePolling, type PollGuard } from "@/lib/controller/polling";

/*
 * Event construction, and the two anonymous read paths.
 *
 * An event is an independent resource: it has no team, no workspace and no owner
 * beyond its own controller credentials. Everything a controller does with one
 * lives in `useControllerEvent`; what remains here is how an event is built and
 * how the two screens that hold no credentials read one — the audience display,
 * by viewer token, and the Zoom App, by pairing code.
 *
 * Both read by polling, once a second, and neither ever writes. Nothing in this
 * module opens a Supabase Realtime channel: a public channel is one anybody
 * holding an audience link could also publish on, which would let them push a
 * fabricated timer to every screen watching. Cloud synchronisation here is the
 * poll, and the database is the only thing that can answer it.
 *
 * The loop itself lives in `@/lib/controller/polling`, shared with the controller,
 * so all three screens get the same single-flight behaviour: one request at a time,
 * one timer, reconciliation coalesced rather than raced, and a response from a
 * superseded token discarded instead of applied.
 */

const POLL_INTERVAL_MS = 1000;
/* While the tab is hidden nobody is reading it, so the poll backs right off. */
const HIDDEN_POLL_INTERVAL_MS = 15_000;

/**
 * Every id here is persisted into a `uuid` column, so the fallback is v4-shaped
 * too rather than a timestamp string the database would refuse.
 */
function makeId() {
  const source: Crypto | undefined = typeof crypto === "undefined" ? undefined : crypto;
  if (source?.randomUUID) return source.randomUUID();
  const bytes = new Uint8Array(16);
  if (source?.getRandomValues) {
    source.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function makeAgendaItem(kind: "single" | "panel" = "single"): AgendaItem {
  const id = makeId();
  return {
    id,
    kind,
    durationSeconds: kind === "panel" ? 20 * 60 : 10 * 60,
    speakerDefaultSeconds: kind === "panel" ? 5 * 60 : undefined,
    speakers:
      kind === "panel"
        ? [
            { id: makeId(), name: "First panelist", durationSeconds: 5 * 60 },
            { id: makeId(), name: "Second panelist", durationSeconds: 5 * 60 },
          ]
        : [{ id: makeId(), name: "", durationSeconds: 10 * 60 }],
  };
}

export function makeEvent(name = "Untitled event"): TimerEvent {
  const first = makeAgendaItem();
  return {
    id: makeId(),
    name,
    date: new Date().toISOString().slice(0, 10),
    status: "draft",
    viewerToken: makeId(),
    agenda: [first],
    runtime: {
      status: "ready",
      segmentIndex: 0,
      remainingSeconds: first.durationSeconds,
      endsAt: null,
      panelStatus: null,
      panelRemainingSeconds: null,
      panelEndsAt: null,
      soundEnabled: true,
      updatedAt: Date.now(),
    },
    createdAt: Date.now(),
  };
}

/**
 * How a read-only screen is currently doing.
 *
 * `unavailable` and `not-found` are deliberately different: the first keeps the
 * last known timer on screen behind a warning, the second clears it.
 */
export type PublicConnection = "connecting" | "live" | "not-found" | "unavailable";

/**
 * The audience display's read: one event, addressed by its unguessable viewer
 * token, with no credentials involved at any point.
 *
 * Two sources. A once-a-second poll of the durable state is the authority. This
 * device's own controller cache is consulted as well, so an operator previewing
 * their own audience link on the machine running the show sees their saves
 * immediately and without a round trip.
 */
export function usePublicEvent(token: string) {
  const [event, setEvent] = useState<TimerEvent | null>(null);
  const [connection, setConnection] = useState<PublicConnection>("connecting");

  const client = useRef(isSupabaseConfigured() ? createSupabaseBrowserClient() : null);

  const apply = useCallback((result: PublicEventResult) => {
    if (result.status === "found") {
      setEvent(result.event);
      setConnection("live");
      return;
    }
    if (result.status === "not-found") {
      /*
       * The database answered and there is no such event, so it has been deleted
       * or the token is wrong. An already-open screen must stop showing it.
       */
      setEvent(null);
      setConnection("not-found");
      return;
    }
    // Nothing is known. Keep whatever is on screen and say the link is down.
    setConnection("unavailable");
  }, []);

  useEffect(() => {
    /*
     * This device's own cache paints first, so an operator previewing their own
     * audience link on the machine running the show sees it without a round trip.
     *
     * A viewer token *is* an event, so a change of token replaces what is on screen
     * rather than leaving it there. Keeping the previous event visible "until the
     * new one answers" means a room can be shown another event's countdown under a
     * link that has nothing to do with it — and if the new token is unreachable, be
     * shown it indefinitely. This token's cached event takes over if this device has
     * one; otherwise the screen clears while it connects.
     *
     * Cancelled with the effect, so a lookup queued for a token that has since been
     * replaced — or for a screen that has gone away — does nothing.
     */
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setEvent(findCachedEventByViewerToken(token) ?? null);
      /*
       * A definitive answer about the *previous* token says nothing about this one.
       * `unavailable` is left alone because it is also the answer when there is no
       * client at all, which the leading poll has already reported by now.
       */
      setConnection((current) =>
        current === "live" || current === "not-found" ? "connecting" : current,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  usePolling(
    useCallback(
      async (guard: PollGuard) => {
        const active = client.current;
        if (!active) {
          setConnection((current) => (current === "connecting" ? "unavailable" : current));
          return;
        }
        const result = await pullPublicEvent(active, token);
        /*
         * A response that outlived its effect belongs to a token that is no longer
         * on screen, or to an unmounted component. Applying it would put another
         * event's timer in front of the room.
         */
        if (!guard.isCurrent()) return;
        apply(result);
      },
      [apply, token],
    ),
    Boolean(token),
    { visibleIntervalMs: POLL_INTERVAL_MS, hiddenIntervalMs: HIDDEN_POLL_INTERVAL_MS },
  );

  /*
   * Same-device tabs. Keyed on the resolved event id, because that is what the
   * controller writes its cache under — subscribing by viewer token listened to a
   * key that never changes and so never fired.
   */
  const eventId = event?.id;
  useEffect(() => {
    if (!eventId) return;
    return subscribeLocalChanges(eventId, () => {
      const cached = findCachedEventByViewerToken(token);
      if (cached) setEvent(cached);
    });
  }, [eventId, token]);

  return { event, connection };
}

export type ZoomEventConnection =
  | "idle"
  | "connecting"
  | "not-found"
  | "polling"
  | "live"
  | "unavailable";

/**
 * The Zoom App's read path: an event addressed by its pairing code rather than
 * by an audience token. It is deliberately a sibling of `usePublicEvent` rather
 * than a generalisation of it — the audience display is the one screen that must
 * never regress.
 *
 * Read-only throughout, by polling. Supabase stays the authoritative timer, and
 * the Zoom page has no way to write to it or to tell any other screen anything.
 */
export function useZoomEvent(zoomToken: string) {
  const [event, setEvent] = useState<TimerEvent | null>(null);
  const [connection, setConnection] = useState<ZoomEventConnection>("idle");

  const client = useRef(isSupabaseConfigured() ? createSupabaseBrowserClient() : null);

  useEffect(() => {
    /*
     * State is set from a microtask rather than straight from the effect body,
     * which is how the rest of this module keeps a subscription's first paint
     * out of the render that created it. Cancelled with the effect, so a lookup
     * queued for one pairing code cannot resolve onto a screen that has since
     * been given a different one — or unmounted.
     */
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!zoomToken) {
        setEvent(null);
        setConnection("idle");
        return;
      }
      const local = findCachedEventByZoomToken(zoomToken);
      /*
       * A new pairing code is a different event, so the previous one's timer is
       * replaced rather than left on screen underneath it — the meeting would
       * otherwise be shown a countdown belonging to something else.
       */
      setEvent(local ?? null);
      setConnection(client.current ? "connecting" : local ? "polling" : "unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, [zoomToken]);

  usePolling(
    useCallback(
      async (guard: PollGuard) => {
        const active = client.current;
        if (!active) return;
        const result = await pullZoomEvent(active, zoomToken);
        // The pairing code may have been changed while this was on the wire.
        if (!guard.isCurrent()) return;
        if (result.status === "found") {
          setEvent(result.event);
          setConnection("live");
          return;
        }
        if (result.status === "not-found") {
          // Deleted, or a code that matches nothing. Stop showing a stale timer.
          setEvent(null);
          setConnection("not-found");
          return;
        }
        // Keep the last known timer; say the connection is the problem.
        setConnection("unavailable");
      },
      [zoomToken],
    ),
    Boolean(zoomToken),
    { visibleIntervalMs: POLL_INTERVAL_MS, hiddenIntervalMs: HIDDEN_POLL_INTERVAL_MS },
  );

  return { event, connection };
}
