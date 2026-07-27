"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  GripVertical,
  Maximize2,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AuraMark } from "@/components/aura-mark";
import { DurationInput } from "@/components/duration-input";
import { LiveClock } from "@/components/live-clock";
import { SortableList } from "@/components/sortable-list";
import { flattenSegments, formatDuration, formatTimer } from "@/lib/format";
import { makeAgendaItem, useWorkspace } from "@/lib/store";
import type { AgendaItem, AuraEvent, RuntimeState, Speaker } from "@/lib/types";

function remainingNow(
  status: RuntimeState["status"] | undefined,
  endsAt: number | null | undefined,
  fallback: number | null | undefined,
) {
  if (status === "running" && endsAt) return Math.max(0, (endsAt - Date.now()) / 1000);
  return Math.max(0, fallback ?? 0);
}

export function ControlRoom() {
  const params = useParams<{ team: string; eventId: string }>();
  const router = useRouter();
  const { workspace, update } = useWorkspace(params.team);
  const event = workspace?.events.find((candidate) => candidate.id === params.eventId);
  const segments = useMemo(() => (event ? flattenSegments(event) : []), [event]);
  const runtime = event?.runtime;
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [panelDisplaySeconds, setPanelDisplaySeconds] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!runtime) return;
    const tick = () => {
      const liveSegment = segments[Math.min(runtime.segmentIndex, Math.max(0, segments.length - 1))];
      const liveItem = event?.agenda.find((item) => item.id === liveSegment?.agendaItemId);
      setDisplaySeconds(remainingNow(runtime.status, runtime.endsAt, runtime.remainingSeconds));
      setPanelDisplaySeconds(
        remainingNow(
          runtime.panelStatus ?? undefined,
          runtime.panelEndsAt,
          runtime.panelRemainingSeconds ?? (liveItem?.kind === "panel" ? liveItem.durationSeconds : 0),
        ),
      );
    };
    queueMicrotask(tick);
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [event, runtime, segments]);

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

  const activeEvent = event;
  const activeRuntime = runtime;
  const segmentIndex = Math.min(activeRuntime.segmentIndex, segments.length - 1);
  const current = segments[segmentIndex];
  const currentAgendaIndex = Math.max(
    0,
    activeEvent.agenda.findIndex((item) => item.id === current.agendaItemId),
  );
  const currentItem = activeEvent.agenda[currentAgendaIndex];
  const isPanel = currentItem.kind === "panel";
  const previousPart = segments[segmentIndex - 1];
  const nextPart = segments[segmentIndex + 1];
  const viewerPath = `/live/${activeEvent.viewerToken}`;
  const activeEventId = activeEvent.id;
  const isEnded = activeRuntime.status === "ended" || activeEvent.status === "completed";

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
      runtime: { ...currentEvent.runtime, ...patch, updatedAt: Date.now() },
    }));
  }

  function toggleSpeakerTimer() {
    if (activeRuntime.status === "running") {
      setRuntime({
        status: "paused",
        remainingSeconds: remainingNow(
          activeRuntime.status,
          activeRuntime.endsAt,
          activeRuntime.remainingSeconds,
        ),
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

  function togglePanelTimer() {
    const panelStatus = activeRuntime.panelStatus ?? "ready";
    if (panelStatus === "running") {
      setRuntime({
        panelStatus: "paused",
        panelRemainingSeconds: remainingNow(
          panelStatus,
          activeRuntime.panelEndsAt,
          activeRuntime.panelRemainingSeconds ?? currentItem.durationSeconds,
        ),
        panelEndsAt: null,
      });
      return;
    }
    const seconds =
      panelStatus === "ended"
        ? currentItem.durationSeconds
        : activeRuntime.panelRemainingSeconds ?? currentItem.durationSeconds;
    setRuntime(
      {
        panelStatus: "running",
        panelRemainingSeconds: seconds,
        panelEndsAt: Date.now() + seconds * 1000,
      },
      { status: "live" },
    );
  }

  function handleJumpTo(targetIndex: number, startSpeaker = false, startedAt = 0) {
    const safeIndex = Math.max(0, Math.min(segments.length - 1, targetIndex));
    const target = segments[safeIndex];
    const targetItem = activeEvent.agenda.find((item) => item.id === target.agendaItemId);
    if (!targetItem) return;
    const samePanel = targetItem.id === currentItem.id && targetItem.kind === "panel";
    const panelSeconds = samePanel
      ? remainingNow(
          activeRuntime.panelStatus ?? undefined,
          activeRuntime.panelEndsAt,
          activeRuntime.panelRemainingSeconds ?? currentItem.durationSeconds,
        )
      : targetItem.durationSeconds;
    const shouldRunPanel = targetItem.kind === "panel" && startSpeaker;
    setRuntime({
      status: startSpeaker ? "running" : "paused",
      segmentIndex: safeIndex,
      remainingSeconds: target.durationSeconds,
      endsAt: startSpeaker ? startedAt + target.durationSeconds * 1000 : null,
      panelStatus:
        targetItem.kind === "panel"
          ? shouldRunPanel
            ? "running"
            : samePanel
              ? activeRuntime.panelStatus ?? "ready"
              : "ready"
          : null,
      panelRemainingSeconds: targetItem.kind === "panel" ? panelSeconds : null,
      panelEndsAt:
        shouldRunPanel
          ? samePanel && activeRuntime.panelStatus === "running"
            ? activeRuntime.panelEndsAt
            : startedAt + panelSeconds * 1000
          : targetItem.kind === "panel" && samePanel
            ? activeRuntime.panelEndsAt ?? null
            : null,
    });
  }

  function adjust(seconds: number, panel = false) {
    if (panel) {
      const adjusted =
        remainingNow(
          activeRuntime.panelStatus ?? undefined,
          activeRuntime.panelEndsAt,
          activeRuntime.panelRemainingSeconds,
        ) + seconds;
      setRuntime({
        panelRemainingSeconds: Math.max(0, adjusted),
        panelEndsAt:
          activeRuntime.panelStatus === "running"
            ? Date.now() + Math.max(0, adjusted) * 1000
            : null,
      });
    } else {
      const adjusted =
        remainingNow(activeRuntime.status, activeRuntime.endsAt, activeRuntime.remainingSeconds) +
        seconds;
      setRuntime({
        remainingSeconds: Math.max(0, adjusted),
        endsAt:
          activeRuntime.status === "running"
            ? Date.now() + Math.max(0, adjusted) * 1000
            : null,
      });
    }
  }

  function resetCurrent() {
    setRuntime({
      status: "paused",
      remainingSeconds: current.durationSeconds,
      endsAt: null,
      panelStatus: isPanel ? "ready" : null,
      panelRemainingSeconds: isPanel ? currentItem.durationSeconds : null,
      panelEndsAt: null,
    });
  }

  function endEvent() {
    setRuntime(
      {
        status: "ended",
        remainingSeconds: 0,
        endsAt: null,
        panelStatus: isPanel ? "ended" : null,
        panelRemainingSeconds: isPanel ? 0 : null,
        panelEndsAt: null,
      },
      { status: "completed" },
    );
  }

  function startEvent() {
    const firstItem = activeEvent.agenda[0];
    const firstSegment = segments[0];
    setRuntime(
      {
        status: "ready",
        segmentIndex: 0,
        remainingSeconds: firstSegment.durationSeconds,
        endsAt: null,
        panelStatus: firstItem.kind === "panel" ? "ready" : null,
        panelRemainingSeconds: firstItem.kind === "panel" ? firstItem.durationSeconds : null,
        panelEndsAt: null,
      },
      { status: "live" },
    );
  }

  function patchAgendaItem(itemId: string, patch: Partial<AgendaItem>) {
    mutateEvent((currentEvent) => ({
      ...currentEvent,
      agenda: currentEvent.agenda.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item,
      ),
    }));
  }

  function patchSpeaker(item: AgendaItem, speakerId: string, patch: Partial<Speaker>) {
    patchAgendaItem(item.id, {
      speakers: item.speakers.map((speaker) =>
        speaker.id === speakerId ? { ...speaker, ...patch } : speaker,
      ),
    });
  }

  function changeFutureKind(item: AgendaItem, kind: AgendaItem["kind"]) {
    if (item.kind === kind) return;
    const fresh = makeAgendaItem(kind);
    patchAgendaItem(item.id, {
      kind,
      durationSeconds: fresh.durationSeconds,
      speakerDefaultSeconds: fresh.speakerDefaultSeconds,
      speakers: fresh.speakers,
    });
  }

  function removeFutureItem(itemId: string) {
    mutateEvent((currentEvent) => ({
      ...currentEvent,
      agenda: currentEvent.agenda.filter((item) => item.id !== itemId),
    }));
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}${viewerPath}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="live-admin-shell">
      <header className="live-admin-header">
        <div className="button-row">
          <Link className="ghost-button" href={`/t/${params.team}`}>
            <ArrowLeft size={15} />
            Events
          </Link>
          <AuraMark />
        </div>
        <div className="live-admin-title">
          <strong>{activeEvent.name}</strong>
          <span>{activeEvent.location}</span>
        </div>
        <div className="button-row">
          <LiveClock />
          <Link className="secondary-button" href={`/t/${params.team}/events/${activeEvent.id}/edit`}>
            <Pencil size={14} />
            Edit
          </Link>
          <Link className="secondary-button" href={viewerPath} target="_blank">
            <Maximize2 size={14} />
            Audience
          </Link>
          {isEnded ? (
            <button className="primary-button" onClick={startEvent}>
              <Play size={13} fill="currentColor" />
              Start event
            </button>
          ) : (
            <button className="danger-button" onClick={endEvent}>
              <Square size={11} fill="currentColor" />
              End event
            </button>
          )}
        </div>
      </header>

      <div className="live-admin-grid">
        <section className="compact-timer-card">
          <span className="now-label">{isPanel ? "Current panel" : "Now speaking"}</span>
          <h1>{current.title}</h1>
          <p className="speaker-name">{current.speaker}</p>

          {isPanel ? (
            <>
              <div className="panel-total-block">
                <span>Panel remaining</span>
                <strong className={panelDisplaySeconds <= 60 ? "warning-text" : ""}>
                  {formatTimer(panelDisplaySeconds)}
                </strong>
                <button className="secondary-button full-button" onClick={togglePanelTimer}>
                  {activeRuntime.panelStatus === "running" ? <Pause size={14} /> : <Play size={14} />}
                  {activeRuntime.panelStatus === "running" ? "Pause panel" : "Start panel"}
                </button>
              </div>
              <div className="speaker-timer-block">
                <span>Current speaker</span>
                <strong className={displaySeconds <= 60 ? "warning-text" : ""}>
                  {formatTimer(displaySeconds)}
                </strong>
                <button className="primary-button full-button" onClick={toggleSpeakerTimer}>
                  {activeRuntime.status === "running" ? <Pause size={14} /> : <Play size={14} />}
                  {activeRuntime.status === "running" ? "Pause speaker" : "Start speaker"}
                </button>
                <div className="mini-adjust-row">
                  <button onClick={() => adjust(-15)}>−15s</button>
                  <button onClick={() => adjust(15)}>+15s</button>
                </div>
              </div>
            </>
          ) : (
            <div className="single-compact-timer">
              <strong className={displaySeconds <= 60 ? "warning-text" : ""}>
                {formatTimer(displaySeconds)}
              </strong>
              <button className="primary-button full-button" onClick={toggleSpeakerTimer}>
                {activeRuntime.status === "running" ? <Pause size={14} /> : <Play size={14} />}
                {activeRuntime.status === "running" ? "Pause timer" : "Start timer"}
              </button>
            </div>
          )}

          <div className="compact-timer-actions">
            <button onClick={() => adjust(-60, isPanel)}>−1m</button>
            <button onClick={() => adjust(-15, isPanel)}>−15s</button>
            <button onClick={resetCurrent} aria-label="Reset timer">
              <RotateCcw size={13} />
            </button>
            <button onClick={() => adjust(15, isPanel)}>+15s</button>
            <button onClick={() => adjust(60, isPanel)}>+1m</button>
          </div>

          <div className="part-navigation">
            <button
              className="part-nav-button"
              disabled={!previousPart}
              onClick={() => handleJumpTo(segmentIndex - 1)}
            >
              <SkipBack size={14} />
              <span>
                <small>Previous</small>
                {previousPart?.speaker || "First part"}
              </span>
            </button>
            <button
              className="part-nav-button next"
              disabled={!nextPart}
              onClick={() => handleJumpTo(segmentIndex + 1, true, Date.now())}
            >
              <span>
                <small>Next part</small>
                {nextPart?.speaker || "Last part"}
              </span>
              <SkipForward size={14} />
            </button>
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
        </section>

        <section className="run-workspace">
          <div className="run-workspace-heading">
            <div>
              <span className="small-label">Live run of show</span>
              <h2>Control what happens next</h2>
            </div>
            <span className="event-count">
              {activeEvent.agenda.length - currentAgendaIndex - 1} upcoming
            </span>
          </div>

          <SortableList
            className="editable-run-list"
            items={activeEvent.agenda}
            scope={`live-agenda-${activeEvent.id}`}
            isItemDisabled={(_, itemIndex) => itemIndex <= currentAgendaIndex}
            onReorder={(agenda) =>
              mutateEvent((currentEvent) => ({ ...currentEvent, agenda }))
            }
            renderItem={(item, itemIndex, { dragHandleRef, onHandleKeyDown }) => {
              const isPast = itemIndex < currentAgendaIndex;
              const isCurrent = itemIndex === currentAgendaIndex;
              const isFuture = itemIndex > currentAgendaIndex;
              return (
                <article
                  className={`editable-run-item ${isCurrent ? "current" : ""} ${
                    isPast ? "past" : ""
                  }`}
                >
                  <div className="editable-run-index">
                    {isFuture ? (
                      <button
                        className="drag-handle-button compact"
                        ref={dragHandleRef}
                        type="button"
                        aria-label={`Drag ${item.title}`}
                        title="Drag to reorder, or press Alt + Up/Down"
                        onKeyDown={onHandleKeyDown}
                      >
                        <GripVertical size={16} />
                      </button>
                    ) : (
                      itemIndex + 1
                    )}
                  </div>
                  <div className="editable-run-content">
                    <div className="editable-run-topline">
                      <span className={`type-chip ${item.kind}`}>
                        {item.kind === "panel" ? <UsersRound size={11} /> : <UserRound size={11} />}
                        {item.kind}
                      </span>
                      {isCurrent && <span className="status-chip live">On now</span>}
                      {isPast && <span className="status-chip completed">Complete</span>}
                    </div>

                    {isFuture ? (
                      <>
                        <div className="future-item-grid">
                          <input
                            className="input"
                            aria-label="Agenda title"
                            value={item.title}
                            onChange={(inputEvent) =>
                              patchAgendaItem(item.id, { title: inputEvent.target.value })
                            }
                          />
                          <select
                            className="select"
                            aria-label="Agenda type"
                            value={item.kind}
                            onChange={(inputEvent) =>
                              changeFutureKind(item, inputEvent.target.value as AgendaItem["kind"])
                            }
                          >
                            <option value="single">Speaker</option>
                            <option value="panel">Panel</option>
                          </select>
                          <label className="inline-minutes">
                            <DurationInput
                              seconds={item.durationSeconds}
                              onSecondsChange={(durationSeconds) =>
                                patchAgendaItem(item.id, { durationSeconds })
                              }
                            />
                            min total
                          </label>
                          <button
                            className="mini-icon"
                            onClick={() => removeFutureItem(item.id)}
                            aria-label={`Remove ${item.title}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="future-speakers">
                          {item.kind === "panel" && (
                            <div className="future-panel-default">
                              <span>Default per panelist</span>
                              <label className="inline-minutes">
                                <DurationInput
                                  seconds={item.speakerDefaultSeconds}
                                  fallbackMinutes={5}
                                  onSecondsChange={(speakerDefaultSeconds) =>
                                    patchAgendaItem(item.id, { speakerDefaultSeconds })
                                  }
                                />
                                min
                              </label>
                              <button
                                className="secondary-button"
                                onClick={() =>
                                  patchAgendaItem(item.id, {
                                    speakers: item.speakers.map((speaker) => ({
                                      ...speaker,
                                      durationSeconds: item.speakerDefaultSeconds ?? 5 * 60,
                                    })),
                                  })
                                }
                              >
                                Apply to all
                              </button>
                            </div>
                          )}
                          <SortableList
                            className="sortable-speaker-list"
                            items={item.speakers}
                            scope={`live-panelists-${item.id}`}
                            onReorder={(speakers) => patchAgendaItem(item.id, { speakers })}
                            renderItem={(
                              speaker,
                              speakerIndex,
                              { dragHandleRef, onHandleKeyDown },
                            ) => (
                            <div
                              className={`future-speaker-row${
                                item.kind === "panel" ? " panel" : ""
                              }`}
                            >
                              {item.kind === "panel" && (
                                <button
                                  className="drag-handle-button compact"
                                  ref={dragHandleRef}
                                  type="button"
                                  aria-label={`Drag ${
                                    speaker.name || `panelist ${speakerIndex + 1}`
                                  }`}
                                  title="Drag to reorder, or press Alt + Up/Down"
                                  onKeyDown={onHandleKeyDown}
                                >
                                  <GripVertical size={14} />
                                </button>
                              )}
                              <input
                                className="input"
                                aria-label="Speaker name"
                                value={speaker.name}
                                onChange={(inputEvent) =>
                                  patchSpeaker(item, speaker.id, { name: inputEvent.target.value })
                                }
                              />
                              <label className="inline-minutes">
                                <DurationInput
                                  seconds={speaker.durationSeconds}
                                  onSecondsChange={(durationSeconds) =>
                                    patchSpeaker(item, speaker.id, { durationSeconds })
                                  }
                                />
                                min
                              </label>
                              {item.kind === "panel" && (
                                <button
                                  className="mini-icon"
                                  disabled={item.speakers.length === 1}
                                  onClick={() =>
                                    patchAgendaItem(item.id, {
                                      speakers: item.speakers.filter(
                                        (candidate) => candidate.id !== speaker.id,
                                      ),
                                    })
                                  }
                                  aria-label={`Remove ${speaker.name}`}
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                            )}
                          />
                          {item.kind === "panel" && (
                            <button
                              className="ghost-button"
                              onClick={() =>
                                patchAgendaItem(item.id, {
                                  speakers: [
                                    ...item.speakers,
                                    {
                                      id: crypto.randomUUID(),
                                      name: `Panelist ${item.speakers.length + 1}`,
                                      durationSeconds: item.speakerDefaultSeconds ?? 5 * 60,
                                    },
                                  ],
                                })
                              }
                            >
                              <Plus size={13} />
                              Add panelist
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <h3>{item.title}</h3>
                        <p>{formatDuration(item.durationSeconds)} total</p>
                        {isCurrent && item.kind === "panel" && (
                          <div className="current-panel-speakers">
                            {item.speakers.map((speaker) => {
                              const speakerIndex = segments.findIndex(
                                (segment) => segment.id === speaker.id,
                              );
                              const speakerIsCurrent = speakerIndex === segmentIndex;
                              return (
                                <button
                                  key={speaker.id}
                                  className={speakerIsCurrent ? "active" : ""}
                                  onClick={() => handleJumpTo(speakerIndex, true, Date.now())}
                                >
                                  <span>{speaker.name}</span>
                                  <strong>
                                    {speakerIsCurrent && activeRuntime.status === "running"
                                      ? "Speaking"
                                      : `Start · ${formatDuration(speaker.durationSeconds)}`}
                                  </strong>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </article>
              );
            }}
          />

          <button
            className="add-item-button"
            onClick={() =>
              mutateEvent((currentEvent) => ({
                ...currentEvent,
                agenda: [...currentEvent.agenda, makeAgendaItem()],
              }))
            }
          >
            <Plus size={14} style={{ display: "inline", marginRight: 6 }} />
            Add upcoming item
          </button>
        </section>
      </div>
    </main>
  );
}
