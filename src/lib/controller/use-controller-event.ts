"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TimerEvent } from "@/lib/types";
import {
  deleteControllerEvent,
  fetchControllerEvent,
  logoutOfEvent,
  saveControllerEvent,
  type ApiFailureCode,
} from "@/lib/event-auth/client";
import { forgetEvent, rememberEvent, renameRecentEvent } from "@/lib/event-auth/local-events";
import type { ControllerEvent } from "@/lib/event-auth/types";
import { SaveCoordinator, type SaveState } from "@/lib/save-coordinator";
import {
  clearEventCache,
  clearOutbox,
  makeOutboxRevision,
  markOutboxFailed,
  notifyLocalChange,
  readEventCache,
  readOutbox,
  settleOutbox,
  subscribeLocalChanges,
  writeEventCache,
  writeOutbox,
} from "@/lib/controller/persistence";
import { usePolling, type PollGuard } from "@/lib/controller/polling";

/*
 * One event, one controller, one hook.
 *
 * There is no workspace and no team: an event is an independent resource and this
 * is everything a controller device needs to hold it. Supabase is authoritative;
 * localStorage is a cache of what the server has acknowledged, this tab's
 * sessionStorage is an outbox for what it has not, and neither is ever the reason
 * an event exists.
 *
 * Three things happen on mount, in this order, and the order matters:
 *
 * 1. The cache paints, so the control room is usable immediately.
 * 2. Any unsaved edit in the outbox is adopted as the displayed state and queued
 *    for retry. A reload mid-save resumes rather than losing the work.
 * 3. The server is asked for the authoritative version. If the outbox is empty
 *    the answer replaces the cache; if it is not, a mismatch is a conflict, and
 *    the server's copy never silently overwrites an unsaved local edit.
 *
 * After that the event is re-read about once a second while the tab is visible.
 * That poll is the whole of cross-device synchronisation: a second controller
 * device picks up committed changes without a refresh, and nothing a browser can
 * say is ever trusted as authoritative. Deliberately not a Supabase Realtime
 * channel — a public channel is one that anybody holding the audience link could
 * publish on, which would let them push a fabricated timer to every screen.
 *
 * ## Concurrent controllers
 *
 * Every authorized controller is editable, always. There is no ownership, no
 * leader, no lease and no "take control": the database's optimistic version check
 * is the authority, and it is enough. Each save carries the version it started
 * from, the first valid save wins and increments the version, and a later save
 * against the version that has been superseded comes back as a 409 carrying the
 * winning state. That controller keeps its own edit on screen and in its own
 * outbox, and the operator picks a side.
 *
 * Two tabs of one browser are two controllers by that definition, which is why
 * the outbox lives in `sessionStorage` — see `persistence.ts`. Nothing here
 * coordinates between tabs, and nothing here settles, clears or retries work that
 * belongs to another one.
 *
 * The invariants that keep the poll and the save loop from fighting are set out
 * around `reconcileFromPoll` below. Nothing here is destructive about local data
 * unless the server has been explicit: a lost session means "sign in again", not
 * "the event is gone".
 */

/** How often the authoritative event is re-read while somebody is watching. */
const POLL_INTERVAL_MS = 1000;
/* Hidden tabs still reconcile, just rarely; visibility restoration is immediate. */
const HIDDEN_POLL_INTERVAL_MS = 15_000;

export type ControllerStatus =
  | "loading"
  | "ready"
  /** The session expired or belongs to another event. Local data is untouched. */
  | "authorization-required"
  /** The server confirmed there is no such event. Local data has been cleared. */
  | "not-found"
  /** Nothing is known and there was no cache to fall back on. */
  | "unavailable";

export type MutationResult = { ok: boolean; message?: string };

/** Which conflict button is currently awaiting the server, if either. */
export type ConflictResolution = "discard" | "keep";

/*
 * Both conflict actions read the server before they change anything, and the
 * control room stays editable throughout, so these are the two answers that are
 * not "ok".
 */
const RESOLUTION_IN_PROGRESS =
  "That is still being worked out. Wait for it to finish, then choose again.";
const RESOLUTION_SUPERSEDED =
  "Something changed here while that was loading, so nothing was discarded. Choose again.";

/**
 * The session is no longer good for this event. It says nothing about whether the
 * event still exists, so nothing local may be discarded for it.
 */
function isAuthFailure(code: ApiFailureCode) {
  return code === "session_required" || code === "wrong_event";
}

/** Answers worth retrying: the event is fine, the trip was not. */
function isTransient(code: ApiFailureCode) {
  return (
    code === "network" ||
    code === "internal" ||
    code === "unavailable" ||
    code === "rate_limited"
  );
}

export function useControllerEvent(eventId: string) {
  const [event, setEvent] = useState<TimerEvent | null>(null);
  const [loginName, setLoginName] = useState("");
  const [status, setStatus] = useState<ControllerStatus>("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  /** Set while a conflict choice is awaiting the server, so the UI can say so. */
  const [conflictResolution, setConflictResolution] = useState<ConflictResolution | null>(null);

  const latest = useRef<TimerEvent | null>(null);
  const version = useRef(0);
  const coordinator = useRef<SaveCoordinator | null>(null);
  /* Set while authorization is missing, so no write is attempted until it is back. */
  const blocked = useRef(false);
  /* Single-flight for the two conflict choices; see `resolveConflict` below. */
  const resolving = useRef(false);

  /*
   * Bumped whenever this hook moves on: a new event id, or unmount. Anything
   * deferred — a queued microtask reading this device's cache, or a request that
   * is still on the wire — captures it and does nothing if it has changed, so an
   * old event's cached copy can never be applied after the hook has moved to a
   * new one.
   */
  const identity = useRef(0);

  /*
   * Bumped by anything that makes local state newer than a request already in
   * flight: a mutation, a queued save, an adopted payload. A read captures it
   * before its request and re-checks after, and discards itself if it changed.
   * Checking only before the request would miss an edit made while the GET was on
   * the wire — which is precisely the window that produced a conflict against this
   * device's own successful save.
   */
  const generation = useRef(0);

  const commit = useCallback((next: TimerEvent | null) => {
    latest.current = next;
    setEvent(next);
  }, []);

  /** Adopts the server's copy. Only ever called when nothing local is unsaved. */
  const adopt = useCallback(
    (payload: ControllerEvent) => {
      generation.current += 1;
      version.current = payload.version;
      commit(payload.event);
      setLoginName(payload.loginName);
      setStatus("ready");
      blocked.current = false;
      writeEventCache(payload.event.id, payload.event, payload.version);
      rememberEvent({
        eventId: payload.event.id,
        name: payload.event.name,
      });
      coordinator.current?.resume(payload.version);
    },
    [commit],
  );

  /**
   * Authorization is gone. The event may be perfectly alive and this device may be
   * one sign-in away from it, so the cached copy and the unsaved outbox both stay
   * exactly where they are. Writes stop until somebody signs in again.
   */
  const requireAuthorization = useCallback(() => {
    blocked.current = true;
    coordinator.current?.dispose();
    coordinator.current = null;
    setSaveState("signed-out");
    setStatus("authorization-required");
  }, []);

  /** The server confirmed the event is gone. This is the only case that clears. */
  const forgetEntirely = useCallback(
    (nextStatus: ControllerStatus) => {
      generation.current += 1;
      forgetEvent(eventId);
      clearEventCache(eventId);
      clearOutbox(eventId);
      coordinator.current?.dispose();
      coordinator.current = null;
      commit(null);
      setStatus(nextStatus);
    },
    [commit, eventId],
  );

  /*
   * Built once per event and kept in a ref. It owns the request loop; this hook
   * only feeds it snapshots and reacts to the states it reports.
   *
   * `owns()` is what makes a late response harmless. A coordinator can be disposed
   * — by a conflict resolution, a lost session, or a change of event id — while one
   * of its saves is still on the wire, and nothing can cancel an HTTP request that
   * has already left. So every callback that would touch *this hook's* shared state
   * asks first whether it is still the current coordinator. Writes keyed by the
   * event the save was for are unconditional: settling that event's own cache and
   * outbox is correct however stale the coordinator has become.
   */
  const getCoordinator = useCallback(() => {
    if (coordinator.current) return coordinator.current;

    let self: SaveCoordinator | null = null;
    /** True only while this is still the coordinator for the event on screen. */
    const owns = () => coordinator.current !== null && coordinator.current === self;

    self = new SaveCoordinator(version.current, {
      save: async (candidate, expectedVersion, revision) => {
        const result = await saveControllerEvent(candidate.id, expectedVersion, candidate);

        if (result.ok) {
          // Keyed by the event that was saved, so this is right either way.
          writeEventCache(candidate.id, result.data.event, result.data.version);
          renameRecentEvent(candidate.id, candidate.name);
          notifyLocalChange(candidate.id);
          if (owns()) version.current = result.data.version;

          /*
           * Clear the outbox only if it still holds exactly the revision this
           * request was carrying. A different edit made while this save was in
           * flight exists nowhere else — dropping it here is the data loss the
           * revision exists to prevent. It is kept, and its expected version
           * advanced to the one just committed so its retry is a legitimate write.
           */
          const outstanding = settleOutbox(candidate.id, revision, result.data.version);
          if (outstanding) {
            /*
             * The displayed state is that other edit, not the snapshot that was
             * acknowledged, so nothing is committed here. Advanced on `self`, never
             * on whatever `coordinator.current` happens to be now: after a change of
             * event id that would push one event's version into another's writer.
             */
            self?.setVersion(result.data.version);
          }
          return { status: "saved", version: result.data.version };
        }

        // Only the revision actually attempted is marked; a newer edit that has
        // since replaced it has not been tried and must not be labelled failed.
        markOutboxFailed(candidate.id, revision, result.message);

        if (result.code === "conflict") {
          return { status: "conflict", payload: result.payload ?? null };
        }
        if (isAuthFailure(result.code)) return { status: "signed-out" };
        if (isTransient(result.code)) {
          return {
            status: "offline",
            retryAfterMs: result.retryAfterSeconds
              ? result.retryAfterSeconds * 1000
              : undefined,
          };
        }
        // A rejected document, or an event that no longer exists.
        return { status: "rejected" };
      },
      // A superseded coordinator does not get to describe the current screen.
      onState: (next) => {
        if (owns()) setSaveState(next);
      },
      onConflict: (payload) => {
        /*
         * The server's version won. The local edit is kept in the outbox and on
         * screen, and the operator is shown the conflict; nothing is discarded on
         * either side.
         */
        if (payload) {
          writeEventCache(payload.event.id, payload.event, payload.version);
          if (owns()) version.current = payload.version;
        }
      },
      onSignedOut: () => {
        if (owns()) requireAuthorization();
      },
    });
    coordinator.current = self;
    return self;
  }, [requireAuthorization]);

  /** Whether a local edit is queued, in flight, or sitting unsent on disk. */
  const hasLocalWork = useCallback(() => {
    if (coordinator.current?.hasPendingWork) return true;
    return readOutbox(eventId) !== null;
  }, [eventId]);

  /**
   * Applies a fetched payload, or explains why it was ignored.
   *
   * The whole point of separating this from `reconcileFromPoll` is that a *poll* is
   * speculative — it is a background read that must yield to anything local — while
   * a mount or a post-sign-in reconcile is deliberate and owns the outcome.
   */
  const applyAuthoritative = useCallback(
    (payload: ControllerEvent) => {
      const pending = readOutbox(eventId);
      if (!pending) {
        adopt(payload);
        return;
      }
      /*
       * There is unsaved work. The server's copy is recorded as the version to
       * write against, but the screen keeps the local edit. A version that has
       * moved on means somebody else committed first, which is a conflict rather
       * than something to resolve by throwing one side away.
       */
      setLoginName(payload.loginName);
      setStatus("ready");
      blocked.current = false;
      version.current = payload.version;
      writeEventCache(eventId, payload.event, payload.version);
      const active = getCoordinator();
      /*
       * This exact revision is already the coordinator's business — queued, or on
       * the wire — so its own 200 or 409 is what reconciles it, and this read has
       * nothing to add. Mount deliberately resumes a pre-existing outbox *before*
       * its GET answers, so without this the sequence "resume revision R at
       * version 1 → R commits version 2 → the GET sees version 2 first" declared a
       * conflict against this tab's own successful save. Requeueing would be no
       * better: the same snapshot would go out twice.
       */
      if (active.trackedRevision === pending.revision) return;
      if (payload.version === pending.expectedVersion) {
        active.setVersion(payload.version);
        active.queue(pending.event, pending.revision);
      } else {
        active.markConflict();
      }
    },
    [adopt, eventId, getCoordinator],
  );

  const handleFetchFailure = useCallback(
    (code: ApiFailureCode) => {
      if (isAuthFailure(code)) {
        /*
         * A 401 or a 403. The session expired, or it belongs to a different event.
         * Neither means the event was deleted, so nothing local is thrown away.
         */
        requireAuthorization();
        return;
      }
      if (code === "not_found") {
        // The server is explicit: there is no such event. Now it is safe to clear.
        forgetEntirely("not-found");
        return;
      }
      /*
       * A 500, a 503, a timeout or a dropped connection. The event still exists and
       * this device is still authorized; keeping the cached copy and showing an
       * offline state is the only honest response.
       */
      if (latest.current) {
        setStatus("ready");
        setSaveState((current) =>
          current === "conflict" || current === "signed-out" || current === "rejected"
            ? current
            : "offline",
        );
      } else {
        setStatus("unavailable");
      }
    },
    [forgetEntirely, requireAuthorization],
  );

  /** The revision of whatever is unsent right now, or null if nothing is. */
  const outboxRevision = useCallback(() => readOutbox(eventId)?.revision ?? null, [eventId]);

  /**
   * A deliberate reconcile: mount, and after signing in again. Owns the outcome,
   * including resuming or conflicting the outbox.
   *
   * Deliberate does not mean unconditional. A cached event paints and becomes
   * editable while this GET is still on the wire, so the same guards the poll uses
   * apply here too: if a newer local edit began during the request, this response
   * predates it and has nothing useful to say about it. What it must *not* do is
   * ignore an outbox that already existed when it started — reconciling that entry
   * is the whole reason mount fetches at all.
   */
  const sync = useCallback(async () => {
    const mine = identity.current;
    const startedGeneration = generation.current;
    const startedRevision = outboxRevision();

    const result = await fetchControllerEvent(eventId);

    // Torn down, or pointed at another event entirely.
    if (identity.current !== mine) return;

    if (result.ok) {
      /*
       * A mutation, or an adoption, that happened during the request. Either way
       * local state is newer than this read, and the save it belongs to is the
       * authority on its own outcome.
       */
      if (generation.current !== startedGeneration) return;
      /*
       * The outbox has changed identity — a new edit replaced the entry, or a save
       * cleared it — so requeueing or conflicting against what this read saw would
       * act on work that is no longer there.
       */
      if (outboxRevision() !== startedRevision) return;
      applyAuthoritative(result.data);
      return;
    }
    handleFetchFailure(result.code);
  }, [applyAuthoritative, eventId, handleFetchFailure, outboxRevision]);

  /**
   * The background poll's reconcile, which yields to local work in three ways.
   *
   * 1. It does not start if a save is queued, in flight, or unsent on disk. The
   *    authoritative save response — success, or a 409 with the winning state — is
   *    what resolves that work, and a GET has no standing to second-guess it.
   * 2. It captures the mutation generation before the request and re-checks after.
   *    A response that was already in flight when an edit began is discarded, not
   *    applied, because the edit is newer than anything that read can know about.
   * 3. It never requeues an outbox entry and never marks a conflict. Both of those
   *    were how a poll ended up fighting this device's own commit: the poll would
   *    see version 2 — committed by the save whose response had not arrived yet —
   *    decide the outbox's expected version 1 was stale, and halt the coordinator
   *    against a save that was about to succeed.
   *
   * Yielding applies to *successes and transient failures only*. An explicit
   * answer is real information regardless of what happened locally: a 401 or 403
   * means sign in again, and a confirmed 404 means the event is gone.
   */
  const reconcileFromPoll = useCallback(
    async (guard: PollGuard) => {
      if (blocked.current) return;
      if (hasLocalWork()) return;

      const started = generation.current;
      const result = await fetchControllerEvent(eventId);

      // The guard comes first, always: an effect that has been torn down must not
      // act on anything, however explicit the answer.
      if (!guard.isCurrent()) return;

      if (!result.ok) {
        /*
         * Authorization and deletion are decided by the server and nothing local
         * changes that. `requireAuthorization` preserves both the cache and the
         * unsaved outbox; a confirmed not-found clears them, which is the whole
         * point of distinguishing it from a dropped connection.
         */
        if (isAuthFailure(result.code) || result.code === "not_found") {
          handleFetchFailure(result.code);
          return;
        }
        // A transient failure says nothing worth interrupting newer local work for.
        if (generation.current !== started || hasLocalWork()) return;
        handleFetchFailure(result.code);
        return;
      }

      // Superseded by an edit made while this was on the wire...
      if (generation.current !== started) return;
      // ...or by one that has already been persisted in that window.
      if (hasLocalWork()) return;

      adopt(result.data);
    },
    [adopt, eventId, handleFetchFailure, hasLocalWork],
  );

  // --- mount, and any change of event ---------------------------------------

  useEffect(() => {
    if (!eventId) return;

    /*
     * Everything below is deferred, so it takes a stamp of this effect's identity
     * and checks it before touching state. Without that, a microtask queued for
     * one event id could paint its cache after the hook had moved to another.
     */
    const mine = (identity.current += 1);

    /*
     * A different event id is a different resource, so nothing is inherited from
     * the previous one: not its snapshot, not its version, not its authorization
     * state, and not a conflict resolution that was mid-flight. Its coordinator was
     * disposed by this effect's cleanup, which ran first. On a first mount every
     * line here is a no-op.
     *
     * The refs go now, because callbacks read them; the state goes in the microtask
     * below, because setting state straight from an effect body is what the rest of
     * this module deliberately avoids.
     */
    version.current = 0;
    blocked.current = false;
    resolving.current = false;

    queueMicrotask(() => {
      if (identity.current !== mine) return;

      commit(null);
      setLoginName("");
      setStatus("loading");
      setSaveState("idle");
      setConflictResolution(null);

      const cached = readEventCache(eventId);
      const pending = readOutbox(eventId);

      if (cached) {
        version.current = cached.version;
        commit(cached.event);
        setStatus("ready");
      }
      if (pending) {
        // Unsaved work outranks the cache on screen, and is queued for retry.
        version.current = pending.expectedVersion;
        commit(pending.event);
        setStatus("ready");
        const active = getCoordinator();
        active.setVersion(pending.expectedVersion);
        active.queue(pending.event, pending.revision);
      }
      void sync();
    });

    return () => {
      // Supersedes anything this effect deferred, including a GET still in flight.
      identity.current += 1;
      /*
       * The coordinator serialises writes for *this* event and holds its version.
       * Reusing it for another event would send one event's snapshot with another's
       * expected version; a save of this event's that is already on the wire is
       * left to settle this event's own cache and outbox, and `owns()` keeps its
       * report away from whatever is on screen by then.
       */
      coordinator.current?.dispose();
      coordinator.current = null;
    };
  }, [commit, eventId, getCoordinator, sync]);

  // --- cross-device synchronisation, by polling ----------------------------

  usePolling(reconcileFromPoll, Boolean(eventId), {
    visibleIntervalMs: POLL_INTERVAL_MS,
    hiddenIntervalMs: HIDDEN_POLL_INTERVAL_MS,
    // The mount already reads once; a leading poll would duplicate it.
    skipLeading: true,
  });

  /*
   * Pending work is flushed when the tab goes away or is hidden, which the polling
   * loop has no business doing — it only reads.
   */
  useEffect(() => {
    if (!eventId) return;
    const flush = () => coordinator.current?.flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
      else coordinator.current?.retry();
    };
    const onOnline = () => coordinator.current?.retry();

    window.addEventListener("pagehide", flush);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      // Named, so they are actually removed. Anonymous handlers here left a
      // listener behind on every remount.
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [eventId]);

  // --- other tabs on this device -------------------------------------------

  useEffect(() => {
    if (!eventId) return;
    return subscribeLocalChanges(eventId, () => {
      // Another tab saved. Adopt its cache rather than making a request.
      const cached = readEventCache(eventId);
      if (!cached || hasLocalWork()) return;
      generation.current += 1;
      version.current = cached.version;
      commit(cached.event);
      /*
       * The coordinator has to move with it. It holds its own copy of the version,
       * so leaving it behind meant the next edit wrote its outbox entry expecting
       * the version just adopted while the request went out with the older one —
       * a 409 this device caused itself, against a save nobody was competing with.
       * Only the version is advanced: there is no local work to resume or discard
       * here, and the save badge is still telling the truth about the last save.
       */
      coordinator.current?.setVersion(cached.version);
    });
  }, [commit, eventId, hasLocalWork]);

  // --- mutations ------------------------------------------------------------

  const update = useCallback(
    (updater: (current: TimerEvent) => TimerEvent) => {
      const base = latest.current;
      if (!base) return;

      const next = updater(base);
      // Anything in flight is now older than local state.
      generation.current += 1;
      commit(next);

      /*
       * The outbox is written synchronously, before anything is sent, under a fresh
       * opaque revision. If the tab is reloaded on the next line the edit is still
       * in this tab's storage with the version it expects, and reopening the event
       * resumes it. It is this tab's alone: no other tab can see it, overwrite it,
       * or clear it on this one's behalf.
       */
      const revision = makeOutboxRevision();
      writeOutbox({
        eventId: next.id,
        event: next,
        expectedVersion: version.current,
        revision,
        status: "pending",
        lastError: null,
        updatedAt: Date.now(),
      });
      // Deliberately not written to the cache: that holds server state only.
      if (blocked.current) {
        // Kept safely on disk, but nothing is sent until authorization returns.
        setSaveState("signed-out");
        return;
      }
      getCoordinator().queue(next, revision);
    },
    [commit, getCoordinator],
  );

  /*
   * Retrying is for a transient failure. A conflict is not retried, because
   * resending the same document against the same stale version would fail
   * identically; the operator has to choose a side, which is what the two
   * functions below are for.
   */
  const retrySave = useCallback(() => {
    const active = getCoordinator();
    if (active.isHalted) return;
    active.retry();
  }, [getCoordinator]);

  /**
   * Called after the operator signs in again. Resumes the outbox against whatever
   * the server now holds, keeping optimistic concurrency: if somebody else
   * committed in the meantime it becomes a conflict, not an overwrite.
   */
  const resumeAfterSignIn = useCallback(async (): Promise<MutationResult> => {
    blocked.current = false;
    setSaveState("idle");
    setStatus("loading");
    await sync();
    return { ok: true };
  }, [sync]);

  /**
   * The shared shape of both conflict choices.
   *
   * Each one reads the server before it changes anything, and the control room
   * stays editable while it does — deliberately, because freezing the timer
   * controls to resolve a naming conflict would be worse than the conflict. That
   * makes three things mandatory:
   *
   * 1. **Single-flight.** Two buttons, or two impatient clicks, must not both apply.
   *    The second is refused with a message rather than queued behind the first,
   *    because by the time the first finishes the second's premise is gone.
   * 2. **Identity guarded.** A response that arrives after unmount, or after the
   *    hook has moved to another event, does nothing at all.
   * 3. **Revision guarded.** The outbox revision is captured when the operator
   *    chooses and re-checked after the await, so neither action can act on an edit
   *    that is no longer the one they were looking at.
   */
  const resolveConflict = useCallback(
    async (
      choice: ConflictResolution,
      apply: (payload: ControllerEvent, chosenRevision: string | null) => MutationResult,
    ): Promise<MutationResult> => {
      if (resolving.current) return { ok: false, message: RESOLUTION_IN_PROGRESS };
      resolving.current = true;
      setConflictResolution(choice);

      const mine = identity.current;
      const chosenRevision = outboxRevision();
      try {
        const result = await fetchControllerEvent(eventId);
        // Unmounted, or another event entirely. This screen is not ours to touch.
        if (identity.current !== mine) return { ok: false, message: RESOLUTION_SUPERSEDED };
        if (!result.ok) return { ok: false, message: result.message };
        return apply(result.data, chosenRevision);
      } finally {
        // Only if this hook is still on the same event: otherwise the flag and the
        // label belong to whatever is on screen now, not to this action.
        if (identity.current === mine) {
          resolving.current = false;
          setConflictResolution(null);
        }
      }
    },
    [eventId, outboxRevision],
  );

  /**
   * Resolves a conflict by taking the version the server holds.
   *
   * This is the destructive choice, so it applies only to *exactly* the edit the
   * operator was looking at. If they typed something else while the read was in
   * flight, that newer edit was never offered up for discarding, and throwing it
   * away because it happens to live in the same slot would be the data loss the
   * revision exists to prevent. They are told to choose again instead.
   */
  const discardLocalChanges = useCallback(
    () =>
      resolveConflict("discard", (payload, chosenRevision) => {
        if (outboxRevision() !== chosenRevision) {
          return { ok: false, message: RESOLUTION_SUPERSEDED };
        }
        // Cleared only once the replacement is in hand, so a failed fetch cannot
        // lose the edit it was going to replace.
        clearOutbox(eventId);
        coordinator.current?.dispose();
        coordinator.current = null;
        setSaveState("idle");
        adopt(payload);
        return { ok: true };
      }),
    [adopt, eventId, outboxRevision, resolveConflict],
  );

  /**
   * Resolves a conflict the other way: this device's edit is rewritten on top of
   * whatever the server now holds. An explicit choice, never automatic.
   *
   * **The policy when the edit moved during the read: rebase whatever is unsaved
   * now**, not the snapshot captured when the button was pressed. "Keep my changes"
   * means the changes on screen, and the outbox holds exactly one entry per event —
   * the newest — so the newer edit already supersedes the older one locally.
   * Rebasing the captured snapshot would silently undo it; aborting would leave the
   * operator resolving a conflict they have already answered. Nothing is lost either
   * way, because a rebase never discards.
   */
  const keepLocalChanges = useCallback(
    () =>
      resolveConflict("keep", (payload) => {
        const pending = readOutbox(eventId);
        if (!pending) {
          // Saved or discarded while the read was in flight; there is nothing to keep.
          adopt(payload);
          return { ok: true };
        }

        coordinator.current?.dispose();
        coordinator.current = null;
        setSaveState("idle");
        generation.current += 1;
        version.current = payload.version;
        setLoginName(payload.loginName);
        setStatus("ready");
        blocked.current = false;
        commit(pending.event);
        // Re-queued under a new revision, against the version that exists now.
        const revision = makeOutboxRevision();
        writeOutbox({
          ...pending,
          expectedVersion: payload.version,
          revision,
          status: "pending",
          lastError: null,
          updatedAt: Date.now(),
        });
        const active = getCoordinator();
        active.setVersion(payload.version);
        active.queue(pending.event, revision);
        active.flush();
        return { ok: true };
      }),
    [adopt, commit, eventId, getCoordinator, resolveConflict],
  );

  /**
   * Deletion is only ever reported as done when the server said so.
   *
   * A 2xx means it is gone. A confirmed 404 means it was already gone, which is
   * the same outcome. Everything else — an expired session, a session for another
   * event, a conflict, a rate limit, a 500, a dropped connection — leaves an event
   * that probably still exists, and saying "deleted" would be a lie the operator
   * discovers when an audience screen keeps counting down.
   */
  const remove = useCallback(async (): Promise<MutationResult> => {
    const result = await deleteControllerEvent(eventId);
    if (!result.ok && result.code !== "not_found") {
      if (isAuthFailure(result.code)) requireAuthorization();
      return { ok: false, message: result.message };
    }
    forgetEntirely("not-found");
    return { ok: true };
  }, [eventId, forgetEntirely, requireAuthorization]);

  /**
   * Signing out clears this device's copy, so it refuses while an unsaved edit
   * would go with it. The caller is expected to resolve or acknowledge that first.
   */
  const signOut = useCallback(
    async (options: { discardUnsaved?: boolean } = {}): Promise<MutationResult> => {
      const pending = readOutbox(eventId);
      if (pending && !options.discardUnsaved) {
        return {
          ok: false,
          message:
            "There are unsaved changes on this device. Save them, or sign out again to discard them.",
        };
      }

      const result = await logoutOfEvent(eventId);
      if (!result.ok) {
        /*
         * The cookie and the database row may both still be live. Saying "signed
         * out" here would leave an operator believing a shared machine is safe
         * when it is not.
         */
        return { ok: false, message: result.message };
      }
      forgetEntirely("authorization-required");
      return { ok: true };
    },
    [eventId, forgetEntirely],
  );

  const flushSaves = useCallback(() => getCoordinator().flush(), [getCoordinator]);

  /** Whether an unsaved edit is sitting in this tab right now. */
  const hasUnsavedWork = useCallback(() => readOutbox(eventId) !== null, [eventId]);

  return {
    event,
    loginName,
    status,
    saveState,
    /** Which conflict choice is awaiting the server, so both buttons can say so. */
    conflictResolution,
    update,
    retrySave,
    resumeAfterSignIn,
    discardLocalChanges,
    keepLocalChanges,
    remove,
    signOut,
    flushSaves,
    hasUnsavedWork,
    sync,
  };
}
