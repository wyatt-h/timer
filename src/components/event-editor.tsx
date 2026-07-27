"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, GripVertical, Plus, Trash2, UserRound, UsersRound } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { agendaDuration, formatDuration } from "@/lib/format";
import { makeAgendaItem, makeEvent, useWorkspace } from "@/lib/store";
import type { AgendaItem, AuraEvent, Speaker } from "@/lib/types";

function minutes(seconds: number | undefined, fallback = 1) {
  return Math.max(fallback, Math.round((seconds ?? fallback * 60) / 60));
}

export function EventEditor() {
  const params = useParams<{ team: string; eventId?: string }>();
  const router = useRouter();
  const team = params.team;
  const eventId = params.eventId;
  const { workspace, update } = useWorkspace(team);
  const existing = workspace?.events.find((event) => event.id === eventId);
  const [draft, setDraft] = useState<AuraEvent>(() => makeEvent("New event"));
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const isEditing = Boolean(eventId);

  useEffect(() => {
    if (!eventId || !existing || hydratedId === eventId) return;
    queueMicrotask(() => {
      setDraft(structuredClone(existing));
      setHydratedId(eventId);
    });
  }, [eventId, existing, hydratedId]);

  const totalSeconds = useMemo(
    () => draft.agenda.reduce((sum, item) => sum + agendaDuration(item), 0),
    [draft.agenda],
  );

  function patchItem(itemId: string, patch: Partial<AgendaItem>) {
    setDraft((current) => ({
      ...current,
      agenda: current.agenda.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    }));
  }

  function changeKind(item: AgendaItem, kind: AgendaItem["kind"]) {
    if (item.kind === kind) return;
    if (kind === "panel") {
      const panel = makeAgendaItem("panel");
      patchItem(item.id, {
        kind,
        speakers: panel.speakers,
        durationSeconds: panel.durationSeconds,
        speakerDefaultSeconds: panel.speakerDefaultSeconds,
      });
    } else {
      patchItem(item.id, {
        kind,
        durationSeconds: item.speakers[0]?.durationSeconds ?? 10 * 60,
        speakerDefaultSeconds: undefined,
        speakers: [
          item.speakers[0] ?? {
            id: crypto.randomUUID(),
            name: "",
            durationSeconds: 10 * 60,
          },
        ],
      });
    }
  }

  function patchSpeaker(item: AgendaItem, speakerId: string, patch: Partial<Speaker>) {
    patchItem(item.id, {
      speakers: item.speakers.map((speaker) =>
        speaker.id === speakerId ? { ...speaker, ...patch } : speaker,
      ),
    });
  }

  function addSpeaker(item: AgendaItem) {
    const durationSeconds = item.speakerDefaultSeconds ?? 5 * 60;
    patchItem(item.id, {
      speakers: [
        ...item.speakers,
        { id: crypto.randomUUID(), name: `Panelist ${item.speakers.length + 1}`, durationSeconds },
      ],
    });
  }

  function applyDefault(item: AgendaItem) {
    const durationSeconds = item.speakerDefaultSeconds ?? 5 * 60;
    patchItem(item.id, {
      speakers: item.speakers.map((speaker) => ({ ...speaker, durationSeconds })),
    });
  }

  function removeItem(itemId: string) {
    setDraft((current) => ({
      ...current,
      agenda: current.agenda.filter((item) => item.id !== itemId),
    }));
  }

  function save(start = false) {
    if (!draft.name.trim() || !draft.agenda.length) return;
    const first = draft.agenda[0];
    const firstDuration =
      first.kind === "panel"
        ? first.speakers[0]?.durationSeconds ?? first.speakerDefaultSeconds ?? 300
        : first.durationSeconds;
    const shouldResetRuntime = !existing || (start && draft.status !== "live");
    const next: AuraEvent = {
      ...draft,
      name: draft.name.trim(),
      status: start ? "live" : draft.status,
      runtime:
        shouldResetRuntime
          ? {
              status: "ready",
              segmentIndex: 0,
              remainingSeconds: firstDuration,
              endsAt: null,
              panelStatus: first.kind === "panel" ? "ready" : null,
              panelRemainingSeconds: first.kind === "panel" ? first.durationSeconds : null,
              panelEndsAt: null,
              updatedAt: Date.now(),
            }
          : draft.runtime,
    };
    update((current) => ({
      ...current,
      events: isEditing
        ? current.events.map((event) => (event.id === next.id ? next : event))
        : [next, ...current.events],
    }));
    router.push(start ? `/t/${team}/events/${next.id}` : `/t/${team}`);
  }

  return (
    <main className="app-shell">
      <AppHeader team={team} />
      <section className="editor-layout">
        <div className="editor-heading">
          <div>
            <button className="ghost-button" onClick={() => router.push(`/t/${team}`)}>
              <ArrowLeft size={15} />
              Back to events
            </button>
            <h1 style={{ marginTop: 20 }}>{isEditing ? "Edit event" : "Create an event"}</h1>
            <p>
              {isEditing
                ? "Update event details, timing, speakers, and the run of show."
                : "Build the run of show. You can adjust every timer once the event is live."}
            </p>
          </div>
          <div className="button-row">
            <button className="secondary-button" onClick={() => save(false)}>
              Save changes
            </button>
            <button className="primary-button" onClick={() => save(true)}>
              {draft.status === "live" ? "Return to control" : "Start event"}
            </button>
          </div>
        </div>

        <div className="editor-form">
          <div className="editor-main">
            <section className="panel-card">
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="event-name">Event name</label>
                  <input
                    className="input"
                    id="event-name"
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    placeholder="Annual Leadership Summit"
                  />
                </div>
                <div className="field">
                  <label htmlFor="event-date">Date</label>
                  <input
                    className="input"
                    id="event-date"
                    type="date"
                    value={draft.date}
                    onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                  />
                </div>
              </div>
              <div className="field field-spacer">
                <label htmlFor="event-location">Location</label>
                <input
                  className="input"
                  id="event-location"
                  value={draft.location}
                  onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                  placeholder="Main stage"
                />
              </div>
            </section>

            {draft.agenda.map((item, index) => (
              <section className="panel-card agenda-item" key={item.id}>
                <div className="agenda-item-header">
                  <div className="agenda-number">
                    <GripVertical className="drag-handle" size={16} />
                    Item {index + 1}
                  </div>
                  <div className="button-row">
                    <div className="type-toggle">
                      <button
                        className={item.kind === "single" ? "active" : ""}
                        onClick={() => changeKind(item, "single")}
                        type="button"
                      >
                        <UserRound size={12} style={{ display: "inline", marginRight: 4 }} />
                        Speaker
                      </button>
                      <button
                        className={item.kind === "panel" ? "active" : ""}
                        onClick={() => changeKind(item, "panel")}
                        type="button"
                      >
                        <UsersRound size={12} style={{ display: "inline", marginRight: 4 }} />
                        Panel
                      </button>
                    </div>
                    {draft.agenda.length > 1 && (
                      <button
                        className="mini-icon"
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove item ${index + 1}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor={`title-${item.id}`}>
                    {item.kind === "single" ? "Talk title" : "Panel title"}
                  </label>
                  <input
                    className="input"
                    id={`title-${item.id}`}
                    value={item.title}
                    onChange={(event) => patchItem(item.id, { title: event.target.value })}
                  />
                </div>

                {item.kind === "single" ? (
                  <div className="field-grid" style={{ marginTop: 14 }}>
                    <div className="field">
                      <label htmlFor={`speaker-${item.id}`}>Speaker</label>
                      <input
                        className="input"
                        id={`speaker-${item.id}`}
                        value={item.speakers[0]?.name ?? ""}
                        onChange={(event) =>
                          patchSpeaker(item, item.speakers[0].id, { name: event.target.value })
                        }
                        placeholder="Speaker name"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`duration-${item.id}`}>Total time (minutes)</label>
                      <input
                        className="input"
                        id={`duration-${item.id}`}
                        min={1}
                        type="number"
                        value={minutes(item.durationSeconds)}
                        onChange={(event) =>
                          patchItem(item.id, { durationSeconds: Number(event.target.value) * 60 })
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="field-grid" style={{ marginTop: 14 }}>
                      <div className="field">
                        <label htmlFor={`panel-total-${item.id}`}>Panel total (minutes)</label>
                        <input
                          className="input"
                          id={`panel-total-${item.id}`}
                          min={1}
                          type="number"
                          value={minutes(item.durationSeconds)}
                          onChange={(event) =>
                            patchItem(item.id, {
                              durationSeconds: Number(event.target.value) * 60,
                            })
                          }
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`speaker-default-${item.id}`}>
                          Default per panelist (minutes)
                        </label>
                        <div className="inline-field-action">
                          <input
                            className="input"
                            id={`speaker-default-${item.id}`}
                            min={1}
                            type="number"
                            value={minutes(item.speakerDefaultSeconds, 5)}
                            onChange={(event) =>
                              patchItem(item.id, {
                                speakerDefaultSeconds: Number(event.target.value) * 60,
                              })
                            }
                          />
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => applyDefault(item)}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="speaker-list">
                      <span className="small-label">Panelists and individual time</span>
                    {item.speakers.map((speaker) => (
                      <div className="speaker-row" key={speaker.id}>
                        <input
                          className="input"
                          aria-label="Panelist name"
                          value={speaker.name}
                          onChange={(event) =>
                            patchSpeaker(item, speaker.id, { name: event.target.value })
                          }
                        />
                        <input
                          className="input"
                          aria-label={`${speaker.name} minutes`}
                          min={1}
                          type="number"
                          value={minutes(speaker.durationSeconds)}
                          onChange={(event) =>
                            patchSpeaker(item, speaker.id, {
                              durationSeconds: Number(event.target.value) * 60,
                            })
                          }
                        />
                        <button
                          className="mini-icon"
                          type="button"
                          aria-label={`Remove ${speaker.name}`}
                          disabled={item.speakers.length === 1}
                          onClick={() =>
                            patchItem(item.id, {
                              speakers: item.speakers.filter(
                                (candidate) => candidate.id !== speaker.id,
                              ),
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button className="ghost-button" type="button" onClick={() => addSpeaker(item)}>
                      <Plus size={14} />
                      Add panelist
                    </button>
                    </div>
                  </>
                )}
              </section>
            ))}

            <button
              className="add-item-button"
              type="button"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  agenda: [...current.agenda, makeAgendaItem()],
                }))
              }
            >
              <Plus size={14} style={{ display: "inline", marginRight: 6 }} />
              Add agenda item
            </button>
          </div>

          <aside className="editor-side panel-card">
            <span className="small-label">Event summary</span>
            <div className="summary-list">
              <div className="summary-row">
                <span>Agenda items</span>
                <strong>{draft.agenda.length}</strong>
              </div>
              <div className="summary-row">
                <span>Total speakers</span>
                <strong>
                  {draft.agenda.reduce((sum, item) => sum + Math.max(1, item.speakers.length), 0)}
                </strong>
              </div>
              <div className="summary-row">
                <span>Program time</span>
                <strong>{formatDuration(totalSeconds)}</strong>
              </div>
            </div>
            <button className="primary-button full-button" onClick={() => save(true)}>
              {draft.status === "live" ? "Return to control" : "Start event"}
            </button>
          </aside>
        </div>
      </section>
    </main>
  );
}
