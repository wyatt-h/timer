"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, LocateFixed, RotateCcw, X } from "lucide-react";
import { LiveConsole } from "@/components/control-room";
import { AgendaEditor } from "@/components/agenda/agenda-editor";
import { Button } from "@/components/ui/button";
import { advancePractice, makePracticeEvent, practiceSteps } from "@/lib/guide-practice";
import { flattenSegments, formatTimer } from "@/lib/format";
import { toAgendaItems, toFormValues } from "@/lib/agenda-mapping";
import { agendaFormSchema, type AgendaFormValues } from "@/lib/agenda-schema";
import { readTimerClock } from "@/lib/timer-clock";
import type { TimerEvent } from "@/lib/types";

const noop = () => {};
const localOnly = async () => ({ ok: false, message: "Practice stays in this tab." });

export function PracticeEvent({ mode = "run" }: { mode?: string }) {
  const [state, setState] = useState(() => ({ event: makePracticeEvent(mode === "panel"), step: 0, session: 0 }));
  const [editing, setEditing] = useState(mode === "build");
  const [values, setValues] = useState<AgendaFormValues>(() => toFormValues(state.event.agenda));
  const [error, setError] = useState("");
  const [skipped, setSkipped] = useState(false);
  const [preview, setPreview] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [display, setDisplay] = useState(300);
  const step = practiceSteps[state.step];

  useEffect(() => {
    if (!step || skipped || editing) return;
    const target = document.querySelector<HTMLElement>(`[data-help="${step.target}"]`);
    target?.setAttribute("data-practice-highlight", "true");
    return () => target?.removeAttribute("data-practice-highlight");
  }, [step, skipped, editing, state.session]);

  useEffect(() => {
    if (!preview) return;
    dialog.current?.showModal();
    const tick = () => setDisplay(readTimerClock(state.event.runtime.status, state.event.runtime.endsAt, state.event.runtime.remainingSeconds).remainingSeconds);
    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [preview, state.event.runtime]);

  function update(updater: (current: TimerEvent) => TimerEvent) {
    setState(current => {
      const event = updater(current.event);
      return { ...current, event, step: advancePractice(current.step, current.event, event) };
    });
  }

  function restart(panel: boolean) {
    setState(current => ({ event: makePracticeEvent(panel), step: 0, session: current.session + 1 }));
    setSkipped(false);
    setEditing(false);
  }

  function startEdited() {
    const parsed = agendaFormSchema.safeParse(values);
    if (!parsed.success || !values.agendaItems.length) {
      setError("Add at least one speaker and fix the highlighted agenda fields before practising.");
      return;
    }
    const agenda = toAgendaItems(values, state.event.agenda);
    const first = agenda[0];
    setState(current => ({ ...current, session: current.session + 1, step: 0, event: { ...makePracticeEvent(), agenda, runtime: { status: "ready", segmentIndex: 0, remainingSeconds: first.speakers[0].durationSeconds, endsAt: null, panelStatus: first.kind === "panel" ? "ready" : null, panelRemainingSeconds: first.kind === "panel" ? first.durationSeconds : null, panelEndsAt: null, updatedAt: 0 } } }));
    setSkipped(false);
    setEditing(false);
    setError("");
  }

  return <>
    <section aria-label="Practice lesson" className="border-b border-violet/20 bg-violet-soft px-4 py-5 sm:px-6">
      <div className="mx-auto flex max-w-[1380px] flex-wrap items-start justify-between gap-4">
        <div className="max-w-[680px]">
          <Link href="/guide" className="text-[12px] font-semibold text-violet-dark underline">All lessons</Link>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight">{editing ? "Build a practice agenda" : "Learn with a practice event"}</h1>
          <p className="mt-1 text-[13px] text-text-muted">Real controls, sample data. Changes stay in this tab and reset when you reload.</p>
          {editing && <p className="mt-3 text-[13px]">Add a speaker or panel, change durations, and drag the handles to reorder. Then select Save & practise to use this agenda locally.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => restart(false)}><RotateCcw size={14} aria-hidden />Replay lesson</Button>
          <Button size="sm" onClick={() => restart(true)}>Try a panel</Button>
        </div>
      </div>
    </section>
    {!editing && !skipped && <section aria-label="Current practice instruction" className="sticky top-0 z-40 border-b border-violet/20 bg-white px-4 py-3 shadow-sm sm:px-6">
      <div className="mx-auto flex max-w-[1380px] flex-wrap items-center justify-between gap-3">
        <div className="max-w-[760px]" aria-live="polite">
          <p className="text-[12px] font-semibold text-violet-dark">{step ? `Step ${state.step + 1} of ${practiceSteps.length}` : "Lesson complete"}</p>
          <h2 className="mt-1 text-[16px] font-semibold">{step?.title ?? "You’re ready to practise freely"}</h2>
          <p className="mt-1 text-[13px] leading-relaxed">{step?.text ?? "Try a panel, preview the speaker display, or replay the lesson."}</p>
        </div>
        <div className="flex flex-wrap gap-2">{!editing && step && !skipped && <Button size="sm" onClick={() => document.querySelector(`[data-help="${step.target}"]`)?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}><LocateFixed size={14} aria-hidden />Show me where</Button>}
          {!editing && !skipped && step && <Button size="sm" variant="ghost" onClick={() => setSkipped(true)}>Skip guidance</Button>}</div>
      </div>
    </section>}
    {editing ? <main className="mx-auto max-w-[1040px] px-5 py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-[20px] font-semibold">Friday showcase · practice</h2><Button variant="primary" onClick={startEdited}><Check size={15} aria-hidden />Save & practise</Button></div>
      {error && <p role="alert" className="mb-4 text-[13px] text-over">{error}</p>}
      <AgendaEditor key={state.session} defaultValues={values} onChange={setValues} />
    </main> : <LiveConsole key={state.session} event={state.event} loginName="practice-only" segments={flattenSegments(state.event)} update={update} saveState="idle" onRetrySave={noop} onDiscardLocal={localOnly} onKeepLocal={localOnly} onFlushSaves={noop} onDelete={localOnly} onSignOut={localOnly} conflictResolution={null} practice={{ onOpenSpeaker: () => setPreview(true), onEdit: () => { setValues(toFormValues(state.event.agenda)); setEditing(true); } }} />}
    {preview && <dialog ref={dialog} className="m-auto w-[min(640px,calc(100vw-2rem))] rounded-panel border border-line bg-[#0c0c10] p-6 text-white backdrop:bg-black/50" aria-labelledby="practice-speaker-title" onCancel={() => setPreview(false)}>
      <div className="flex items-center justify-between gap-3"><h2 id="practice-speaker-title" className="text-[15px]">Speaker preview · sample event</h2><Button aria-label="Close speaker preview" size="iconSm" onClick={() => { dialog.current?.close(); setPreview(false); }}><X size={15} /></Button></div>
      <p className="mt-10 text-center text-[20px]">{flattenSegments(state.event)[state.event.runtime.segmentIndex]?.speaker}</p>
      <p className="my-8 text-center font-mono text-[clamp(48px,12vw,100px)] tabular-nums" role="timer">{formatTimer(display)}</p>
      <p className="text-center text-[13px] text-white/70">Read-only preview. A real speaker link opens this event’s display on another device.</p>
    </dialog>}
  </>;
}
