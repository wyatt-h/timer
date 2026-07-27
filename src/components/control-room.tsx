"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AuraMark } from "@/components/aura-mark";
import { flattenSegments, formatDuration, formatTimer } from "@/lib/format";
import { useWorkspace } from "@/lib/store";
import type { AuraEvent, RuntimeState } from "@/lib/types";

function remainingNow(runtime: RuntimeState) {
  if (runtime.status === "running" && runtime.endsAt) {
    return Math.max(0, (runtime.endsAt - Date.now()) / 1000);
  }
  return Math.max(0, runtime.remainingSeconds);
}

export function ControlRoom() {
  const params = useParams<{ team: string; eventId: string }>();
  const router = useRouter();
  const { workspace, update } = useWorkspace(params.team);
  const event = workspace?.events.find((candidate) => candidate.id === params.eventId);
  const segments = useMemo(() => (event ? flattenSegments(event) : []), [event]);
  const runtime = event?.runtime;
  const [displaySeconds, setDisplaySeconds] = useState(runtime ? remainingNow(runtime) : 0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!runtime) return;
    const tick = () => setDisplaySeconds(remainingNow(runtime));
    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [runtime]);

  if (!workspace) return null;
  if (!event || !runtime || !segments.length) {
    return (
      <main className="not-found">
        <div>
          <h1>Event not found</h1>
          <button className="primary-button" onClick={() => router.push(`/t/${params.team}`)}>
            Return to events
          </button>
        </div>
      </main>
    );
  }

  const activeRuntime = runtime;
  const index = Math.min(activeRuntime.segmentIndex, segments.length - 1);
  const current = segments[index];
  const next = segments[index + 1];
  const viewerPath = `/live/${event.viewerToken}`;
  const activeEventId = event.id;

  function mutateEvent(updater: (current: AuraEvent) => AuraEvent) {
    update((currentWorkspace) => ({
      ...currentWorkspace,
      events: currentWorkspace.events.map((candidate) =>
        candidate.id === activeEventId ? updater(candidate) : candidate,
      ),
    }));
  }

  function setRuntime(patch: Partial<RuntimeState>, eventPatch?: Partial<AuraEvent>) {
    mutateEvent((currentEvent) => ({
      ...currentEvent,
      ...eventPatch,
      runtime: {
        ...currentEvent.runtime,
        ...patch,
        updatedAt: Date.now(),
      },
    }));
  }

  function toggleTimer() {
    if (activeRuntime.status === "running") {
      setRuntime({
        status: "paused",
        remainingSeconds: remainingNow(activeRuntime),
        endsAt: null,
      });
      return;
    }
    const seconds =
      activeRuntime.status === "ended" ? current.durationSeconds : activeRuntime.remainingSeconds;
    setRuntime(
      {
        status: "running",
        remainingSeconds: seconds,
        endsAt: Date.now() + seconds * 1000,
      },
      { status: "live" },
    );
  }

  function jumpTo(targetIndex: number) {
    const safeIndex = Math.max(0, Math.min(segments.length - 1, targetIndex));
    const segment = segments[safeIndex];
    setRuntime({
      status: activeRuntime.status === "running" ? "running" : "paused",
      segmentIndex: safeIndex,
      remainingSeconds: segment.durationSeconds,
      endsAt:
        activeRuntime.status === "running" ? Date.now() + segment.durationSeconds * 1000 : null,
    });
  }

  function adjust(seconds: number) {
    const adjusted = Math.max(0, remainingNow(activeRuntime) + seconds);
    setRuntime({
      remainingSeconds: adjusted,
      endsAt: activeRuntime.status === "running" ? Date.now() + adjusted * 1000 : null,
    });
  }

  function reset() {
    setRuntime({
      status: "paused",
      remainingSeconds: current.durationSeconds,
      endsAt: null,
    });
  }

  function endEvent() {
    setRuntime(
      {
        status: "ended",
        remainingSeconds: 0,
        endsAt: null,
      },
      { status: "completed" },
    );
  }

  async function copyLink() {
    const link = `${window.location.origin}${viewerPath}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const timerClass =
    displaySeconds <= 0 ? "timer-display overtime" : displaySeconds <= 60 ? "timer-display warning" : "timer-display";

  return (
    <main className="controller-shell">
      <header className="controller-header">
        <div className="button-row">
          <Link className="ghost-button" href={`/t/${params.team}`}>
            <ArrowLeft size={15} />
            <span>Events</span>
          </Link>
          <AuraMark />
        </div>
        <div className="button-row">
          <Link className="secondary-button" href={viewerPath} target="_blank">
            <Maximize2 size={14} />
            Audience view
          </Link>
          <button className="danger-button" onClick={endEvent}>
            <Square size={12} fill="currentColor" />
            End event
          </button>
        </div>
      </header>

      <div className="controller-grid">
        <section className="controller-card">
          <span className="now-label">
            {activeRuntime.status === "paused"
              ? "Paused"
              : activeRuntime.status === "ended"
                ? "Event ended"
                : "Now speaking"}
          </span>
          <h1>{current.title}</h1>
          <p className="speaker-name">{current.speaker}</p>

          <div className={timerClass} aria-live="polite">
            {formatTimer(displaySeconds)}
          </div>

          <div className="timer-controls">
            <button
              className="round-control"
              onClick={() => jumpTo(index - 1)}
              disabled={index === 0}
              aria-label="Previous speaker"
            >
              <ChevronLeft size={20} />
            </button>
            <button className="round-control" onClick={reset} aria-label="Reset timer">
              <RotateCcw size={17} />
            </button>
            <button className="play-control" onClick={toggleTimer} aria-label="Play or pause timer">
              {activeRuntime.status === "running" ? (
                <Pause size={23} fill="currentColor" />
              ) : (
                <Play size={23} fill="currentColor" style={{ marginLeft: 3 }} />
              )}
            </button>
            <button
              className="round-control"
              onClick={() => jumpTo(index + 1)}
              disabled={index === segments.length - 1}
              aria-label="Next speaker"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="time-adjust">
            <button onClick={() => adjust(-60)}>−1 min</button>
            <button onClick={() => adjust(-15)}>−15 sec</button>
            <button onClick={() => adjust(15)}>+15 sec</button>
            <button onClick={() => adjust(60)}>+1 min</button>
          </div>
        </section>

        <aside className="agenda-sidebar">
          <h2>Run of show</h2>
          <div className="run-list">
            {segments.map((segment, segmentIndex) => (
              <button
                className={`run-item ${
                  segmentIndex === index ? "active" : segmentIndex < index ? "done" : ""
                }`}
                key={segment.id}
                onClick={() => jumpTo(segmentIndex)}
                style={{ border: 0, width: "100%", textAlign: "left", cursor: "pointer" }}
              >
                <span className="run-number">
                  {segmentIndex < index ? <Check size={11} /> : segmentIndex + 1}
                </span>
                <span className="run-copy">
                  <strong>{segment.title}</strong>
                  <span>{segment.speaker}</span>
                </span>
                <span>{formatDuration(segment.durationSeconds)}</span>
              </button>
            ))}
          </div>

          <div className="share-box">
            <span>Audience link</span>
            <div className="share-row">
              <code>{viewerPath}</code>
              <button className="mini-icon" onClick={copyLink} aria-label="Copy audience link">
                {copied ? <Check size={14} color="#20a76f" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          {next && (
            <div className="share-box">
              <span>Next up</span>
              <strong style={{ display: "block", fontSize: 11 }}>{next.title}</strong>
              <small style={{ color: "#96969d", fontSize: 9 }}>{next.speaker}</small>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
