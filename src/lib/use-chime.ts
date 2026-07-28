"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** The alert runs for three seconds: three pulses with a gap between them. */
const PULSE_COUNT = 3;
const PULSE_SECONDS = 0.6;
const PULSE_GAP = 0.4;
export const CHIME_SECONDS = PULSE_COUNT * (PULSE_SECONDS + PULSE_GAP);

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

function createContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

/**
 * A three-second alert synthesised on the fly — no audio file to ship, cache
 * or fail to load in a venue with poor connectivity.
 *
 * Browsers refuse to start audio until the page has been interacted with, so
 * `unlock` must be called from a real user gesture. `isReady` reports whether
 * that has happened, which lets the audience screen prompt for one click
 * rather than silently failing when a talk overruns.
 */
export function useChime() {
  const context = useRef<AudioContext | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(
    () => () => {
      void context.current?.close();
      context.current = null;
    },
    [],
  );

  const unlock = useCallback(async () => {
    context.current ??= createContext();
    const audio = context.current;
    if (!audio) return false;
    if (audio.state === "suspended") await audio.resume();
    const ready = audio.state === "running";
    setIsReady(ready);
    return ready;
  }, []);

  const play = useCallback(() => {
    const audio = context.current;
    if (!audio || audio.state !== "running") return;

    const start = audio.currentTime;
    for (let pulse = 0; pulse < PULSE_COUNT; pulse += 1) {
      const at = start + pulse * (PULSE_SECONDS + PULSE_GAP);

      // Two detuned sine partials read as a warm chime rather than a beep.
      const gain = audio.createGain();
      gain.connect(audio.destination);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.28, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + PULSE_SECONDS);

      for (const frequency of [880, 1320]) {
        const oscillator = audio.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, at);
        oscillator.connect(gain);
        oscillator.start(at);
        oscillator.stop(at + PULSE_SECONDS);
      }
    }
  }, []);

  return { play, unlock, isReady };
}
