"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  Columns2,
  Copy,
  FastForward,
  Focus,
  GripVertical,
  Keyboard,
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
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DurationInput } from "@/components/duration-input";
import { LiveClock } from "@/components/live-clock";
import { SortableList } from "@/components/sortable-list";
import { Input } from "@/components/ui/input";
import {
  MaterialOutlinedDurationField,
  MaterialOutlinedField,
} from "@/components/material-outlined-field";
import {
  describeTimer,
  elapsedRatio,
  flattenSegments,
  formatClockTime,
  formatDuration,
  formatTimer,
  isPanelMuted,
  isSoundEnabled,
  isSpeakerMuted,
  itemLabel,
  panelLabel,
  timerTone,
} from "@/lib/format";
import { makeAgendaItem, useWorkspace } from "@/lib/store";
import { useShortcuts, useThrottledAnnouncement } from "@/lib/use-shortcuts";
import { formatZoomToken, makeZoomToken } from "@/lib/zoom/token";
import type { AgendaItem, TimerEvent, RuntimeState, Speaker, TimerSegment } from "@/lib/types";

/** Countdowns keep running past zero, so nothing here is clamped. */
function remainingNow(
  status: RuntimeState["status"] | undefined,
  endsAt: number | null | undefined,
  fallback: number | null | undefined,
  now = Date.now(),
) {
  if (status === "running" && endsAt) return (endsAt - now) / 1000;
  return fallback ?? 0;
}

export function panelistTimingIsLocked(
  flatSpeakerIndex: number,
  currentSegmentIndex: number,
) {
  return flatSpeakerIndex <= currentSegmentIndex;
}

export function speakerPatchForItem(
  item: AgendaItem,
  speakerId: string,
  patch: Partial<Speaker>,
): Partial<AgendaItem> {
  return {
    speakers: item.speakers.map((speaker) =>
      speaker.id === speakerId ? { ...speaker, ...patch } : speaker,
    ),
    ...(item.kind === "single" && typeof patch.durationSeconds === "number"
      ? { durationSeconds: patch.durationSeconds }
      : {}),
  };
}

function DurationReadout({
  seconds,
  label,
}: {
  seconds: number;
  label: string;
}) {
  return (
    <span
      aria-label={label}
      className="tabular inline-flex h-12 w-[118px] shrink-0 items-center justify-between rounded-field border border-line-soft bg-surface-sunken px-3 text-[13px] text-ink"
    >
      <span>{Math.round(seconds / 60)}</span>
      <span className="text-[12px] text-text-subtle">min</span>
    </span>
  );
}

export function speakerTimerTogglePatch({
  runtime,
  speakerDuration,
  panelDuration,
  isPanel,
  now = Date.now(),
}: {
  runtime: RuntimeState;
  speakerDuration: number;
  panelDuration: number;
  isPanel: boolean;
  now?: number;
}): Partial<RuntimeState> {
  if (runtime.status === "running") {
    return {
      status: "paused",
      remainingSeconds: remainingNow(
        runtime.status,
        runtime.endsAt,
        runtime.remainingSeconds,
        now,
      ),
      endsAt: null,
    };
  }

  const speakerSeconds =
    runtime.status === "ended" ? speakerDuration : runtime.remainingSeconds;
  const patch: Partial<RuntimeState> = {
    status: "running",
    remainingSeconds: speakerSeconds,
    endsAt: now + speakerSeconds * 1000,
  };

  if (isPanel && runtime.panelStatus !== "running") {
    const panelSeconds =
      runtime.panelStatus === "ended"
        ? panelDuration
        : runtime.panelRemainingSeconds ?? panelDuration;
    patch.panelStatus = "running";
    patch.panelRemainingSeconds = panelSeconds;
    patch.panelEndsAt = now + panelSeconds * 1000;
  }

  return patch;
}

export function panelTimerTogglePatch({
  runtime,
  panelDuration,
  now = Date.now(),
}: {
  runtime: RuntimeState;
  panelDuration: number;
  now?: number;
}): Partial<RuntimeState> {
  const panelStatus = runtime.panelStatus ?? "ready";
  if (panelStatus === "running") {
    const patch: Partial<RuntimeState> = {
      panelStatus: "paused",
      panelRemainingSeconds: remainingNow(
        panelStatus,
        runtime.panelEndsAt,
        runtime.panelRemainingSeconds ?? panelDuration,
        now,
      ),
      panelEndsAt: null,
    };

    if (runtime.status === "running") {
      patch.status = "paused";
      patch.remainingSeconds = remainingNow(
        runtime.status,
        runtime.endsAt,
        runtime.remainingSeconds,
        now,
      );
      patch.endsAt = null;
    }

    return patch;
  }

  const panelSeconds =
    panelStatus === "ended"
      ? panelDuration
      : runtime.panelRemainingSeconds ?? panelDuration;
  return {
    panelStatus: "running",
    panelRemainingSeconds: panelSeconds,
    panelEndsAt: now + panelSeconds * 1000,
  };
}

const SHORTCUT_HELP = [
  { keys: "Space", action: "Start or pause the speaker timer" },
  { keys: "P", action: "Start or pause the panel timer" },
  { keys: "→ or N", action: "Move to the next part (starts paused)" },
  { keys: "← or B", action: "Go back one part" },
  { keys: "R", action: "Reset the current timer" },
  { keys: "↑ ↓", action: "Add or remove fifteen seconds for the speaker" },
  { keys: "[ ]", action: "Add or remove fifteen seconds from the panel total" },
  { keys: "S", action: "Skip the rest of a panel" },
  { keys: "M", action: "Mute or unmute audience displays" },
  { keys: "F", action: "Toggle focus mode (timer only)" },
  { keys: "?", action: "Show or hide this list" },
];

export function ControlRoom() {
  const params = useParams<{ team: string; eventId: string }>();
  const router = useRouter();
  const { workspace, update } = useWorkspace(params.team);
  const event = workspace?.events.find((candidate) => candidate.id === params.eventId);
  const segments = useMemo(() => (event ? flattenSegments(event) : []), [event]);

  if (!workspace) {
    return (
      <main className="min-h-svh bg-[radial-gradient(circle_at_9%_0%,rgba(119,87,237,0.1),transparent_22%),#f5f5f7] px-3 pb-8 sm:px-5">
        <div aria-busy="true" aria-label="Loading the control room" className="mx-auto mt-24 grid w-[min(1420px,100%)] grid-cols-[380px_minmax(0,1fr)] gap-4 max-md:grid-cols-1">
          <div className="h-[520px] rounded-panel bg-[linear-gradient(100deg,#efeff1_30%,#f7f7f9_50%,#efeff1_70%)] bg-[length:220%_100%] motion-safe:animate-pulse" />
          <div className="h-[520px] rounded-panel bg-[linear-gradient(100deg,#efeff1_30%,#f7f7f9_50%,#efeff1_70%)] bg-[length:220%_100%] motion-safe:animate-pulse max-md:hidden" />
        </div>
      </main>
    );
  }

  if (!event || !event.runtime || !segments.length) {
    return (
      <main className="grid min-h-svh place-items-center p-8 text-center text-text-muted">
        <div>
          <h1 className="mb-2.5 text-[26px] font-semibold tracking-[-0.04em] text-ink">We couldn&apos;t find that event</h1>
          <p className="mb-5 text-[13px]">It may have been deleted, or the link points at a different workspace.</p>
          <button className="inline-flex min-h-11 items-center gap-2 rounded-control bg-violet px-4 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-violet-dark" onClick={() => router.push(`/t/${params.team}`)}>
            Return to events
          </button>
        </div>
      </main>
    );
  }

  return (
    <LiveConsole
      key={event.id}
      team={params.team}
      event={event}
      segments={segments}
      update={update}
    />
  );
}

type LiveConsoleProps = {
  team: string;
  event: TimerEvent;
  segments: TimerSegment[];
  update: ReturnType<typeof useWorkspace>["update"];
};

function LiveConsole({ team, event, segments, update }: LiveConsoleProps) {
  const runtime = event.runtime;
  const [displaySeconds, setDisplaySeconds] = useState(runtime.remainingSeconds);
  const [panelDisplaySeconds, setPanelDisplaySeconds] = useState(
    runtime.panelRemainingSeconds ?? 0,
  );
  const [copied, setCopied] = useState(false);
  const [zoomCopied, setZoomCopied] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [projectedFinish, setProjectedFinish] = useState<number | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  const segmentIndex = Math.min(runtime.segmentIndex, segments.length - 1);
  const current = segments[segmentIndex];
  const currentAgendaIndex = Math.max(
    0,
    event.agenda.findIndex((item) => item.id === current.agendaItemId),
  );
  const currentItem = event.agenda[currentAgendaIndex];
  const isPanel = currentItem.kind === "panel";
  const previousPart = segments[segmentIndex - 1];
  const nextPart = segments[segmentIndex + 1];
  /*
   * A short lookahead over agenda items, not segments: a panel appears once
   * as a whole topic rather than once per panelist. Shown only in focus
   * mode, where the run of show is hidden and this is the operator's only
   * view of what is next.
   */
  const upcomingItems = event.agenda.slice(currentAgendaIndex + 1, currentAgendaIndex + 4);

  /*
   * The first segment belonging to the next agenda item. Advancing one part
   * at a time walks through every panelist; this jumps the whole panel when
   * a session is cut short or runs long.
   */
  const nextItem = event.agenda[currentAgendaIndex + 1];
  const nextItemSegmentIndex = nextItem
    ? segments.findIndex((segment) => segment.agendaItemId === nextItem.id)
    : -1;
  const viewerPath = `/live/${event.viewerToken}`;
  const isEnded = runtime.status === "ended" || event.status === "completed";
  const isRunning = runtime.status === "running";
  const isPanelRunning = runtime.panelStatus === "running";

  /**
   * The two numbers an operator actually needs: how much programme is left,
   * and the wall-clock time the event lands on if nothing else changes.
   */
  const remainingProgramSeconds =
    displaySeconds +
    segments.slice(segmentIndex + 1).reduce((sum, segment) => sum + segment.durationSeconds, 0);

  useEffect(() => {
    const tick = () => {
      setDisplaySeconds(remainingNow(runtime.status, runtime.endsAt, runtime.remainingSeconds));
      setPanelDisplaySeconds(
        remainingNow(
          runtime.panelStatus ?? undefined,
          runtime.panelEndsAt,
          runtime.panelRemainingSeconds ?? (isPanel ? currentItem.durationSeconds : 0),
        ),
      );
    };
    queueMicrotask(tick);
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [currentItem.durationSeconds, isPanel, runtime]);

  /*
   * Read the remaining programme through a ref: it changes on every tick, and
   * as a dependency it would tear down and rebuild this interval five times a
   * second.
   */
  const latestRemaining = useRef(remainingProgramSeconds);
  useLayoutEffect(() => {
    latestRemaining.current = remainingProgramSeconds;
  });

  useEffect(() => {
    const project = () =>
      setProjectedFinish(Date.now() + Math.max(0, latestRemaining.current) * 1000);
    project();
    const interval = window.setInterval(project, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const speakerTone = timerTone(displaySeconds, current.durationSeconds);
  const panelTone = timerTone(panelDisplaySeconds, currentItem.durationSeconds);
  const speakerProgress = elapsedRatio(displaySeconds, current.durationSeconds);
  const panelProgress = elapsedRatio(panelDisplaySeconds, currentItem.durationSeconds);

  const announcement = useThrottledAnnouncement(
    `${current.speaker}. ${describeTimer(displaySeconds)}.`,
  );

  function mutateEvent(updater: (current: TimerEvent) => TimerEvent) {
    update((currentWorkspace) => ({
      ...currentWorkspace,
      events: currentWorkspace.events.map((candidate) =>
        candidate.id === event.id ? updater(candidate) : candidate,
      ),
    }));
  }

  function setRuntime(patch: Partial<RuntimeState>, eventPatch?: Partial<TimerEvent>) {
    mutateEvent((currentEvent) => ({
      ...currentEvent,
      ...eventPatch,
      runtime: { ...currentEvent.runtime, ...patch, updatedAt: Date.now() },
    }));
  }

  function toggleSpeakerTimer() {
    setRuntime(
      speakerTimerTogglePatch({
        runtime,
        speakerDuration: current.durationSeconds,
        panelDuration: currentItem.durationSeconds,
        isPanel,
      }),
      runtime.status === "running" ? undefined : { status: "live" },
    );
  }

  function togglePanelTimer() {
    setRuntime(
      panelTimerTogglePatch({
        runtime,
        panelDuration: currentItem.durationSeconds,
      }),
      runtime.panelStatus === "running" ? undefined : { status: "live" },
    );
  }

  /**
   * Move to another part. The speaker timer always lands paused so the
   * operator decides when the next person actually begins, but a panel total
   * that is already running keeps running — the room's overall clock does not
   * stop just because the microphone changed hands.
   */
  function handleJumpTo(targetIndex: number) {
    const safeIndex = Math.max(0, Math.min(segments.length - 1, targetIndex));
    const target = segments[safeIndex];
    const targetItem = event.agenda.find((item) => item.id === target.agendaItemId);
    if (!targetItem) return;
    const stayingInPanel = targetItem.id === currentItem.id && targetItem.kind === "panel";

    setRuntime({
      status: "paused",
      segmentIndex: safeIndex,
      remainingSeconds: target.durationSeconds,
      endsAt: null,
      panelStatus:
        targetItem.kind !== "panel"
          ? null
          : stayingInPanel
            ? runtime.panelStatus ?? "ready"
            : "ready",
      panelRemainingSeconds:
        targetItem.kind !== "panel"
          ? null
          : stayingInPanel
            ? remainingNow(
                runtime.panelStatus ?? undefined,
                runtime.panelEndsAt,
                runtime.panelRemainingSeconds ?? currentItem.durationSeconds,
              )
            : targetItem.durationSeconds,
      panelEndsAt:
        targetItem.kind === "panel" && stayingInPanel ? runtime.panelEndsAt ?? null : null,
    });
  }

  function adjust(seconds: number, panel = false) {
    if (panel) {
      const adjusted =
        remainingNow(
          runtime.panelStatus ?? undefined,
          runtime.panelEndsAt,
          runtime.panelRemainingSeconds,
        ) + seconds;
      setRuntime({
        panelRemainingSeconds: adjusted,
        panelEndsAt: runtime.panelStatus === "running" ? Date.now() + adjusted * 1000 : null,
      });
    } else {
      const adjusted =
        remainingNow(runtime.status, runtime.endsAt, runtime.remainingSeconds) + seconds;
      setRuntime({
        remainingSeconds: adjusted,
        endsAt: runtime.status === "running" ? Date.now() + adjusted * 1000 : null,
      });
    }
  }

  /**
   * Timing becomes historical as soon as a panelist reaches the stage. Only
   * not-yet-speaking panelists can have their allocation changed.
   */
  function updatePanelistDuration(item: AgendaItem, speakerId: string, durationSeconds: number) {
    const flatIndex = segments.findIndex((segment) => segment.id === speakerId);
    if (panelistTimingIsLocked(flatIndex, segmentIndex)) return;
    patchSpeaker(item, speakerId, { durationSeconds });
  }

  /*
   * Mute state is stored on the event, so the audience display — which is a
   * separate browser on a separate machine — honours the same setting.
   */
  const currentSpeaker = currentItem.speakers.find((speaker) => speaker.id === current.id);
  const speakerMuted = isSpeakerMuted(currentSpeaker);
  const panelMuted = isPanelMuted(currentItem);

  function toggleSpeakerMute() {
    if (!currentSpeaker) return;
    patchSpeaker(currentItem, currentSpeaker.id, { soundMuted: !speakerMuted });
  }

  /*
   * The master switch for every audience display. It rides along with the
   * rest of the runtime state, so screens pick it up through the same
   * broadcast that carries the clock.
   */
  const soundEnabled = isSoundEnabled(runtime);

  function toggleSound() {
    setRuntime({ soundEnabled: !soundEnabled });
  }

  function togglePanelMute() {
    patchAgendaItem(currentItem.id, { soundMuted: !panelMuted });
  }

  const adjustSpeaker = (seconds: number) => adjust(seconds, false);
  const adjustPanel = (seconds: number) => adjust(seconds, true);

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
    setConfirmingEnd(false);
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
    const firstItem = event.agenda[0];
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
    patchAgendaItem(item.id, speakerPatchForItem(item, speakerId, patch));
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
    window.setTimeout(() => setCopied(false), 2400);
  }

  /*
   * The Zoom App runs in a webview that does not necessarily carry this
   * browser's session, so an event is paired by a short code rather than by
   * signing in again. It is minted on demand: an event that never goes near
   * Zoom never gets one.
   */
  function createZoomCode() {
    mutateEvent((currentEvent) => ({
      ...currentEvent,
      zoomToken: currentEvent.zoomToken ?? makeZoomToken(),
    }));
  }

  async function copyZoomCode() {
    if (!event.zoomToken) return;
    await navigator.clipboard.writeText(event.zoomToken);
    setZoomCopied(true);
    window.setTimeout(() => setZoomCopied(false), 2400);
  }

  useShortcuts(
    [
      { keys: [" "], run: toggleSpeakerTimer },
      { keys: ["p"], run: () => isPanel && togglePanelTimer() },
      {
        keys: ["arrowright", "n"],
        run: () => nextPart && handleJumpTo(segmentIndex + 1),
      },
      { keys: ["arrowleft", "b"], run: () => previousPart && handleJumpTo(segmentIndex - 1) },
      { keys: ["r"], run: resetCurrent },
      { keys: ["arrowup"], run: () => adjust(15, false) },
      { keys: ["arrowdown"], run: () => adjust(-15, false) },
      { keys: ["]"], run: () => isPanel && adjust(15, true) },
      { keys: ["["], run: () => isPanel && adjust(-15, true) },
      {
        keys: ["s"],
        run: () => isPanel && nextItemSegmentIndex >= 0 && handleJumpTo(nextItemSegmentIndex),
      },
      { keys: ["m"], run: toggleSound },
      { keys: ["f"], run: () => setIsFocused((focused) => !focused) },
      { keys: ["?", "/"], run: () => setShowShortcuts((open) => !open) },
      { keys: ["escape"], run: () => setShowShortcuts(false) },
    ],
    !confirmingEnd,
  );

  /*
   * The agenda list depends only on the event and which item is live — never
   * on the ticking clock. Memoising it here means a 5Hz timer update cannot
   * re-render the drag-and-drop tree underneath the operator's cursor.
   */
  const runWorkspace = useMemo(
    () => (
    <section className="min-h-[calc(100svh-7.875rem)] rounded-panel border border-line bg-white/95 p-5 shadow-[0_12px_34px_rgba(26,22,42,0.045)]">
      <div className="mb-4 flex items-end justify-between gap-5">
        <div>
          <h2 className="text-[24px] font-semibold tracking-[-0.045em]">Up next</h2>
        </div>
        <span className="text-[12px] text-text-subtle">
          {event.agenda.length - currentAgendaIndex - 1} upcoming
        </span>
      </div>

      <SortableList
        className="grid gap-2"
        items={event.agenda}
        scope={`live-agenda-${event.id}`}
        isItemDisabled={(_, itemIndex) => itemIndex <= currentAgendaIndex}
        onReorder={(agenda) => mutateEvent((currentEvent) => ({ ...currentEvent, agenda }))}
        renderItem={(item, itemIndex, { dragHandleRef, handleProps }) => {
          const isPast = itemIndex < currentAgendaIndex;
          const isCurrent = itemIndex === currentAgendaIndex;
          const isFuture = itemIndex > currentAgendaIndex;
          return (
            <article
              className={cn(
                "grid grid-cols-[2.25rem_minmax(0,1fr)] gap-2.5 rounded-card border border-line bg-white p-3",
                "transition-[border-color,box-shadow,opacity] duration-150",
                isCurrent &&
                  "border-violet/30 bg-gradient-to-br from-[#fbfaff] to-[#f4f1ff] shadow-[0_8px_26px_rgba(91,61,196,0.08)]",
                isPast && "opacity-55",
              )}
              aria-current={isCurrent ? "step" : undefined}
            >
              <div className="flex size-9 items-center justify-center rounded-[9px] bg-surface-sunken text-[12px] font-bold text-text-subtle">
                {isFuture ? (
                  <button
                    className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-[9px] text-text-subtle/70 transition-colors duration-150 hover:bg-surface-hover hover:text-violet-dark active:cursor-grabbing"
                    ref={dragHandleRef}
                    {...handleProps}
                    type="button"
                    aria-label={`Reorder ${itemLabel(item)}. Hold Alt and press the up or down arrow to move it.`}
                  >
                    <GripVertical size={16} aria-hidden />
                  </button>
                ) : (
                  itemIndex + 1
                )}
              </div>
              <div className="min-w-0">
                <div
                  className={cn(
                    "mb-1.5 grid grid-cols-[minmax(0,1fr)_118px_2.25rem] items-center gap-2 pr-2",
                    isFuture && "min-h-12",
                  )}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold capitalize", item.kind === "panel" ? "bg-violet-soft text-violet-dark" : "bg-[#eaf0ff] text-[#3f558f]")}>
                      {item.kind === "panel" ? <UsersRound size={11} /> : <UserRound size={11} />}
                      {item.kind === "panel" ? "Panel" : "Speaker"}
                    </span>
                    {isCurrent && <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-bold text-success">On now</span>}
                    {isPast && <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-violet-soft px-2.5 py-1 text-[12px] font-bold text-violet-dark">Complete</span>}
                  </div>
                  {isFuture && item.kind === "panel" && (
                    <DurationInput
                      label="Total time"
                      seconds={item.durationSeconds}
                      aria-label={`Total minutes for ${itemLabel(item)}`}
                      onSecondsChange={(durationSeconds) =>
                        patchAgendaItem(item.id, { durationSeconds })
                      }
                    />
                  )}
                  {isFuture && (
                    <button
                      className="col-start-3 grid size-9 shrink-0 place-items-center rounded-[9px] text-text-subtle/60 transition-colors duration-150 hover:bg-surface-hover hover:text-over disabled:opacity-30"
                      onClick={() => removeFutureItem(item.id)}
                      aria-label={`Remove ${itemLabel(item)}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {isFuture ? (
                  <>
                    {/*
                      * No type switch: an item's kind is fixed at creation.
                      * The chip above the row already states which it is.
                    */}
                    <div className="mt-1.5 grid gap-1 rounded-control border border-line-soft bg-surface-sunken p-2">
                      {item.kind === "panel" && (
                        <div className="flex flex-wrap items-center gap-3 py-1">
                          <MaterialOutlinedField
                            className="material-outlined-field material-outlined-field--host"
                            label="Host"
                            value={item.host ?? ""}
                            placeholder="Panel host"
                            ariaLabel={`Host of ${itemLabel(item)}`}
                            onValueChange={(host) => patchAgendaItem(item.id, { host })}
                          />
                          <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5 text-[12px] text-text-muted">
                            <MaterialOutlinedDurationField
                              className="material-outlined-field material-outlined-field--duration"
                              label="Default per panelist"
                              seconds={item.speakerDefaultSeconds}
                              fallbackMinutes={5}
                              ariaLabel={`Default minutes per panelist in ${itemLabel(item)}`}
                              onSecondsChange={(speakerDefaultSeconds) =>
                                patchAgendaItem(item.id, { speakerDefaultSeconds })
                              }
                            />
                            <button
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-line bg-white px-3 text-[12px] font-semibold transition-colors duration-150 hover:bg-surface-hover"
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
                        </div>
                      )}
                      <SortableList
                        className="grid gap-1"
                        items={item.speakers}
                        scope={`live-panelists-${item.id}`}
                        onReorder={(speakers) => patchAgendaItem(item.id, { speakers })}
                        renderItem={(speaker, speakerIndex, controls) => (
                          <div
                            className={cn(
                              "grid items-center gap-2",
                              /* Panelists get a handle column; a lone speaker
                                 has nothing to reorder against. */
                              item.kind === "panel"
                                ? "grid-cols-[2.25rem_minmax(0,1fr)_118px_2.25rem]"
                                : "grid-cols-[minmax(0,1fr)_118px_2.25rem]",
                            )}
                          >
                            {item.kind === "panel" && (
                              <button
                                className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-[9px] text-text-subtle/70 transition-colors duration-150 hover:bg-surface-hover hover:text-violet-dark active:cursor-grabbing"
                                ref={controls.dragHandleRef}
                                {...controls.handleProps}
                                type="button"
                                aria-label={`Reorder ${
                                  speaker.name || `panelist ${speakerIndex + 1}`
                                }. Hold Alt and press the up or down arrow to move them.`}
                              >
                                <GripVertical size={14} />
                              </button>
                            )}
                            <Input
                              className="material-outlined-field--compact w-full max-w-[17.5rem] min-w-0 justify-self-start"
                              label={
                                item.kind === "panel"
                                  ? `Panelist ${speakerIndex + 1}`
                                  : "Speaker"
                              }
                              aria-label={`Name of ${
                                item.kind === "panel"
                                  ? `panelist ${speakerIndex + 1}`
                                  : "the speaker"
                              } in ${itemLabel(item)}`}
                              value={speaker.name}
                              onValueChange={(name) =>
                                patchSpeaker(item, speaker.id, {
                                  name,
                                })
                              }
                            />
                            <DurationInput
                              label={
                                item.kind === "single"
                                  ? "Duration"
                                  : "Minutes"
                              }
                              seconds={speaker.durationSeconds}
                              aria-label={`Minutes for ${
                                speaker.name || `panelist ${speakerIndex + 1}`
                              }`}
                              onSecondsChange={(durationSeconds) =>
                                patchSpeaker(item, speaker.id, { durationSeconds })
                              }
                            />
                            {item.kind === "panel" && (
                              <button
                                className="grid size-9 shrink-0 place-items-center rounded-[9px] text-text-subtle/60 transition-colors duration-150 hover:bg-surface-hover hover:text-over disabled:opacity-30"
                                disabled={item.speakers.length === 1}
                                onClick={() =>
                                  patchAgendaItem(item.id, {
                                    speakers: item.speakers.filter(
                                      (candidate) => candidate.id !== speaker.id,
                                    ),
                                  })
                                }
                                aria-label={`Remove ${
                                  speaker.name || `panelist ${speakerIndex + 1}`
                                }`}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                            {item.kind === "single" && (
                              <span className="size-9" aria-hidden />
                            )}
                          </div>
                        )}
                      />
                      {item.kind === "panel" && (
                        <button
                          className="inline-flex min-h-9 items-center gap-2 rounded-control px-3 text-[12px] font-semibold text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-violet-dark"
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
                    <h3 className="text-[16px] font-semibold tracking-[-0.025em]">
                      {itemLabel(item)}
                    </h3>
                    <p className="mt-1 text-[12px] text-text-subtle">
                      {formatDuration(item.durationSeconds)} total
                    </p>
                    {isCurrent && item.kind === "panel" && (
                      /*
                       * Panelists who have not spoken yet stay editable and
                       * reorderable mid-panel: running order changes on stage
                       * more often than anywhere else in the show.
                       */
                      <SortableList
                        className="mt-3.5 grid gap-1.5"
                        items={item.speakers}
                        scope={`live-current-panel-${item.id}`}
                        isItemDisabled={(speaker) =>
                          panelistTimingIsLocked(
                            segments.findIndex((segment) => segment.id === speaker.id),
                            segmentIndex,
                          )
                        }
                        onReorder={(speakers) => patchAgendaItem(item.id, { speakers })}
                        renderItem={(speaker, speakerIndex, controls) => {
                          const flatIndex = segments.findIndex(
                            (segment) => segment.id === speaker.id,
                          );
                          const speakerIsCurrent = flatIndex === segmentIndex;
                          const hasSpoken = flatIndex < segmentIndex;
                          const timingLocked = panelistTimingIsLocked(
                            flatIndex,
                            segmentIndex,
                          );
                          return (
                            <div
                              className={cn(
                                "grid grid-cols-[1.75rem_minmax(0,1fr)_118px_2.25rem_auto] items-center gap-2 rounded-[11px] border border-transparent bg-white/70 px-1.5 py-1 transition-[border-color,background-color,opacity] duration-150 max-sm:grid-cols-[1.75rem_minmax(0,1fr)_118px]",
                                speakerIsCurrent && "border-violet/36 bg-white",
                                hasSpoken && "opacity-50",
                              )}
                              aria-current={speakerIsCurrent ? "true" : undefined}
                            >
                              {!speakerIsCurrent && !hasSpoken ? (
                                <button
                                  className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-[9px] text-text-subtle/70 transition-colors duration-150 hover:bg-surface-hover hover:text-violet-dark active:cursor-grabbing"
                                  ref={controls.dragHandleRef}
                                  {...controls.handleProps}
                                  type="button"
                                  aria-label={`Reorder ${
                                    speaker.name || `panelist ${speakerIndex + 1}`
                                  }. Hold Alt and press the up or down arrow to move them.`}
                                >
                                  <GripVertical size={14} />
                                </button>
                              ) : (
                                <span className="grid size-7 place-items-center rounded-[8px] bg-violet-soft text-violet-dark" aria-hidden>
                                  {hasSpoken ? <Check size={13} /> : <Play size={11} fill="currentColor" />}
                                </span>
                              )}

                              {hasSpoken || speakerIsCurrent ? (
                                <span className="truncate text-[13px] font-semibold text-ink">{speaker.name}</span>
                              ) : (
                                <Input
                                  className="material-outlined-field--compact w-full min-w-0"
                                  label={`Panelist ${speakerIndex + 1}`}
                                  aria-label={`Name of panelist ${speakerIndex + 1}`}
                                  value={speaker.name}
                                  onValueChange={(name) =>
                                    patchSpeaker(item, speaker.id, {
                                      name,
                                    })
                                  }
                                />
                              )}

                              {timingLocked ? (
                                <DurationReadout
                                  seconds={speaker.durationSeconds}
                                  label={`${Math.round(
                                    speaker.durationSeconds / 60,
                                  )} minutes for ${speaker.name}`}
                                />
                              ) : (
                                <DurationInput
                                  seconds={speaker.durationSeconds}
                                  aria-label={`Minutes for ${
                                    speaker.name || `panelist ${speakerIndex + 1}`
                                  }`}
                                  onSecondsChange={(durationSeconds) =>
                                    updatePanelistDuration(item, speaker.id, durationSeconds)
                                  }
                                />
                              )}

                              {!hasSpoken && (
                                <MuteToggle
                                  muted={isSpeakerMuted(speaker)}
                                  label={`end chime for ${
                                    speaker.name || `panelist ${speakerIndex + 1}`
                                  }`}
                                  onToggle={() =>
                                    patchSpeaker(item, speaker.id, {
                                      soundMuted: !isSpeakerMuted(speaker),
                                    })
                                  }
                                />
                              )}

                              <button
                                className="inline-flex min-h-8 items-center rounded-control border border-line bg-white px-2.5 text-[12px] font-semibold transition-colors duration-150 hover:bg-surface-hover disabled:border-transparent disabled:bg-violet-soft disabled:text-violet-dark"
                                disabled={speakerIsCurrent}
                                onClick={() => handleJumpTo(flatIndex)}
                              >
                                {speakerIsCurrent ? "On now" : "Go to"}
                              </button>
                            </div>
                          );
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            </article>
          );
        }}
      />

      {/*
        * Both kinds are offered up front. An item's type is fixed once it
        * exists, so choosing it at creation is the only chance to choose.
        */}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {(["single", "panel"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-card border border-dashed border-violet/25 bg-violet-soft/40 text-[13px] font-semibold text-violet-dark transition-[border-color,background-color,transform] duration-150 hover:-translate-y-px hover:border-violet/45 hover:bg-violet-soft/70"
            onClick={() =>
              mutateEvent((currentEvent) => ({
                ...currentEvent,
                agenda: [...currentEvent.agenda, makeAgendaItem(kind)],
              }))
            }
          >
            <Plus size={14} aria-hidden />
            {kind === "panel" ? "Add panel" : "Add speaker"}
          </button>
        ))}
      </div>
    </section>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [event, currentAgendaIndex, segmentIndex, segments, isRunning],
  );


  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_9%_0%,rgba(119,87,237,0.1),transparent_22%),#f5f5f7] px-3 pb-8 sm:px-5">
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {copied ? "Audience link copied to clipboard" : ""}
      </p>

      {/*
        * Two groups: the way out on the left, everything to do with this
        * event pushed to the right so the title reads as the heading of the
        * controls that act on it rather than floating between them.
        */}
      <header className="sticky top-0 z-30 -mx-3 mb-5 flex min-h-[76px] flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-[rgba(248,248,250,0.9)] px-4 py-2.5 backdrop-blur-2xl backdrop-saturate-150 sm:-mx-5 sm:px-6">
        <div className="flex shrink-0 items-center gap-2">
          <Link className="inline-flex min-h-9 items-center gap-2 rounded-control px-3 text-[12px] font-semibold text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-violet-dark" href={`/t/${team}`}>
            <ArrowLeft size={15} aria-hidden />
            Events
          </Link>
          <BrandMark />
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <h1 className="mr-1 min-w-0 truncate text-[17px] font-semibold tracking-[-0.03em] max-sm:w-full max-sm:text-left">
            {event.name}
          </h1>
          <LiveClock />
          <button
            className={cn("grid size-11 shrink-0 place-items-center rounded-control border border-line bg-white text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-violet-dark", !soundEnabled && "bg-surface-sunken text-text-subtle")}
            onClick={toggleSound}
            aria-pressed={soundEnabled}
            aria-label={
              soundEnabled
                ? "Turn off end-of-timer sound on audience displays"
                : "Turn on end-of-timer sound on audience displays"
            }
            title={soundEnabled ? "Audience sound on (M)" : "Audience sound off (M)"}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
          <button
            className="grid size-11 shrink-0 place-items-center rounded-control border border-line bg-white text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-violet-dark aria-expanded:bg-violet-soft aria-expanded:text-violet-dark"
            onClick={() => setIsFocused((focused) => !focused)}
            aria-pressed={isFocused}
            aria-label={isFocused ? "Show the run of show" : "Focus on the timer"}
            title={isFocused ? "Show run of show (F)" : "Focus mode (F)"}
          >
            {isFocused ? <Columns2 size={15} /> : <Focus size={15} />}
          </button>
          <button
            className="grid size-11 shrink-0 place-items-center rounded-control border border-line bg-white text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-violet-dark aria-expanded:bg-violet-soft aria-expanded:text-violet-dark"
            onClick={() => setShowShortcuts((open) => !open)}
            aria-expanded={showShortcuts}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard size={15} />
          </button>
          <Link className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-line bg-white px-3 text-[12px] font-semibold transition-colors duration-150 hover:bg-surface-hover" href={`/t/${team}/events/${event.id}/edit`}>
            <Pencil size={14} />
            Edit
          </Link>
          {/*
            * Open-and-copy as one control: both actions concern the same
            * audience link, so they belong together rather than in a panel
            * at the far end of the sidebar.
            */}
          <div className="inline-flex">
            <Link
              href={viewerPath}
              target="_blank"
              className="inline-flex min-h-11 items-center gap-2 rounded-l-control rounded-r-none border border-line bg-white px-3.5 text-[13px] font-semibold transition-colors duration-150 hover:bg-surface-hover"
            >
              <Maximize2 size={14} />
              Audience
            </Link>
            <button
              className="grid w-10 -ml-px place-items-center rounded-l-none rounded-r-control border border-line bg-white transition-colors duration-150 hover:bg-surface-hover"
              onClick={copyLink}
              aria-label="Copy audience link"
              title="Copy audience link"
            >
              {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
            </button>
          </div>
          {isEnded ? (
            <button className="inline-flex min-h-11 items-center gap-2 rounded-control bg-violet px-4 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-violet-dark" onClick={startEvent}>
              <Play size={13} fill="currentColor" />
              Start event
            </button>
          ) : (
            <button className="inline-flex min-h-11 items-center gap-2 rounded-control bg-over px-4 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-[#b62d2d]" onClick={() => setConfirmingEnd(true)}>
              <Square size={11} fill="currentColor" />
              End event
            </button>
          )}
        </div>
      </header>

      {showShortcuts && (
        <div className="mx-auto mb-4 grid w-[min(1420px,100%)] grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-x-5 gap-y-2 rounded-card border border-line bg-white/95 px-5 py-4" role="region" aria-label="Keyboard shortcuts">
          {SHORTCUT_HELP.map((shortcut) => (
            <div key={shortcut.keys} className="flex items-center gap-2.5 text-[12px] text-text-muted">
              <kbd className="min-w-14 rounded-md border border-line border-b-2 bg-surface-sunken px-1.5 py-0.5 text-center font-mono text-[12px] text-text-muted">{shortcut.keys}</kbd>
              <span>{shortcut.action}</span>
            </div>
          ))}
        </div>
      )}

      <div className={cn("mx-auto grid w-[min(1420px,100%)] items-start gap-4 transition-[grid-template-columns] duration-200", isFocused ? "max-w-[760px] grid-cols-1" : "grid-cols-[380px_minmax(0,1fr)] max-lg:grid-cols-[300px_minmax(0,1fr)] max-md:grid-cols-1")}>
        <section className={cn("sticky top-24 flex flex-col gap-3 rounded-panel border border-line bg-white/95 p-6 shadow-[0_12px_34px_rgba(26,22,42,0.045)] max-md:static", isFocused && "static")}>
          <div className="flex items-center justify-between gap-2.5">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold", isEnded ? "bg-violet-soft text-violet-dark" : isRunning ? "bg-success-soft text-success" : runtime.status === "paused" ? "bg-caution-soft text-caution" : "bg-surface-sunken text-text-muted")}>
              <span className="size-1.5 rounded-full bg-current" />
              {isEnded
                ? "Ended"
                : isRunning
                  ? "Running"
                  : runtime.status === "paused"
                    ? "Paused"
                    : "Ready"}
            </span>
            <span className="tabular text-[12px] font-semibold text-text-subtle">
              Part {segmentIndex + 1} of {segments.length}
            </span>
          </div>

          <div className="grid gap-1.5">
            <span className="text-[12px] font-bold tracking-[0.14em] text-text-subtle uppercase">{isPanel ? "Current panel" : "Now speaking"}</span>
            <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.04em]">{current.speaker}</h1>
            {isPanel && <p className="text-[12px] text-text-muted">{panelLabel(currentItem)}</p>}
          </div>

          {isPanel ? (
            <div className="grid gap-2.5">
              {/* The speaker leads: it is the clock that changes most often. */}
              <div className={cn("rounded-control border border-transparent bg-violet-soft p-4 text-center transition-colors duration-200", speakerTone === "caution" && "border-caution/28 bg-caution-soft", speakerTone === "over" && "border-over/30 bg-over-soft")}>
                <div className="mb-2 flex items-center justify-center gap-1.5">
                  <span className="text-[12px] font-bold tracking-[0.08em] text-text-subtle uppercase">
                    {current.speaker}
                  </span>
                  <MuteToggle
                    muted={speakerMuted}
                    label={`end chime for ${current.speaker}`}
                    onToggle={toggleSpeakerMute}
                  />
                </div>
                <strong className="tabular mb-2.5 block font-mono text-[44px] leading-none font-medium tracking-[-0.06em]">
                  {formatTimer(displaySeconds)}
                </strong>
                <TimerProgress label="Speaker progress" ratio={speakerProgress} tone={speakerTone} />
                <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-violet text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-violet-dark" onClick={toggleSpeakerTimer}>
                  {isRunning ? <Pause size={14} /> : <Play size={14} />}
                  {isRunning ? "Pause speaker" : "Start speaker"}
                </button>
                <TimeNudge label={`Adjust time for ${current.speaker}`} onAdjust={adjustSpeaker} />
              </div>
              <div className={cn("rounded-control border border-transparent bg-surface-sunken p-4 text-center transition-colors duration-200", panelTone === "caution" && "border-caution/28 bg-caution-soft", panelTone === "over" && "border-over/30 bg-over-soft")}>
                <div className="mb-2 flex items-center justify-center gap-1.5">
                  <span className="text-[12px] font-bold tracking-[0.08em] text-text-subtle uppercase">
                    Panel remaining
                  </span>
                  <MuteToggle
                    muted={panelMuted}
                    label="end chime for the whole panel"
                    onToggle={togglePanelMute}
                  />
                </div>
                <strong className="tabular mb-2.5 block font-mono text-[44px] leading-none font-medium tracking-[-0.06em]">
                  {formatTimer(panelDisplaySeconds)}
                </strong>
                <TimerProgress label="Panel progress" ratio={panelProgress} tone={panelTone} />
                <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-line bg-white text-[13px] font-semibold transition-colors duration-150 hover:bg-surface-hover" onClick={togglePanelTimer}>
                  {isPanelRunning ? <Pause size={14} /> : <Play size={14} />}
                  {isPanelRunning ? "Pause panel" : "Start panel"}
                </button>
                <TimeNudge label="Adjust the panel total" onAdjust={adjustPanel} />
              </div>
            </div>
          ) : (
            <div className={cn("rounded-control border border-transparent bg-surface-sunken p-4 text-center transition-colors duration-200", speakerTone === "caution" && "border-caution/28 bg-caution-soft", speakerTone === "over" && "border-over/30 bg-over-soft")}>
              <div className="mb-2 flex items-center justify-center gap-1.5">
                <span className="text-[12px] font-bold tracking-[0.08em] text-text-subtle uppercase">
                  {current.speaker}
                </span>
                <MuteToggle
                  muted={speakerMuted}
                  label={`end chime for ${current.speaker}`}
                  onToggle={toggleSpeakerMute}
                />
              </div>
              <strong className="tabular mb-3 block font-mono text-[60px] leading-none font-medium tracking-[-0.06em]">
                {formatTimer(displaySeconds)}
              </strong>
              <TimerProgress label="Speaker progress" ratio={speakerProgress} tone={speakerTone} />
              <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-violet text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-violet-dark" onClick={toggleSpeakerTimer}>
                {isRunning ? <Pause size={14} /> : <Play size={14} />}
                {isRunning ? "Pause timer" : "Start timer"}
              </button>
            </div>
          )}

          <div className="grid auto-cols-fr grid-flow-col gap-1.5">
            {!isPanel && (
              <>
                <button className="grid min-h-9 place-items-center rounded-[8px] bg-surface-sunken text-[12px] font-bold text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-violet-dark" onClick={() => adjust(-60)} title="Remove one minute">
                  −1m
                </button>
                <button className="grid min-h-9 place-items-center rounded-[8px] bg-surface-sunken text-[12px] font-bold text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-violet-dark" onClick={() => adjust(-15)} title="Remove fifteen seconds">
                  −15s
                </button>
              </>
            )}
            <button className="grid min-h-9 place-items-center rounded-[8px] bg-surface-sunken text-[12px] font-bold text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-violet-dark" onClick={resetCurrent} aria-label="Reset timer" title="Reset (R)">
              <RotateCcw size={13} />
              {isPanel ? " Reset panel" : ""}
            </button>
            {!isPanel && (
              <>
                <button className="grid min-h-9 place-items-center rounded-[8px] bg-surface-sunken text-[12px] font-bold text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-violet-dark" onClick={() => adjust(15)} title="Add fifteen seconds">
                  +15s
                </button>
                <button className="grid min-h-9 place-items-center rounded-[8px] bg-surface-sunken text-[12px] font-bold text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-violet-dark" onClick={() => adjust(60)} title="Add one minute">
                  +1m
                </button>
              </>
            )}
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-0.5 rounded-field border border-line bg-surface-raised px-3.5 py-3">
            <span className="text-[12px] font-bold tracking-[0.07em] text-text-subtle uppercase">
              Projected finish
            </span>
            <strong className="tabular col-start-2 row-span-2 self-center text-[19px] font-semibold tracking-[-0.03em]">
              {projectedFinish ? formatClockTime(projectedFinish) : "--:--"}
            </strong>
            <small className="text-[12px] text-text-subtle">
              {formatDuration(Math.max(0, remainingProgramSeconds))} of programme left
            </small>
          </div>

          {/*
            * Pairing code for the Zoom App. Copied here, pasted into the app's
            * panel inside a meeting, where it publishes this event's speaker
            * countdown to every participant.
            */}
          <div className="grid gap-2 rounded-field border border-line bg-surface-raised px-3.5 py-3">
            <span className="flex items-center gap-1.5 text-[12px] font-bold tracking-[0.07em] text-text-subtle uppercase">
              <Video size={12} aria-hidden />
              Zoom code
            </span>
            {event.zoomToken ? (
              <div className="flex items-center justify-between gap-2">
                <strong className="tabular font-mono text-[15px] font-semibold tracking-[0.06em] text-ink">
                  {formatZoomToken(event.zoomToken)}
                </strong>
                <button
                  className="grid size-9 shrink-0 place-items-center rounded-[9px] border border-line bg-white text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-violet-dark"
                  onClick={copyZoomCode}
                  aria-label="Copy the Zoom code for this event"
                  title="Copy Zoom code"
                >
                  {zoomCopied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                </button>
              </div>
            ) : (
              <>
                <p className="text-[12px] text-text-subtle">
                  Paste this into the Timer app inside a Zoom meeting to show the countdown to
                  every participant.
                </p>
                <button
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-control border border-line bg-white px-3 text-[12px] font-semibold transition-colors duration-150 hover:bg-surface-hover"
                  onClick={createZoomCode}
                >
                  <Plus size={13} aria-hidden />
                  Create Zoom code
                </button>
              </>
            )}
            <p className="sr-only" role="status" aria-live="polite">
              {zoomCopied ? "Zoom code copied to clipboard" : ""}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              className="flex min-h-12 min-w-0 items-center gap-2 rounded-field border border-line bg-white px-3 py-2 text-left text-text-muted transition-[border-color,transform,box-shadow] duration-150 hover:-translate-y-px hover:border-violet/30 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!previousPart}
              onClick={() => handleJumpTo(segmentIndex - 1)}
              title="Previous part (←)"
            >
              <SkipBack size={14} />
              <span className="grid min-w-0 text-left">
                <small className="text-[12px] font-semibold text-text-subtle">Previous</small>
                <span className="truncate text-[13px] font-semibold">
                  {previousPart?.speaker || "First part"}
                </span>
              </span>
            </button>
            <button
              className="flex min-h-12 min-w-0 items-center justify-end gap-2 rounded-field border border-transparent bg-violet px-3 py-2 text-right text-white transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-[0_10px_24px_rgba(103,69,220,0.28)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!nextPart}
              onClick={() => handleJumpTo(segmentIndex + 1)}
              title="Next part (→)"
            >
              <span className="grid min-w-0 text-right">
                <small className="text-[12px] font-semibold text-white/70">
                  {isPanel ? "Next panelist" : "Next part"}
                </small>
                <span className="truncate text-[13px] font-semibold">
                  {nextPart?.speaker || "Last part"}
                </span>
              </span>
              <SkipForward size={14} />
            </button>
          </div>

          {/* Only a panel has parts worth skipping past as a group. */}
          {isPanel && nextItemSegmentIndex >= 0 && (
            <button
              className="flex min-h-11 w-full items-center gap-2 rounded-field border border-violet/22 bg-surface-hover px-3 py-2 text-left text-violet-dark transition-[border-color,box-shadow] duration-150 hover:border-violet/40"
              onClick={() => handleJumpTo(nextItemSegmentIndex)}
              title="Skip the rest of this panel (S)"
            >
              <FastForward size={14} />
              <span className="grid min-w-0 text-left">
                <small className="text-[12px] font-semibold text-violet-dark/75">
                  Skip the rest of the panel
                </small>
                <span className="truncate text-[13px] font-semibold">{itemLabel(nextItem)}</span>
              </span>
            </button>
          )}

          {isFocused && upcomingItems.length > 0 && (
            <div className="rounded-field border border-line bg-surface-raised px-3.5 py-3">
              <span className="text-[12px] font-semibold text-text-muted">Coming up</span>
              <ol className="mt-2.5 grid list-none gap-2 p-0">
                {upcomingItems.map((item, offset) => (
                  <li key={item.id} className="grid grid-cols-[1.125rem_minmax(0,1fr)_auto_auto] items-baseline gap-2 text-[13px]">
                    <span className="tabular text-[12px] font-bold text-text-subtle">{currentAgendaIndex + offset + 2}</span>
                    <span className="truncate font-semibold text-ink">{itemLabel(item)}</span>
                    <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[12px] font-semibold text-text-muted">
                      {item.kind === "panel" ? "Panel" : "Speaker"}
                    </span>
                    <span className="tabular text-[12px] text-text-subtle">{formatDuration(item.durationSeconds)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

        </section>

        {!isFocused && runWorkspace}
      </div>

      <ConfirmDialog
        open={confirmingEnd}
        title="End this event?"
        body="Every audience display switches to the completed screen. You can start the event again afterwards."
        confirmLabel="End event"
        onConfirm={endEvent}
        onCancel={() => setConfirmingEnd(false)}
      />
    </main>
  );
}

/** Silences the end chime for one clock. */
function MuteToggle({
  muted,
  label,
  onToggle,
}: {
  muted: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      className={cn("grid size-6 place-items-center rounded-[7px] bg-white/70 transition-colors duration-150 hover:bg-white", muted ? "text-text-subtle" : "text-violet-dark")}
      onClick={onToggle}
      aria-pressed={muted}
      aria-label={muted ? `Unmute the ${label}` : `Mute the ${label}`}
      title={muted ? "Chime off" : "Chime on"}
    >
      {muted ? <BellOff size={13} /> : <Bell size={13} />}
    </button>
  );
}

/** Compact −/+ pair bound to one specific clock. */
function TimeNudge({
  label,
  onAdjust,
}: {
  label: string;
  onAdjust: (seconds: number) => void;
}) {
  return (
    <div className="mt-2 grid grid-cols-4 gap-1" role="group" aria-label={label}>
      <button className="grid min-h-8 place-items-center rounded-[7px] bg-white/75 text-[12px] font-bold text-text-muted transition-colors duration-150 hover:bg-white hover:text-violet-dark" onClick={() => onAdjust(-60)} aria-label="Remove one minute">
        −1m
      </button>
      <button className="grid min-h-8 place-items-center rounded-[7px] bg-white/75 text-[12px] font-bold text-text-muted transition-colors duration-150 hover:bg-white hover:text-violet-dark" onClick={() => onAdjust(-15)} aria-label="Remove fifteen seconds">
        −15s
      </button>
      <button className="grid min-h-8 place-items-center rounded-[7px] bg-white/75 text-[12px] font-bold text-text-muted transition-colors duration-150 hover:bg-white hover:text-violet-dark" onClick={() => onAdjust(15)} aria-label="Add fifteen seconds">
        +15s
      </button>
      <button className="grid min-h-8 place-items-center rounded-[7px] bg-white/75 text-[12px] font-bold text-text-muted transition-colors duration-150 hover:bg-white hover:text-violet-dark" onClick={() => onAdjust(60)} aria-label="Add one minute">
        +1m
      </button>
    </div>
  );
}

function TimerProgress({
  label,
  ratio,
  tone,
}: {
  label: string;
  ratio: number;
  tone: string;
}) {
  return (
    <div
      className="mb-3 h-1 overflow-hidden rounded-full bg-ink/10"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
    >
      <i
        className={cn(
          "block h-full origin-left rounded-full transition-transform duration-200 ease-linear",
          tone === "over" ? "bg-over" : tone === "caution" ? "bg-caution" : "bg-violet",
        )}
        style={{ transform: `scaleX(${ratio})` }}
      />
    </div>
  );
}
