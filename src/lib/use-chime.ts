"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const CHIME_SECONDS = 1.5;

export const CHIME_PRESETS = [
  {
    id: "feather",
    label: "Feather bell",
    description: "One very soft note with a long fade.",
  },
  {
    id: "rising",
    label: "Gentle rising chime",
    description: "Two quiet notes with a friendly lift.",
  },
  {
    id: "warm",
    label: "Warm marimba",
    description: "A short, rounded wooden tone.",
  },
  {
    id: "airy",
    label: "Airy glass",
    description: "A delicate, brighter shimmer.",
  },
  {
    id: "double",
    label: "Soft double tap",
    description: "Two muted taps of the same note.",
  },
] as const;

export type ChimePreset = (typeof CHIME_PRESETS)[number]["id"];

type ChimeTone = {
  frequency: number;
  type: OscillatorType;
  gain: number;
  startOffset: number;
  release: number;
};

const CHIME_TONES: Record<ChimePreset, readonly ChimeTone[]> = {
  feather: [
    {
      frequency: 523.25,
      type: "sine",
      gain: 0.055,
      startOffset: 0,
      release: 1.45,
    },
  ],
  rising: [
    {
      frequency: 523.25,
      type: "sine",
      gain: 0.045,
      startOffset: 0,
      release: 0.72,
    },
    {
      frequency: 659.25,
      type: "sine",
      gain: 0.04,
      startOffset: 0.42,
      release: 1.02,
    },
  ],
  warm: [
    {
      frequency: 392,
      type: "triangle",
      gain: 0.04,
      startOffset: 0,
      release: 0.82,
    },
    {
      frequency: 784,
      type: "sine",
      gain: 0.014,
      startOffset: 0,
      release: 0.62,
    },
  ],
  airy: [
    {
      frequency: 1046.5,
      type: "sine",
      gain: 0.032,
      startOffset: 0,
      release: 1.18,
    },
    {
      frequency: 1567.98,
      type: "sine",
      gain: 0.01,
      startOffset: 0,
      release: 0.92,
    },
  ],
  double: [
    {
      frequency: 440,
      type: "sine",
      gain: 0.045,
      startOffset: 0,
      release: 0.46,
    },
    {
      frequency: 440,
      type: "sine",
      gain: 0.04,
      startOffset: 0.58,
      release: 0.52,
    },
  ],
};

export function isChimePreset(value: string | null): value is ChimePreset {
  return CHIME_PRESETS.some((preset) => preset.id === value);
}

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

function createContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

/**
 * A brief, gentle alert synthesised on the fly — no audio file to ship, cache
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

  const ensureRunning = useCallback(async () => {
    context.current ??= createContext();
    const audio = context.current;
    if (!audio) {
      setIsReady(false);
      return null;
    }
    if (audio.state === "suspended") {
      try {
        await audio.resume();
      } catch {
        setIsReady(false);
        return null;
      }
    }
    const ready = audio.state === "running";
    setIsReady(ready);
    return ready ? audio : null;
  }, []);

  const unlock = useCallback(
    async () => Boolean(await ensureRunning()),
    [ensureRunning],
  );

  const disable = useCallback(async () => {
    const audio = context.current;
    if (audio?.state === "running") await audio.suspend();
    setIsReady(false);
  }, []);

  const play = useCallback(async (preset: ChimePreset = "feather") => {
    /*
     * Browsers may suspend an unlocked context while a display sits idle.
     * Creating/resuming it here also lets a preset preview be the first user
     * gesture that enables audio instead of requiring a separate silent tap.
     */
    const audio = await ensureRunning();
    if (!audio) return false;

    const start = audio.currentTime;
    for (const tone of CHIME_TONES[preset]) {
      const at = start + tone.startOffset;
      const gain = audio.createGain();
      gain.connect(audio.destination);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(tone.gain, at + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + tone.release);

      const oscillator = audio.createOscillator();
      oscillator.type = tone.type;
      oscillator.frequency.setValueAtTime(tone.frequency, at);
      oscillator.connect(gain);
      oscillator.start(at);
      oscillator.stop(
        start +
          Math.min(
            CHIME_SECONDS,
            tone.startOffset + tone.release + 0.05,
          ),
      );
    }

    return true;
  }, [ensureRunning]);

  return { play, unlock, disable, isReady };
}
