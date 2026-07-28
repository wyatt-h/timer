"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft } from "lucide-react";
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
  const nameField = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(eventId);

  useEffect(() => {
    if (!eventId || !existing || hydratedId === eventId) return;
    queueMicrotask(() => {
      setDraft(structuredClone(existing));
      setAgenda(toFormValues(existing.agenda));
      setHydratedId(eventId);
    });
  }, [eventId, existing, hydratedId]);

  /*
   * The agenda editor owns its own form state; this holds the last value it
   * reported so the page can save it. Until the editor reports anything, the
   * seed from the stored event stands in.
   */
  const currentAgenda = useMemo(
    () => agenda ?? toFormValues(draft.agenda),
    [agenda, draft.agenda],
  );

  /* Mounting the editor with a changing key would reset it mid-edit, so the
     initial values are captured once per hydrated event. */
  const initialAgenda = useMemo(
    () => toFormValues(existing?.agenda ?? draft.agenda),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hydratedId],
  );

  const nameError = draft.name.trim() ? "" : "Give the event a name before saving.";
  const agendaResult = agendaFormSchema.safeParse(currentAgenda);

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

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => save(false)}>
              Save changes
            </Button>
            <Button variant="primary" onClick={() => save(true)}>
              {draft.status === "live" ? "Return to control" : "Start event"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4">
          <Card className="p-5">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
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
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
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
                    onChange={(date) => setDraft({ ...draft, date })}
                  />
                </div>
              </div>
            </div>
          </Card>

          <AgendaEditor defaultValues={initialAgenda} onChange={setAgenda} />

          <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
              <div className="flex items-baseline gap-2">
                <dt className="text-text-subtle">Agenda items</dt>
                <dd className="tabular font-semibold">{currentAgenda.agendaItems.length}</dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="text-text-subtle">Programme time</dt>
                <dd className="tabular font-semibold">{formatDuration(programmeSeconds)}</dd>
              </div>
            </dl>
            <Button variant="primary" onClick={() => save(true)}>
              {draft.status === "live" ? "Return to control" : "Start event"}
            </Button>
          </Card>

          {showErrors && !agendaResult.success && (
            <p role="alert" className="text-[12px] font-medium text-over">
              Fix the highlighted agenda problems before starting the event.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
