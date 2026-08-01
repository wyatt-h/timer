"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TimerEvent } from "@/lib/types";
import {
  publishZoomCommand,
  registerZoomIndicatorListeners,
  type ZoomCommandOutcome,
  type ZoomEnvironment,
  type ZoomIndicatorEvent,
} from "@/lib/zoom/sdk";
import {
  planZoomCommand,
  sourceTimerFromEvent,
  type PublishedTimer,
  type SourceTimer,
} from "@/lib/zoom/sync";

/** Fast enough for a readable countdown; the planner returns nothing most ticks. */
const TICK_MS = 500;

/** After a rejected command, stop hammering the client. */
const RETRY_DELAY_MS = 3000;

/**
 * Drives the Dynamic Indicator from the authoritative event.
 *
 * The loop is a reconciliation, not a stream of updates: every tick derives what
 * the timer says, compares it with what Zoom was last told, and sends a command
 * only when those disagree. That is what keeps rerenders, repeated Supabase
 * broadcasts, and the one-second poll from turning into repeated SDK calls.
 */
export function useZoomIndicator({
  event,
  environment,
  enabled,
}: {
  event: TimerEvent | null;
  environment: ZoomEnvironment;
  enabled: boolean;
}) {
  const [source, setSource] = useState<SourceTimer | null>(null);
  const [published, setPublished] = useState<PublishedTimer | null>(null);
  const [lastOutcome, setLastOutcome] = useState<ZoomCommandOutcome | null>(null);
  const [lastEvent, setLastEvent] = useState<ZoomIndicatorEvent | null>(null);

  /*
   * What Zoom currently believes, held in a ref because the reconciler reads it
   * on every tick and must never see a stale render's copy. The state copy
   * exists only so the interface can show whether anything is published.
   */
  const publishedRef = useRef<PublishedTimer | null>(null);
  const wasEnabled = useRef(false);
  const inFlight = useRef(false);
  const retryAfter = useRef(0);

  /**
   * Forget what Zoom was told, so the next tick republishes the timer from
   * scratch. Used after a refresh, a reconnect, or the webview being restored —
   * anywhere the indicator may have been torn down without telling us.
   */
  const reconcile = useCallback(() => {
    publishedRef.current = null;
    setPublished(null);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") reconcile();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reconcile]);

  useEffect(() => {
    if (!environment.canPublish) return;
    return registerZoomIndicatorListeners(setLastEvent);
  }, [environment.canPublish]);

  // The tick reads the latest event without being rebuilt on every update.
  const eventRef = useRef(event);
  useLayoutEffect(() => {
    eventRef.current = event;
  });

  useEffect(() => {
    /*
     * Switching sync on always republishes from authoritative state rather than
     * trusting a snapshot from an earlier session. Switching it off must not
     * clear the snapshot, or the retraction would never be sent.
     */
    if (enabled && !wasEnabled.current) publishedRef.current = null;
    wasEnabled.current = enabled;

    const tick = () => {
      const now = Date.now();
      const currentEvent = eventRef.current;
      const nextSource = currentEvent ? sourceTimerFromEvent(currentEvent, now) : null;
      setSource(nextSource);

      if (!environment.canPublish) return;
      if (inFlight.current || now < retryAfter.current) return;

      const plan = planZoomCommand({
        source: nextSource,
        published: publishedRef.current,
        enabled,
        now,
        canExtend: environment.canExtend,
      });
      if (plan.command.kind === "noop") return;

      inFlight.current = true;
      const revision = nextSource?.revision ?? now;
      void publishZoomCommand(plan.command, revision)
        .then((outcome) => {
          if (outcome.status === "applied") {
            publishedRef.current = plan.published;
            setPublished(plan.published);
          } else if (outcome.status === "failed") {
            retryAfter.current = Date.now() + RETRY_DELAY_MS;
          }
          setLastOutcome(outcome);
        })
        .finally(() => {
          inFlight.current = false;
        });
    };

    tick();
    const interval = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(interval);
  }, [enabled, environment.canExtend, environment.canPublish]);

  return { source, published, lastOutcome, lastEvent, reconcile };
}
