"use client";

import { useEffect, useRef } from "react";

/**
 * Audience displays sit untouched for hours. Without a wake lock the screen
 * dims mid-keynote, which is the single most visible failure this app can have.
 */
export function useWakeLock(active = true) {
  const sentinel = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let cancelled = false;

    async function request() {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel.current = lock;
      } catch {
        // Denied locks are not worth surfacing; the display still works.
      }
    }

    // Browsers drop the lock whenever the tab is hidden, so re-take it on return.
    function onVisibilityChange() {
      if (document.visibilityState === "visible") void request();
    }

    void request();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel.current?.release();
      sentinel.current = null;
    };
  }, [active]);
}
