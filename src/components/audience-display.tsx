"use client";

import { Maximize2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AuraMark } from "@/components/aura-mark";
import { flattenSegments, formatTimer } from "@/lib/format";
import { usePublicEvent } from "@/lib/store";

export function AudienceDisplay() {
  const params = useParams<{ token: string }>();
  const result = usePublicEvent(params.token);
  const event = result?.event;
  const segments = useMemo(() => (event ? flattenSegments(event) : []), [event]);
  const runtime = event?.runtime;
  const [remaining, setRemaining] = useState(runtime?.remainingSeconds ?? 0);
  const [panelRemaining, setPanelRemaining] = useState(runtime?.panelRemainingSeconds ?? 0);

  useEffect(() => {
    if (!runtime) return;
    const tick = () => {
      if (runtime.status === "running" && runtime.endsAt) {
        setRemaining(Math.max(0, (runtime.endsAt - Date.now()) / 1000));
      } else {
        setRemaining(Math.max(0, runtime.remainingSeconds));
      }
      if (runtime.panelStatus === "running" && runtime.panelEndsAt) {
        setPanelRemaining(Math.max(0, (runtime.panelEndsAt - Date.now()) / 1000));
      } else {
        const liveSegment = segments[Math.min(runtime.segmentIndex, Math.max(0, segments.length - 1))];
        const liveItem = event?.agenda.find((item) => item.id === liveSegment?.agendaItemId);
        setPanelRemaining(
          Math.max(
            0,
            runtime.panelRemainingSeconds ??
              (liveItem?.kind === "panel" ? liveItem.durationSeconds : 0),
          ),
        );
      }
    };
    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [event, runtime, segments]);

  if (!result || !event || !runtime || !segments.length) {
    return (
      <main className="audience-shell">
        <header className="audience-header">
          <AuraMark light />
        </header>
        <section className="audience-main">
          <span className="now-label">Waiting for event</span>
          <h1>This timer isn&apos;t live yet.</h1>
          <p className="audience-speaker">Keep this screen open. It will update automatically.</p>
        </section>
      </main>
    );
  }

  const index = Math.min(runtime.segmentIndex, segments.length - 1);
  const current = segments[index];
  const next = segments[index + 1];
  const currentItem = event.agenda.find((item) => item.id === current.agendaItemId);
  const isPanel = currentItem?.kind === "panel";
  const isWarning = remaining <= 60;

  async function enterFullscreen() {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }

  return (
    <main className="audience-shell">
      <header className="audience-header">
        <AuraMark light />
        <button
          className="ghost-button"
          onClick={enterFullscreen}
          style={{ color: "#8b8a95" }}
        >
          <Maximize2 size={14} />
          Fullscreen
        </button>
      </header>

      <section className="audience-main">
        <span className="now-label">
          {runtime.status === "paused"
            ? "Paused"
            : runtime.status === "ended"
              ? "Event complete"
              : isPanel
                ? "Panel in progress"
                : "Now speaking"}
        </span>
        <h1>{current.title}</h1>
        <p className="audience-speaker">{current.speaker}</p>
        {isPanel ? (
          <div className="audience-panel-timers">
            <div className="audience-panel-total">
              <span>Panel remaining</span>
              <strong style={panelRemaining <= 60 ? { color: "#e8a94f" } : undefined}>
                {formatTimer(panelRemaining)}
              </strong>
            </div>
            <div className="audience-speaker-total">
              <span>{current.speaker}</span>
              <strong style={isWarning ? { color: remaining <= 0 ? "#ff6464" : "#e8a94f" } : undefined}>
                {formatTimer(remaining)}
              </strong>
            </div>
          </div>
        ) : (
          <div
            className="audience-timer"
            style={isWarning ? { color: remaining <= 0 ? "#ff6464" : "#e8a94f" } : undefined}
            aria-live="polite"
          >
            {formatTimer(remaining)}
          </div>
        )}
      </section>

      <footer className="audience-footer">
        <div className="next-up">
          <span>{next ? "Next up" : "Final item"}</span>
          <strong>{next ? `${next.title} · ${next.speaker}` : event.name}</strong>
        </div>
        <span className="connection-state">
          <span className="live-dot" />
          Synced live
        </span>
      </footer>
    </main>
  );
}
