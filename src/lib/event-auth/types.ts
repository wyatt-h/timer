import type { TimerEvent } from "@/lib/types";

/**
 * One event as its controller sees it: the event plus what it takes to save it.
 *
 * There is no team. An event is an independent resource whose only owner is the
 * credential record behind `loginName`.
 */
export type ControllerEvent = {
  /** Optimistic-concurrency version. A save that supplies a stale one is refused. */
  version: number;
  loginName: string;
  event: TimerEvent;
};

/*
 * `controller_event_payload` returns timestamps as ISO strings, because that is
 * what timestamptz becomes inside jsonb. The rest of the application works in
 * epoch milliseconds, so the conversion happens once, in the route handler,
 * rather than being repeated by every caller.
 */
type RawControllerPayload = {
  version: number | string;
  loginName: string;
  event: Omit<TimerEvent, "runtime"> & {
    runtime: Omit<TimerEvent["runtime"], "endsAt" | "panelEndsAt" | "updatedAt"> & {
      endsAt: string | null;
      panelEndsAt: string | null;
      updatedAt: string;
    };
  };
};

function toMs(value: string | null) {
  return value ? new Date(value).getTime() : null;
}

export function normalizeControllerPayload(raw: unknown): ControllerEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as RawControllerPayload;
  if (!payload.event?.id) return null;
  return {
    version: Number(payload.version),
    loginName: payload.loginName,
    event: {
      ...payload.event,
      zoomToken: payload.event.zoomToken ?? undefined,
      runtime: {
        ...payload.event.runtime,
        endsAt: toMs(payload.event.runtime.endsAt),
        panelEndsAt: toMs(payload.event.runtime.panelEndsAt),
        updatedAt: new Date(payload.event.runtime.updatedAt).getTime(),
      },
    },
  };
}
