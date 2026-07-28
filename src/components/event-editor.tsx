"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, CircleCheck } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { DateField } from "@/components/date-field";
import { AgendaEditor } from "@/components/agenda/agenda-editor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDuration } from "@/lib/format";
import { makeEvent, useWorkspace } from "@/lib/store";
import { agendaFormSchema, type AgendaFormValues } from "@/lib/agenda-schema";
import { toAgendaItems, toFormValues } from "@/lib/agenda-mapping";
import type { TimerEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

function editorSnapshot(name: string, date: string, agenda: AgendaFormValues) {
  return JSON.stringify({ name, date, agendaItems: agenda.agendaItems });
}

export function EventEditor() {
  const params = useParams<{ team: string; eventId?: string }>();
  const router = useRouter();
  const team = params.team;
  const eventId = params.eventId;
  const { workspace, update } = useWorkspace(team);
  const existing = workspace?.events.find((event) => event.id === eventId);

  const [draft, setDraft] = useState<TimerEvent>(() => makeEvent("New event"));
  const [agenda, setAgenda] = useState<AgendaFormValues | null>(null);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [saveNoticeVisible, setSaveNoticeVisible] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const saveNoticeTimer = useRef<number | null>(null);
  const isEditing = Boolean(eventId);

  useEffect(() => {
    if (!eventId || !existing || hydratedId === eventId) return;
    queueMicrotask(() => {
      const storedDraft = structuredClone(existing);
      const storedAgenda = toFormValues(existing.agenda);
      setDraft(storedDraft);
      setAgenda(storedAgenda);
      setSavedSnapshot(editorSnapshot(storedDraft.name, storedDraft.date, storedAgenda));
      setHydratedId(eventId);
    });
  }, [eventId, existing, hydratedId]);

  useEffect(
    () => () => {
      if (saveNoticeTimer.current !== null) {
        window.clearTimeout(saveNoticeTimer.current);
      }
    },
    [],
  );

  /*
   * The agenda editor owns its own form state; this holds the last value it
   * reported so the page can save it. Until the editor reports anything, the
   * seed from the stored event stands in.
   */
  const currentAgenda = useMemo(
    () => agenda ?? toFormValues(draft.agenda),
    [agenda, draft.agenda],
  );
  const currentSnapshot = useMemo(
    () => editorSnapshot(draft.name, draft.date, currentAgenda),
    [draft.name, draft.date, currentAgenda],
  );
  const hasUnsavedChanges =
    savedSnapshot !== null && currentSnapshot !== savedSnapshot;

  /* Mounting the editor with a changing key would reset it mid-edit, so the
     initial values are captured once per hydrated event. */
  const initialAgenda = useMemo(
    () => toFormValues(existing?.agenda ?? draft.agenda),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hydratedId],
  );

  const nameError = draft.name.trim() ? "" : "Give the event a name before saving.";
  const agendaResult = agendaFormSchema.safeParse(currentAgenda);

  function hideSaveNotice() {
    setSaveNoticeVisible(false);
    if (saveNoticeTimer.current !== null) {
      window.clearTimeout(saveNoticeTimer.current);
      saveNoticeTimer.current = null;
    }
  }

  function showSaveNotice() {
    setSaveNoticeVisible(true);
    if (saveNoticeTimer.current !== null) {
      window.clearTimeout(saveNoticeTimer.current);
    }
    saveNoticeTimer.current = window.setTimeout(() => {
      setSaveNoticeVisible(false);
      saveNoticeTimer.current = null;
    }, 3200);
  }

  function save(start = false) {
    if (nameError) {
      setShowErrors(true);
      nameField.current?.focus();
      return;
    }
    if (!agendaResult.success) {
      setShowErrors(true);
      return;
    }

    const nextAgenda = toAgendaItems(currentAgenda, draft.agenda);
    const first = nextAgenda[0];
    const firstDuration =
      first.kind === "panel"
        ? first.speakers[0]?.durationSeconds ?? first.speakerDefaultSeconds ?? 300
        : first.durationSeconds;
    const shouldResetRuntime = !existing || (start && draft.status !== "live");

    const next: TimerEvent = {
      ...draft,
      name: draft.name.trim(),
      agenda: nextAgenda,
      status: start ? "live" : draft.status,
      runtime: shouldResetRuntime
        ? {
            status: "ready",
            segmentIndex: 0,
            remainingSeconds: firstDuration,
            endsAt: null,
            panelStatus: first.kind === "panel" ? "ready" : null,
            panelRemainingSeconds: first.kind === "panel" ? first.durationSeconds : null,
            panelEndsAt: null,
            soundEnabled: draft.runtime.soundEnabled ?? true,
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

    const savedAgenda = toFormValues(nextAgenda);
    setDraft(next);
    setAgenda(savedAgenda);
    setSavedSnapshot(editorSnapshot(next.name, next.date, savedAgenda));
    setShowErrors(false);

    if (!start && isEditing) {
      showSaveNotice();
      return;
    }

    router.push(start ? `/t/${team}/events/${next.id}` : `/t/${team}`);
  }

  const programmeSeconds = currentAgenda.agendaItems.reduce(
    (sum, item) => sum + item.durationMinutes * 60,
    0,
  );

  return (
    <main className="min-h-svh bg-paper" id="main">
      <AppHeader team={team} />

      <div className="mx-auto w-[min(1040px,calc(100%-2.5rem))] pt-9 pb-24">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3"
              onClick={() => router.push(`/t/${team}`)}
            >
              <ArrowLeft size={15} aria-hidden />
              Back to events
            </Button>
            <h1 className="mt-4 text-[clamp(2rem,4vw,2.6rem)] leading-tight font-semibold tracking-[-0.05em]">
              {isEditing ? "Edit event" : "New event"}
            </h1>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2">
              {hasUnsavedChanges && (
                <span
                  role="status"
                  className="inline-flex items-center gap-1.5 rounded-full bg-caution-soft px-2.5 py-1 text-[12px] font-semibold text-caution"
                >
                  <span className="size-1.5 rounded-full bg-current" aria-hidden />
                  Unsaved changes
                </span>
              )}
              <Button variant="secondary" onClick={() => save(false)}>
                Save changes
              </Button>
            </div>
            <Button variant="primary" onClick={() => save(true)}>
              {draft.status === "live" ? "Return to control" : "Start event"}
            </Button>
          </div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          {/*
            * Details come first in the document so they stay ahead of the
            * agenda on smaller screens. The desktop grid moves this card to
            * the right without changing that reading order.
            */}
          <aside className="lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1">
            <Card className="p-5">
              <h2 className="text-[18px] font-semibold tracking-[-0.025em]">
                Event details
              </h2>

              <div className="mt-4 grid gap-4">
                <div className="min-w-0">
                  <Label htmlFor="event-name">Event name</Label>
                  <Input
                    id="event-name"
                    ref={nameField}
                    className="mt-1.5"
                    placeholder="Annual Leadership Summit"
                    value={draft.name}
                    aria-invalid={showErrors && Boolean(nameError)}
                    aria-describedby={showErrors && nameError ? "event-name-error" : undefined}
                    onChange={(event) => {
                      hideSaveNotice();
                      setDraft({ ...draft, name: event.target.value });
                    }}
                  />
                  {showErrors && nameError && (
                    <p
                      id="event-name-error"
                      className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-over"
                    >
                      <AlertCircle size={12} aria-hidden />
                      {nameError}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="event-date">Date</Label>
                  <div className="mt-1.5">
                    <DateField
                      id="event-date"
                      value={draft.date}
                      onChange={(date) => {
                        hideSaveNotice();
                        setDraft({ ...draft, date });
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 border-t border-line-soft pt-4">
                <h3 className="text-[13px] font-semibold text-text-muted">
                  Programme summary
                </h3>
                <dl
                  className="mt-3 grid grid-cols-2 gap-2"
                  aria-live="polite"
                >
                  <div className="rounded-control bg-surface-sunken px-3 py-2.5">
                    <dt className="text-[12px] text-text-subtle">Agenda items</dt>
                    <dd className="tabular mt-1 text-[18px] font-semibold tracking-[-0.03em]">
                      {currentAgenda.agendaItems.length}
                    </dd>
                  </div>
                  <div className="rounded-control bg-surface-sunken px-3 py-2.5">
                    <dt className="text-[12px] text-text-subtle">Programme time</dt>
                    <dd className="tabular mt-1 text-[18px] font-semibold tracking-[-0.03em]">
                      {formatDuration(programmeSeconds)}
                    </dd>
                  </div>
                </dl>
              </div>

              <Button className="mt-4 w-full" variant="primary" onClick={() => save(true)}>
                {draft.status === "live" ? "Return to control" : "Start event"}
              </Button>
            </Card>
          </aside>

          <div className="grid min-w-0 gap-3 lg:col-start-1 lg:row-start-1">
            <AgendaEditor
              defaultValues={initialAgenda}
              onChange={(values) => {
                hideSaveNotice();
                setAgenda(values);
              }}
              showSummary={false}
            />

            {showErrors && !agendaResult.success && (
              <p role="alert" className="text-[12px] font-medium text-over">
                Fix the highlighted agenda problems before starting the event.
              </p>
            )}
          </div>
        </div>
      </div>

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={cn(
          "pointer-events-none fixed right-5 bottom-5 z-50 flex max-w-[calc(100%-2.5rem)] items-center gap-2.5 rounded-card border border-success/20 bg-white px-4 py-3 text-[13px] font-semibold text-ink shadow-[0_16px_40px_rgba(20,16,38,0.16)]",
          "transition-[opacity,transform] duration-300 ease-[var(--ease-out-quart)]",
          saveNoticeVisible
            ? "translate-y-0 opacity-100"
            : "translate-y-2 opacity-0",
        )}
      >
        {saveNoticeVisible && (
          <>
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-success-soft text-success">
              <CircleCheck size={16} aria-hidden />
            </span>
            Changes saved successfully
          </>
        )}
      </div>
    </main>
  );
}
