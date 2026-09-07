import type { TimerEvent } from "@/lib/types";

/** Deliberately has no usable public tokens or persisted event identifier. */
export function makePracticeEvent(panel = false): TimerEvent {
  return {
    id: "local-guide-practice", name: "Friday showcase · practice", date: "2026-09-06", status: "live",
    viewerToken: "", createdAt: 0,
    agenda: [
      { id: "opening", kind: "single", durationSeconds: 300, speakers: [{ id: "avery", name: "Avery Chen", durationSeconds: 300 }] },
      { id: "panel", kind: "panel", host: "Jordan Lee", durationSeconds: 1200, speakerDefaultSeconds: 300, speakers: [{ id: "mina", name: "Mina Patel", durationSeconds: 300 }, { id: "theo", name: "Theo Park", durationSeconds: 300 }] },
      { id: "closing", kind: "single", durationSeconds: 180, speakers: [{ id: "sam", name: "Sam Rivera", durationSeconds: 180 }] },
    ],
    runtime: { status: "ready", segmentIndex: panel ? 1 : 0, remainingSeconds: 300, endsAt: null, panelStatus: panel ? "ready" : null, panelRemainingSeconds: panel ? 1200 : null, panelEndsAt: null, updatedAt: 0 },
  };
}

export const practiceSteps = [
  { title: "Start the speaker", text: "Select Start timer (Start speaker on a panel). The same countdown controls used in a real event are running here.", target: "timer-toggle" },
  { title: "Add some time", text: "Select +15s below the speaker clock. Watch the countdown gain fifteen seconds while it keeps running.", target: "timer-adjust" },
  { title: "Pause the speaker", text: "Select Pause timer (Pause speaker on a panel). If this is a panel, its overall clock continues running.", target: "timer-toggle" },
  { title: "Change speakers", text: "Select Next part or Next panelist. The next speaker loads paused; you decide when they begin.", target: "timer-next" },
] as const;

/** Progress depends on committed sample state, not a click or a Next button. */
export function advancePractice(step: number, before: TimerEvent, after: TimerEvent) {
  const a = before.runtime, b = after.runtime;
  if (step === 0 && a.status !== "running" && b.status === "running") return 1;
  if (step === 1 && a.segmentIndex === b.segmentIndex && a.status === "running" && b.status === "running" && a.endsAt && b.endsAt && Math.abs(b.endsAt - a.endsAt - 15000) < 2000) return 2;
  if (step === 2 && a.status === "running" && b.status === "paused") {
    const speakerCount = after.agenda.reduce((count, item) => count + item.speakers.length, 0);
    return b.segmentIndex < speakerCount - 1 ? 3 : 4;
  }
  if (step === 3 && b.segmentIndex > a.segmentIndex && b.status === "paused") return 4;
  return step;
}
