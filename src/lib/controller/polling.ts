"use client";

import { useEffect } from "react";

/*
 * One polling loop, used by the controller, the audience display and the Zoom App.
 *
 * The naive version — self-scheduling `setTimeout`, plus `online` and
 * `visibilitychange` calling the tick directly — has three faults that only show
 * up under exactly the conditions polling exists to handle:
 *
 * 1. An immediate reconciliation fired while a tick was awaiting produced a second
 *    concurrent request, and each of them then scheduled its own timer. Every such
 *    event permanently doubled the number of loops and the request rate.
 * 2. With two requests in flight there is no ordering guarantee, so an older
 *    response could be applied after a newer one and move the display backwards.
 * 3. A response belonging to a torn-down effect — an old audience token, or an
 *    unmounted component — was still applied.
 *
 * So the loop here is single-flight: one request at a time, one timer at a time,
 * and a reconciliation requested during a flight is coalesced into a single
 * follow-up rather than becoming another concurrent request. The callback is
 * handed a guard it must consult before touching state, which is false for any
 * response that outlived its effect.
 */

export type PollGuard = {
  /** False once this effect has been torn down, or its inputs have changed. */
  isCurrent: () => boolean;
};

export type PollingOptions = {
  /** How long between polls while the document is visible. */
  visibleIntervalMs: number;
  /** How long between polls while it is hidden. Nobody is reading it. */
  hiddenIntervalMs: number;
  /** Skips the leading poll, for callers whose mount already read once. */
  skipLeading?: boolean;
};

/**
 * Runs `poll` on an interval, immediately on visibility restoration and on
 * reconnect, and never more than once at a time.
 *
 * `poll` must check `guard.isCurrent()` after every await and before applying any
 * result.
 */
export function usePolling(
  poll: (guard: PollGuard) => void | Promise<void>,
  enabled: boolean,
  options: PollingOptions,
) {
  const { visibleIntervalMs, hiddenIntervalMs, skipLeading } = options;

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let inFlight = false;
    /* A reconciliation asked for while a request was in flight, coalesced to one. */
    let reconcileQueued = false;
    let timer: number | null = null;
    const guard: PollGuard = { isCurrent: () => !stopped };

    const clearPendingTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };

    /** Exactly one future timer, always. */
    const scheduleNext = () => {
      if (stopped) return;
      clearPendingTimer();
      const hidden =
        typeof document !== "undefined" && document.visibilityState === "hidden";
      timer = window.setTimeout(() => void run(), hidden ? hiddenIntervalMs : visibleIntervalMs);
    };

    const run = async (): Promise<void> => {
      if (stopped) return;
      if (inFlight) {
        // Do not start a second request. One follow-up is remembered instead.
        reconcileQueued = true;
        return;
      }

      inFlight = true;
      clearPendingTimer();
      try {
        await poll(guard);
      } finally {
        inFlight = false;
      }
      if (stopped) return;

      if (reconcileQueued) {
        reconcileQueued = false;
        // The follow-up runs now rather than waiting out an interval, because
        // something asked for fresh state while this request was in flight.
        void run();
        return;
      }
      scheduleNext();
    };

    if (skipLeading) scheduleNext();
    else void run();

    /*
     * Both of these mean "whatever we knew may be out of date, find out now". They
     * go through `run`, so they coalesce with anything already in flight instead of
     * racing it.
     */
    const reconcile = () => void run();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") reconcile();
      else scheduleNext();
    };

    window.addEventListener("online", reconcile);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopped = true;
      clearPendingTimer();
      window.removeEventListener("online", reconcile);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    /*
     * `poll` is a stable `useCallback` at every call site, so this restarts only
     * when the token or event id it closes over actually changes — which is exactly
     * when the old loop's responses must stop being applied.
     */
  }, [enabled, hiddenIntervalMs, poll, skipLeading, visibleIntervalMs]);
}
