export type EventStatus = "draft" | "live" | "completed";
export type TimerStatus = "ready" | "running" | "paused" | "ended";
export type AgendaKind = "single" | "panel";

export interface Speaker {
  id: string;
  name: string;
  durationSeconds: number;
  /** Silences this speaker's end chime. Speakers chime by default. */
  soundMuted?: boolean;
}

export interface AgendaItem {
  id: string;
  kind: AgendaKind;
  durationSeconds: number;
  speakerDefaultSeconds?: number;
  speakers: Speaker[];
  /** Who runs the panel. Not a timed slot — the host does not take a turn. */
  host?: string;
  /**
   * Silences the whole-panel end chime. Undefined means muted for a panel:
   * the panel total is context, and a chime for it would fire in the middle
   * of somebody speaking.
   */
  soundMuted?: boolean;
}

export interface RuntimeState {
  status: TimerStatus;
  segmentIndex: number;
  remainingSeconds: number;
  endsAt: number | null;
  panelStatus?: TimerStatus | null;
  panelRemainingSeconds?: number | null;
  panelEndsAt?: number | null;
  /**
   * Whether audience displays should chime at all. Broadcast with the rest of
   * the runtime so every screen follows the control room. Undefined means on,
   * which keeps events created before this setting behaving as they did.
   */
  soundEnabled?: boolean;
  updatedAt: number;
}

export interface TimerEvent {
  id: string;
  name: string;
  date: string;
  status: EventStatus;
  viewerToken: string;
  /**
   * Pairing code for the Zoom App, created on demand from the control room.
   * Absent until an operator asks for one, so no event carries a code it has
   * never needed.
   */
  zoomToken?: string;
  agenda: AgendaItem[];
  runtime: RuntimeState;
  createdAt: number;
}

export interface Workspace {
  team: string;
  events: TimerEvent[];
  updatedAt: number;
}

export interface TimerSegment {
  id: string;
  agendaItemId: string;
  speaker: string;
  durationSeconds: number;
  kind: AgendaKind;
}
