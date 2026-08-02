"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Screen readers cannot follow a clock that repaints five times a second, so
 * announcements are throttled to meaningful moments only.
 */
export function useThrottledAnnouncement(message: string, intervalMs = 15000) {
  const [announced, setAnnounced] = useState("");
  const lastSpokenAt = useRef(0);
  const lastMessage = useRef("");

  useEffect(() => {
    if (message === lastMessage.current) return;
    const now = Date.now();
    if (now - lastSpokenAt.current < intervalMs) return;
    lastSpokenAt.current = now;
    lastMessage.current = message;
    setAnnounced(message);
  }, [intervalMs, message]);

  return announced;
}
