"use client";

import {
  Check,
  ChevronDown,
  Maximize2,
  Minimize2,
  Music2,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import {
  describeTimer,
  elapsedRatio,
  flattenSegments,
  formatTimer,
  panelLabel,
  timerTone,
} from "@/lib/format";
import { usePublicEvent } from "@/lib/store";
import {
  CHIME_PRESETS,
  CHIME_SECONDS,
  isChimePreset,
  useChime,
  type ChimePreset,
} from "@/lib/use-chime";
import { cn } from "@/lib/utils";
import { useWakeLock } from "@/lib/use-wake-lock";

/** Countdowns keep running past zero so the room can see the overrun. */
function liveSeconds(
  isRunning: boolean,
  endsAt: number | null | undefined,
  fallback: number | null | undefined,
) {
  if (isRunning && endsAt) return (endsAt - Date.now()) / 1000;
  return fallback ?? 0;
}

const AUDIENCE_BACKGROUND = {
  backgroundColor: "#0c0c10",
  backgroundImage:
    "radial-gradient(circle at 50% 45%, rgba(119, 87, 237, 0.15), transparent 34%)",
};

const AUDIENCE_OVER_BACKGROUND = {
  backgroundColor: "#120b0d",
  backgroundImage:
    "radial-gradient(circle at 50% 45%, rgba(207, 52, 52, 0.2), transparent 38%)",
};

const CHIME_STORAGE_KEY = "timer:audience-chime";

export function AudienceDisplay() {
  const params = useParams<{ token: string }>();
  const { event, connection } = usePublicEvent(params.token);
  const segments = useMemo(() => (event ? flattenSegments(event) : []), [event]);
  const runtime = event?.runtime;
  const [remaining, setRemaining] = useState(runtime?.remainingSeconds ?? 0);
  const [panelRemaining, setPanelRemaining] = useState(runtime?.panelRemainingSeconds ?? 0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { play, unlock, disable, isReady } = useChime();
  const [chimePreset, setChimePreset] = useState<ChimePreset>("feather");
  const [soundPickerOpen, setSoundPickerOpen] = useState(false);
  const soundPicker = useRef<HTMLDivElement>(null);
  const [alerting, setAlerting] = useState(false);
  const alertTimeout = useRef<number | null>(null);

  useWakeLock();

  useEffect(() => {
    const storedPreset = window.localStorage.getItem(CHIME_STORAGE_KEY);
    if (isChimePreset(storedPreset)) {
      queueMicrotask(() => setChimePreset(storedPreset));
    }
  }, []);

  useEffect(() => {
    if (!soundPickerOpen) return;
    function closePicker(event: MouseEvent) {
      if (!soundPicker.current?.contains(event.target as Node)) {
        setSoundPickerOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSoundPickerOpen(false);
    }
    document.addEventListener("mousedown", closePicker);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closePicker);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [soundPickerOpen]);

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  /*
   * One entry per clock that has already chimed, keyed by the thing being
   * timed. Keying by id rather than by a boolean means adding time to a
   * finished speaker re-arms their alert, and moving on never replays it.
   */
  const chimed = useRef<Set<string>>(new Set());

  /*
   * The visual alert fires whether or not audio is unlocked, so a muted or
   * un-clicked display still shows the room that time is up.
   */
  const raiseAlert = useCallback(() => {
    setAlerting(true);
    if (alertTimeout.current) window.clearTimeout(alertTimeout.current);
    alertTimeout.current = window.setTimeout(
      () => setAlerting(false),
      CHIME_SECONDS * 1000,
    );
  }, []);

  useEffect(
    () => () => {
      if (alertTimeout.current) window.clearTimeout(alertTimeout.current);
    },
    [],
  );

  useEffect(() => {
    if (!runtime) return;
    const tick = () => {
      const liveSegment =
        segments[Math.min(runtime.segmentIndex, Math.max(0, segments.length - 1))];
      const liveItem = event?.agenda.find((item) => item.id === liveSegment?.agendaItemId);

      const speakerSeconds = liveSeconds(
        runtime.status === "running",
        runtime.endsAt,
        runtime.remainingSeconds,
      );
      const panelSeconds = liveSeconds(
        runtime.panelStatus === "running",
        runtime.panelEndsAt,
        runtime.panelRemainingSeconds ??
          (liveItem?.kind === "panel" ? liveItem.durationSeconds : 0),
      );
      setRemaining(speakerSeconds);
      setPanelRemaining(panelSeconds);

      // Only a running clock can reach zero; a paused one sitting below zero
      // must not re-alert on every tick.
      const speakerKey = `speaker:${liveSegment?.id}`;
      if (runtime.status === "running" && speakerSeconds <= 0) {
        if (!chimed.current.has(speakerKey)) {
          chimed.current.add(speakerKey);
          raiseAlert();
          if (isReady) {
            void play(chimePreset);
          }
        }
      } else if (speakerSeconds > 0) {
        chimed.current.delete(speakerKey);
      }

      const panelKey = `panel:${liveItem?.id}`;
      if (runtime.panelStatus === "running" && panelSeconds <= 0) {
        if (!chimed.current.has(panelKey)) {
          chimed.current.add(panelKey);
          raiseAlert();
          if (isReady) {
            void play(chimePreset);
          }
        }
      } else if (panelSeconds > 0) {
        chimed.current.delete(panelKey);
      }
    };
    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [
    chimePreset,
    event,
    isReady,
    play,
    raiseAlert,
    runtime,
    segments,
  ]);

  const previewChime = useCallback(
    async (preset: ChimePreset) => {
      const ready = isReady || (await unlock());
      if (ready) await play(preset);
    },
    [isReady, play, unlock],
  );

  const chooseChime = useCallback(
    (preset: ChimePreset) => {
      setChimePreset(preset);
      window.localStorage.setItem(CHIME_STORAGE_KEY, preset);
      void previewChime(preset);
    },
    [previewChime],
  );

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }, []);

  if (!event || !runtime || !segments.length) {
    return (
      <main
        className="relative flex min-h-svh flex-col overflow-hidden p-[clamp(1.375rem,4vw,3.5rem)] text-[#f8f7fc]"
        style={AUDIENCE_BACKGROUND}
      >
        <header className="relative z-2 flex items-center justify-between text-[12px] text-[#8f8e99]">
          <BrandMark light />
        </header>
        <section className="relative z-2 flex flex-1 flex-col items-center justify-center gap-[clamp(0.75rem,2vw,1.375rem)] py-[clamp(0.75rem,2.5vh,2rem)] text-center">
          <span className="text-[12px] font-bold tracking-[0.14em] text-[#8d77e9] uppercase">Waiting for the event</span>
          <h1 className="text-[clamp(2.125rem,5.5vw,4.5rem)] leading-none font-semibold tracking-[-0.058em]">Not live yet.</h1>
        </section>
        <footer className="relative z-2 flex items-end justify-between text-[12px] text-[#8f8e99] max-sm:flex-col max-sm:items-start max-sm:gap-4">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="size-1.5 rounded-full bg-[#4ade80]" />
            Waiting
          </span>
        </footer>
      </main>
    );
  }

  const index = Math.min(runtime.segmentIndex, segments.length - 1);
  const current = segments[index];
  const next = segments[index + 1];
  const currentItem = event.agenda.find((item) => item.id === current.agendaItemId);
  const isPanel = currentItem?.kind === "panel";
  const isEnded = runtime.status === "ended";
  const isPaused = runtime.status === "paused";

  const speakerTone = timerTone(remaining, current.durationSeconds);
  const panelTone = timerTone(panelRemaining, currentItem?.durationSeconds ?? 0);
  const speakerProgress = elapsedRatio(remaining, current.durationSeconds);
  const selectedChime =
    CHIME_PRESETS.find((preset) => preset.id === chimePreset) ??
    CHIME_PRESETS[0];

  const stateLabel = isPaused
    ? "Paused"
    : isEnded
      ? "Event complete"
      : isPanel
        ? "Panel in progress"
        : "Now speaking";

  return (
    <main
      className="relative flex min-h-svh flex-col overflow-hidden p-[clamp(1.375rem,4vw,3.5rem)] text-[#f8f7fc]"
      style={
        speakerTone === "critical"
          ? AUDIENCE_OVER_BACKGROUND
          : AUDIENCE_BACKGROUND
      }
    >
      {/*
        * Fires with the chime and for the same duration, so a display with
        * sound disabled still signals the room that time is up.
        */}
      {alerting && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-1 bg-over/16 motion-safe:animate-pulse"
        />
      )}

      <header className="relative z-2 flex items-center justify-between text-[12px] text-[#8f8e99]">
        <BrandMark light />
        {/*
          * The poll failed, so nothing is known. The timer stays on screen — it is
          * still recomputed from `endsAt` and remains correct — but the room is told
          * the link is down rather than being left to trust a frozen number.
          */}
        {connection === "unavailable" && (
          <span
            role="status"
            className="rounded-full bg-[rgba(214,69,69,0.22)] px-2.5 py-1 text-[12px] font-semibold text-[#ffb4b4]"
          >
            Reconnecting…
          </span>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Sound is local to this display; another controller cannot change it. */}
          {isReady ? (
            <button
              className="inline-flex min-h-[38px] items-center gap-2 rounded-field border border-[#4ade80]/50 bg-[#4ade80]/15 px-3 text-[12px] font-semibold text-[#4ade80] transition-colors duration-150 hover:bg-[#4ade80]/22 hover:text-[#6cf09d]"
              onClick={() => void disable()}
              aria-pressed="true"
              title="Turn sound off on this display"
            >
              <span aria-hidden className="size-[7px] rounded-full bg-[#4ade80] shadow-[0_0_0_3px_rgba(74,222,128,0.22)] motion-safe:animate-pulse" />
              <Volume2 size={14} />
              Sound on
            </button>
          ) : (
            <button className="inline-flex min-h-[38px] items-center gap-2 rounded-field border border-[#9b83f5]/50 bg-violet/20 px-3 text-[12px] font-semibold text-[#cdc2ff] transition-colors duration-150 hover:bg-violet/32 hover:text-white" onClick={() => void unlock()} aria-pressed="false">
              <VolumeX size={14} />
              Tap to enable sound
            </button>
          )}
          <div className="relative" ref={soundPicker}>
            <button
              className="inline-flex min-h-[38px] items-center gap-2 rounded-field border border-white/12 bg-white/4 px-3 text-[12px] font-semibold text-[#b9b8c4] transition-colors duration-150 hover:bg-white/9 hover:text-[#f2f1f8]"
              type="button"
              aria-haspopup="dialog"
              aria-expanded={soundPickerOpen}
              aria-label={`Choose alarm sound. Current: ${selectedChime.label}`}
              onClick={() => setSoundPickerOpen((open) => !open)}
            >
              <Music2 size={14} aria-hidden />
              <span className="max-sm:hidden">{selectedChime.label}</span>
              <ChevronDown
                size={13}
                aria-hidden
                className={cn(
                  "transition-transform duration-150",
                  soundPickerOpen && "rotate-180",
                )}
              />
            </button>

            {soundPickerOpen && (
              <div
                role="dialog"
                aria-label="Alarm sound"
                className="absolute top-[calc(100%+0.5rem)] right-0 z-20 w-[min(330px,calc(100vw-2.75rem))] rounded-card border border-white/12 bg-[#18171f]/98 p-2.5 text-left shadow-[0_18px_50px_rgba(0,0,0,0.42)] backdrop-blur-xl"
              >
                <div className="px-2 pt-1 pb-2">
                  <strong className="block text-[13px] font-semibold text-white">
                    Alarm sound
                  </strong>
                  <span className="mt-0.5 block text-[11px] text-[#92909d]">
                    Select a sound or replay it with the preview button.
                  </span>
                </div>
                <div className="grid gap-1">
                  {CHIME_PRESETS.map((preset) => {
                    const selected = preset.id === chimePreset;
                    return (
                      <div
                        key={preset.id}
                        className={cn(
                          "grid grid-cols-[minmax(0,1fr)_2.5rem] items-center rounded-[11px] border border-transparent transition-colors duration-150",
                          selected
                            ? "border-violet/35 bg-violet/15"
                            : "hover:bg-white/5",
                        )}
                      >
                        <button
                          type="button"
                          className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-2.5 px-2.5 py-2 text-left"
                          aria-label={`Select ${preset.label}`}
                          aria-pressed={selected}
                          onClick={() => chooseChime(preset.id)}
                        >
                          <span
                            className={cn(
                              "grid size-5 place-items-center rounded-full border",
                              selected
                                ? "border-violet bg-violet text-white"
                                : "border-white/15 text-transparent",
                            )}
                            aria-hidden
                          >
                            <Check size={12} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[12px] font-semibold text-[#f4f3f8]">
                              {preset.label}
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-[#92909d]">
                              {preset.description}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="grid size-9 place-items-center rounded-[9px] text-[#b9b8c4] transition-colors duration-150 hover:bg-white/8 hover:text-white"
                          aria-label={`Preview ${preset.label}`}
                          onClick={() => void previewChime(preset.id)}
                        >
                          <Play size={13} fill="currentColor" aria-hidden />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <button onClick={toggleFullscreen} className="inline-flex min-h-[38px] items-center gap-2 rounded-field border border-white/12 bg-white/4 px-3 text-[12px] font-semibold text-[#b9b8c4] transition-colors duration-150 hover:bg-white/9 hover:text-[#f2f1f8]">
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          </button>
        </div>
      </header>

      <section className={cn("relative z-2 flex flex-1 flex-col items-center justify-center gap-[clamp(0.75rem,2vw,1.375rem)] py-[clamp(0.75rem,2.5vh,2rem)] text-center", isPanel && "has-panel-total")}>
        <span className="text-[12px] font-bold tracking-[0.14em] text-[#8d77e9] uppercase">{stateLabel}</span>
        <h1 className="text-[clamp(2.125rem,5.5vw,4.5rem)] leading-none font-semibold tracking-[-0.025em]">{current.speaker}</h1>
        {isPanel && currentItem && (
          <p className="text-[clamp(0.9375rem,2vw,1.375rem)] text-[#9c9ba5]">{panelLabel(currentItem)}</p>
        )}
        {/*
          * The speaker's own countdown is the hero on both layouts. During a
          * panel the whole-panel total sits underneath as a secondary line,
          * because it is context rather than the number being acted on.
          */}
        <div
          className={cn(
            "tabular font-mono leading-[1.04] tracking-[-0.06em] text-[#4ade80] transition-colors duration-300",
            /* Sized against both axes: a short, wide projector would otherwise
               push the panel total and footer off screen. */
            isPanel
              ? "text-[clamp(4rem,min(15vw,18vh),14.375rem)]"
              : "text-[clamp(4.5rem,min(19vw,30vh),18.75rem)]",
            speakerTone === "caution" && "text-[#ffb547]",
            speakerTone === "critical" && "text-[#ff7a70] motion-safe:animate-pulse",
          )}
        >
          {formatTimer(remaining)}
        </div>

        {isPanel && (
          <div className="rounded-card border border-white/9 bg-white/4 px-[clamp(1.25rem,4vw,2.5rem)] py-3.5 text-center">
            <span className="mb-2 block text-[clamp(0.5625rem,1vw,0.75rem)] font-bold tracking-[0.12em] text-[#8f8e99] uppercase">Panel remaining</span>
            <strong className={cn("tabular block font-mono text-[clamp(1.875rem,4.5vw,3.875rem)] leading-[0.9] font-medium tracking-[-0.06em] text-[#4ade80] transition-colors duration-300", panelTone === "caution" && "text-[#ffb547]", panelTone === "critical" && "text-[#ff7a70]")}>{formatTimer(panelRemaining)}</strong>
          </div>
        )}

        <p className="sr-only" role="status" aria-live="polite">
          {`${stateLabel}. ${current.speaker}. ${describeTimer(remaining)}.`}
        </p>

        <div
          className="h-2 w-[min(100%,900px)] overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-label="Time elapsed for the current speaker"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(speakerProgress * 100)}
        >
          <i
            className={cn(
              "block h-full origin-left rounded-full transition-[transform,background-color] duration-200 ease-linear",
              speakerTone === "critical" ? "bg-[#ff7a70]" : speakerTone === "caution" ? "bg-[#ffb547]" : "bg-[#4ade80]",
            )}
            style={{ transform: `scaleX(${speakerProgress})` }}
          />
        </div>
      </section>

      <footer className="relative z-2 flex items-end justify-between text-[12px] text-[#8f8e99] max-sm:flex-col max-sm:items-start max-sm:gap-4">
        <div>
          <span>{next ? "Next up" : "Final item"}</span>
          <strong className="mt-1 block font-medium text-[#aaa9b3]">{next ? next.speaker : event.name}</strong>
        </div>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="size-1.5 rounded-full bg-[#4ade80]" />
          Synced live
        </span>
      </footer>
    </main>
  );
}
