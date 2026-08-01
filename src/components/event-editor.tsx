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
import {
  CredentialsFields,
  EMPTY_CREDENTIALS,
  credentialsProblem,
  type CredentialsDraft,
} from "@/components/event-access/credentials-fields";
import { ControllerSignInGate } from "@/components/event-access/controller-sign-in-gate";
import { SaveStatusBadge } from "@/components/event-access/save-status-badge";
import type { MaterialTextFieldElement } from "@/components/material-outlined-field";
import { formatDuration } from "@/lib/format";
import { makeEvent } from "@/lib/store";
import { useControllerEvent } from "@/lib/controller/use-controller-event";
import { createControllerEvent } from "@/lib/event-auth/client";
import { rememberEvent } from "@/lib/event-auth/local-events";
import { agendaFormSchema, type AgendaFormValues } from "@/lib/agenda-schema";
import { toAgendaItems, toFormValues } from "@/lib/agenda-mapping";
import type { TimerEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

function editorSnapshot(name: string, date: string, agenda: AgendaFormValues) {
  return JSON.stringify({ name, date, agendaItems: agenda.agendaItems });
}

const EMPTY_AGENDA: AgendaFormValues = { agendaItems: [] };

/*
 * A new event is not saved anywhere until it has credentials, so the builder ends
 * with a password. The event name itself is the sign-in identifier.
 */
type Stage = "editing" | "credentials";

export function EventEditor() {
  const params = useParams<{ eventId?: string }>();
  const router = useRouter();
  const eventId = params.eventId;
  const isEditing = Boolean(eventId);

  /*
   * One event, addressed by its own id. There is no workspace to load and no team
   * to belong to; a builder with no id in the URL is simply working on a draft
   * that does not exist on the server yet.
   */
  const controller = useControllerEvent(eventId ?? "");
  const existing = isEditing ? controller.event : null;

  const [draft, setDraft] = useState<TimerEvent | null>(null);
  const [agenda, setAgenda] = useState<AgendaFormValues | null>(null);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [saveNoticeVisible, setSaveNoticeVisible] = useState(false);
  const [saveNoticeArmed, setSaveNoticeArmed] = useState(false);
  const [stage, setStage] = useState<Stage>("editing");
  const [credentials, setCredentials] = useState<CredentialsDraft>(EMPTY_CREDENTIALS);
  const [credentialsTouched, setCredentialsTouched] = useState(false);
  /** Whether the create step should also start the event once it exists. */
  const [pendingStart, setPendingStart] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const nameField = useRef<MaterialTextFieldElement>(null);
  const saveNoticeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (eventId && (!existing || hydratedId === eventId)) return;
    if (!eventId && hydratedId === "new") return;

    queueMicrotask(() => {
      const storedDraft = existing ? structuredClone(existing) : makeEvent("New event");
      const storedAgenda = toFormValues(storedDraft.agenda);
      setDraft(storedDraft);
      setAgenda(storedAgenda);
      setSavedSnapshot(editorSnapshot(storedDraft.name, storedDraft.date, storedAgenda));
      setHydratedId(eventId ?? "new");
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
    () => agenda ?? (draft ? toFormValues(draft.agenda) : EMPTY_AGENDA),
    [agenda, draft],
  );
  const currentSnapshot = useMemo(
    () => (draft ? editorSnapshot(draft.name, draft.date, currentAgenda) : null),
    [draft, currentAgenda],
  );
  const hasUnsavedChanges =
    savedSnapshot !== null && currentSnapshot !== null && currentSnapshot !== savedSnapshot;

  const nameError = draft?.name.trim() ? "" : "Give the event a name before saving.";
  const agendaResult = agendaFormSchema.safeParse(currentAgenda);

  function hideSaveNotice() {
    setSaveNoticeArmed(false);
    setSaveNoticeVisible(false);
    if (saveNoticeTimer.current !== null) {
      window.clearTimeout(saveNoticeTimer.current);
      saveNoticeTimer.current = null;
    }
  }

  /*
   * Arms the confirmation rather than showing it. "Changes saved" is a claim
   * about the cloud, so it waits for the save coordinator to report that the
   * durable write actually landed.
   */
  function showSaveNotice() {
    setSaveNoticeArmed(true);
  }

  useEffect(() => {
    if (!saveNoticeArmed || controller.saveState !== "saved") return;
    queueMicrotask(() => {
      setSaveNoticeArmed(false);
      setSaveNoticeVisible(true);
      if (saveNoticeTimer.current !== null) window.clearTimeout(saveNoticeTimer.current);
      saveNoticeTimer.current = window.setTimeout(() => {
        setSaveNoticeVisible(false);
        saveNoticeTimer.current = null;
      }, 3200);
    });
  }, [saveNoticeArmed, controller.saveState]);

  /**
   * The event as the editor's fields currently describe it. Shared by the save
   * path and the create path so the two cannot drift.
   */
  function buildNext(start: boolean): TimerEvent | null {
    if (!draft) return null;
    if (nameError) {
      setShowErrors(true);
      nameField.current?.focus();
      return null;
    }
    if (!agendaResult.success) {
      setShowErrors(true);
      return null;
    }

    const nextAgenda = toAgendaItems(currentAgenda, draft.agenda);
    const first = nextAgenda[0];
    const firstDuration =
      first.kind === "panel"
        ? first.speakers[0]?.durationSeconds ?? first.speakerDefaultSeconds ?? 300
        : first.durationSeconds;
    const shouldResetRuntime = !existing || (start && draft.status !== "live");

    return {
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
  }

  function adoptSaved(next: TimerEvent) {
    const savedAgenda = toFormValues(next.agenda);
    setDraft(next);
    setAgenda(savedAgenda);
    setSavedSnapshot(editorSnapshot(next.name, next.date, savedAgenda));
    setShowErrors(false);
  }

  function save(start = false) {
    const next = buildNext(start);
    if (!next) return;

    /*
     * A brand new event has nowhere to be saved yet. It needs the controller
     * credentials that will own it, so the builder hands over to that step rather
     * than writing an event only this browser would ever be able to see.
     */
    if (!isEditing) {
      setPendingStart(start);
      setStage("credentials");
      setCreateError("");
      setCredentialsTouched(false);
      return;
    }

    controller.update(() => next);
    adoptSaved(next);

    if (!start) {
      showSaveNotice();
      return;
    }

    router.push(`/events/${next.id}`);
  }

  function handlePrimaryAction() {
    if (!draft) return;

    /*
     * "Return to control" is navigation, not a second save action. Keeping it
     * independent means an unfinished edit cannot silently block both return
     * buttons; Save changes remains the explicit way to persist editor data.
     */
    if (draft.status === "live") {
      router.push(`/events/${draft.id}`);
      return;
    }

    save(true);
  }

  /** Creates the event, its password and this device's session at once. */
  async function createEvent(start: boolean) {
    const next = buildNext(start);
    if (!next) return;

    setCredentialsTouched(true);
    const problem = credentialsProblem(credentials);
    if (problem) {
      setCreateError(problem);
      return;
    }

    setCreating(true);
    setCreateError("");
    const result = await createControllerEvent({
      password: credentials.password,
      event: next,
    });
    setCreating(false);

    if (!result.ok) {
      setCreateError(result.message);
      return;
    }

    rememberEvent({
      eventId: result.data.event.id,
      name: result.data.event.name,
    });
    // The credentials leave memory the moment they are no longer needed.
    setCredentials(EMPTY_CREDENTIALS);
    adoptSaved(result.data.event);
    router.push(start ? `/events/${result.data.event.id}` : "/");
  }

  const programmeSeconds = currentAgenda.agendaItems.reduce(
    (sum, item) => sum + item.durationMinutes * 60,
    0,
  );

  /*
   * The password step replaces the builder rather than floating over it. A new
   * event does not exist until its password and first session are created.
   */
  if (stage !== "editing" && draft) {
    return (
      <main className="min-h-svh bg-paper" id="main">
        <AppHeader />
        <div className="mx-auto w-[min(560px,calc(100%-2.5rem))] pt-12 pb-24">
          <Card className="grid gap-5 p-5">
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3"
                  onClick={() => setStage("editing")}
                  disabled={creating}
                >
                  <ArrowLeft size={15} aria-hidden />
                  Back to the run of show
                </Button>
                <h1 className="mt-3 text-[24px] font-semibold tracking-[-0.04em]">
                  Set a password for {draft.name.trim() || "this event"}
                </h1>
                <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
                  On another device, enter the event name and this password to run the same event.
                </p>
              </div>

              <CredentialsFields
                draft={credentials}
                onChange={setCredentials}
                showErrors={credentialsTouched}
                disabled={creating}
              />

              <div aria-live="polite">
                {createError && (
                  <p className="flex items-center gap-1.5 text-[12px] font-medium text-over">
                    <AlertCircle size={12} aria-hidden />
                    {createError}
                  </p>
                )}
              </div>

              <Button
                variant="primary"
                disabled={creating}
                onClick={() => void createEvent(pendingStart)}
              >
                {creating
                  ? "Creating the event…"
                  : pendingStart
                    ? "Create and start the event"
                    : "Create the event"}
              </Button>
          </Card>
        </div>
      </main>
    );
  }

  /*
   * The editor's generated ids must never be created during server rendering:
   * the server and browser would produce different UUIDs, which would also
   * change field ids and dnd-kit's accessibility attributes during hydration.
   */
  if (!draft || !agenda) {
    /*
     * Nothing to edit, and no session that could open it. The same screen for an
     * event that was deleted, one belonging to somebody else, and an id somebody
     * guessed — the address bar is not a way to discover events.
     */
    if (isEditing && controller.status === "authorization-required") {
      return (
        <ControllerSignInGate
          eventId={eventId ?? ""}
          hasUnsavedWork={controller.hasUnsavedWork()}
          onResumed={() => void controller.resumeAfterSignIn()}
        />
      );
    }
    if (isEditing && controller.status === "not-found") {
      return (
        <main className="grid min-h-svh place-items-center p-8 text-center text-text-muted" id="main">
          <div>
            <h1 className="mb-2.5 text-[26px] font-semibold tracking-[-0.04em] text-ink">
              We couldn&apos;t find that event
            </h1>
            <p className="mb-5 text-[13px]">
              Sign in with the event name and password to open it.
            </p>
            <Button variant="primary" onClick={() => router.push("/")}>
              Open an event
            </Button>
          </div>
        </main>
      );
    }
    return (
      <main className="min-h-svh bg-paper" id="main">
        <AppHeader />
        <div
          className="mx-auto grid w-[min(1040px,calc(100%-2.5rem))] gap-5 pt-9"
          aria-busy="true"
          aria-label="Loading event editor"
        >
          <div className="h-24 animate-pulse rounded-panel bg-surface-sunken" />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
            <div className="h-80 animate-pulse rounded-panel bg-surface-sunken" />
            <div className="h-64 animate-pulse rounded-panel bg-surface-sunken" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-svh bg-paper" id="main">
      <AppHeader />

      <div className="mx-auto w-[min(1040px,calc(100%-2.5rem))] pt-9 pb-24">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
          <div>
            <Button variant="ghost" size="sm" className="-ml-3" onClick={() => router.push("/")}>
              <ArrowLeft size={15} aria-hidden />
              Home
            </Button>
            <h1 className="mt-4 text-[clamp(2rem,4vw,2.6rem)] leading-tight font-semibold tracking-[-0.05em]">
              {isEditing ? "Edit event" : "New event"}
            </h1>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2">
              {isEditing && (
                <SaveStatusBadge state={controller.saveState} onRetry={controller.retrySave} />
              )}
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
                {isEditing ? "Save changes" : "Save event"}
              </Button>
            </div>
            <Button variant="primary" onClick={handlePrimaryAction}>
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
              <h2 className="text-[18px] font-semibold tracking-[-0.025em]">Event details</h2>

              <div className="mt-4 grid gap-4">
                <div className="min-w-0">
                  <Input
                    id="event-name"
                    ref={nameField}
                    label="Event name"
                    placeholder="Annual Leadership Summit"
                    value={draft.name}
                    aria-invalid={showErrors && Boolean(nameError)}
                    aria-describedby={showErrors && nameError ? "event-name-error" : undefined}
                    onValueChange={(name) => {
                      hideSaveNotice();
                      setDraft({ ...draft, name });
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

              <div className="mt-5 border-t border-line-soft pt-4">
                <h3 className="text-[13px] font-semibold text-text-muted">Programme summary</h3>
                <dl className="mt-3 grid grid-cols-2 gap-2" aria-live="polite">
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

              <Button className="mt-4 w-full" variant="primary" onClick={handlePrimaryAction}>
                {draft.status === "live" ? "Return to control" : "Start event"}
              </Button>
            </Card>
          </aside>

          <div className="grid min-w-0 gap-3 lg:col-start-1 lg:row-start-1">
            <AgendaEditor
              defaultValues={agenda}
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
          saveNoticeVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
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
