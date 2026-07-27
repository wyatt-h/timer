export type EventStatus = "draft" | "live" | "completed";
export type TimerStatus = "ready" | "running" | "paused" | "ended";
export type AgendaKind = "single" | "panel";

export interface Speaker {
  id: string;
  name: string;
  durationSeconds: number;
}

export interface AgendaItem {
  id: string;
  kind: AgendaKind;
  title: string;
  durationSeconds: number;
  speakers: Speaker[];
}

export interface RuntimeState {
  status: TimerStatus;
  segmentIndex: number;
  remainingSeconds: number;
  endsAt: number | null;
  updatedAt: number;
}

export interface AuraEvent {
  id: string;
  name: string;
  date: string;
  location: string;
  status: EventStatus;
  viewerToken: string;
  agenda: AgendaItem[];
  runtime: RuntimeState;
  createdAt: number;
}

export interface Workspace {
  team: string;
  events: AuraEvent[];
  updatedAt: number;
}

export interface TimerSegment {
  id: string;
  agendaItemId: string;
  title: string;
  speaker: string;
  durationSeconds: number;
  kind: AgendaKind;
}
