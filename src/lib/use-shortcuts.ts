"use client";

import { useEffect, useRef, useState } from "react";

type Shortcut = {
  /** Matched against `event.key`, lowercased. */
  keys: string[];
  run: () => void;
};

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Live operators work with one hand on the keyboard, so shortcuts stay active
 * everywhere except inside form fields.
 */
export function useShortcuts(shortcuts: Shortcut[], enabled = true) {
  const latest = useRef(shortcuts);

  useEffect(() => {
    latest.current = shortcuts;
  });

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      const match = latest.current.find((shortcut) => shortcut.keys.includes(key));
      if (!match) return;
      event.preventDefault();
      match.run();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

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
