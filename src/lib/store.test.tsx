import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimerEvent } from "@/lib/types";
import type { PublicEventResult } from "@/lib/supabase/remote";

/*
 * The two read-only screens: what they show when the poll succeeds, when the event
 * has been deleted, and when the connection is simply down.
 *
 * Those last two used to be the same `null`, which meant a dropped request blanked
 * a display and a deleted event stayed on screen forever. They are now distinct,
 * and this pins the behaviour that follows from that.
 */

const remote = vi.hoisted(() => ({
  pullPublicEvent: vi.fn(),
  pullZoomEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/remote", () => remote);

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  createSupabaseBrowserClient: () => ({}),
}));

const { usePublicEvent, useZoomEvent } = await import("@/lib/store");
const { writeEventCache, notifyLocalChange } = await import("@/lib/controller/persistence");

const EVENT_ID = "11111111-2222-4333-8444-555555555555";
const VIEWER_TOKEN = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const ZOOM_TOKEN = "ABCDE12345";

function makeEvent(name: string, overrides: Partial<TimerEvent> = {}): TimerEvent {
  return {
    id: EVENT_ID,
    name,
    date: "2026-08-01",
    status: "live",
    viewerToken: VIEWER_TOKEN,
    agenda: [
      {
        id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
        kind: "single",
        durationSeconds: 600,
        speakers: [
          { id: "cccccccc-dddd-4eee-8fff-000000000000", name: "Speaker", durationSeconds: 600 },
        ],
      },
    ],
    runtime: {
      status: "ready",
      segmentIndex: 0,
      remainingSeconds: 600,
      endsAt: null,
      panelStatus: null,
      panelRemainingSeconds: null,
      panelEndsAt: null,
      soundEnabled: true,
      updatedAt: 0,
    },
    createdAt: 0,
    ...overrides,
  };
}

const found = (event: TimerEvent): PublicEventResult => ({ status: "found", event });
const notFound: PublicEventResult = { status: "not-found" };
const unavailable: PublicEventResult = { status: "unavailable" };

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  remote.pullPublicEvent.mockReset();
  remote.pullZoomEvent.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Runs the poll forward by one interval and lets its promise settle. */
async function tick(ms = 1100) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("the audience display", () => {
  it("shows the event the poll returns", async () => {
    remote.pullPublicEvent.mockResolvedValue(found(makeEvent("Leadership Summit")));

    const view = renderHook(() => usePublicEvent(VIEWER_TOKEN));

    await waitFor(() => expect(view.result.current.event?.name).toBe("Leadership Summit"));
    expect(view.result.current.connection).toBe("live");
    view.unmount();
  });

  it("stops showing a deleted event after the next successful poll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    remote.pullPublicEvent.mockResolvedValue(found(makeEvent("Leadership Summit")));

    const view = renderHook(() => usePublicEvent(VIEWER_TOKEN));
    await waitFor(() => expect(view.result.current.event).not.toBeNull());

    // The controller deleted it. The database now answers that nothing matches.
    remote.pullPublicEvent.mockResolvedValue(notFound);
    await tick();

    await waitFor(() => expect(view.result.current.event).toBeNull());
    expect(view.result.current.connection).toBe("not-found");
    view.unmount();
  });

  it("keeps the last known timer when the poll fails, and says so", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    remote.pullPublicEvent.mockResolvedValue(found(makeEvent("Leadership Summit")));

    const view = renderHook(() => usePublicEvent(VIEWER_TOKEN));
    await waitFor(() => expect(view.result.current.event).not.toBeNull());

    remote.pullPublicEvent.mockResolvedValue(unavailable);
    await tick();

    await waitFor(() => expect(view.result.current.connection).toBe("unavailable"));
    /*
     * Still on screen. The countdown is recomputed from `endsAt`, so it stays
     * correct through a blip; blanking the room's display would be worse than
     * showing it behind a warning.
     */
    expect(view.result.current.event?.name).toBe("Leadership Summit");
    view.unmount();
  });

  it("recovers on the poll after a failure", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    remote.pullPublicEvent.mockResolvedValue(unavailable);

    const view = renderHook(() => usePublicEvent(VIEWER_TOKEN));
    await waitFor(() => expect(view.result.current.connection).toBe("unavailable"));

    remote.pullPublicEvent.mockResolvedValue(found(makeEvent("Back again")));
    await tick();

    await waitFor(() => expect(view.result.current.connection).toBe("live"));
    expect(view.result.current.event?.name).toBe("Back again");
    view.unmount();
  });

  it("keeps polling on an interval rather than once", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    remote.pullPublicEvent.mockResolvedValue(found(makeEvent("Summit")));

    const view = renderHook(() => usePublicEvent(VIEWER_TOKEN));
    await waitFor(() => expect(remote.pullPublicEvent).toHaveBeenCalled());
    const first = remote.pullPublicEvent.mock.calls.length;

    await tick();
    await tick();

    expect(remote.pullPublicEvent.mock.calls.length).toBeGreaterThan(first);
    view.unmount();
  });

  it("stops polling once unmounted", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    remote.pullPublicEvent.mockResolvedValue(found(makeEvent("Summit")));

    const view = renderHook(() => usePublicEvent(VIEWER_TOKEN));
    await waitFor(() => expect(remote.pullPublicEvent).toHaveBeenCalled());

    view.unmount();
    const atUnmount = remote.pullPublicEvent.mock.calls.length;
    await tick(5000);

    expect(remote.pullPublicEvent.mock.calls.length).toBe(atUnmount);
  });

  /*
   * The controller's own machine, previewing its own audience link in a second tab.
   * This used to subscribe with the viewer token while the controller wrote its
   * cache under the event id, so the listener was watching a key that never
   * changed and the preview only moved on the next poll.
   */
  it("updates from a controller save on the same device, without waiting for a poll", async () => {
    remote.pullPublicEvent.mockResolvedValue(found(makeEvent("Before the save")));

    const view = renderHook(() => usePublicEvent(VIEWER_TOKEN));
    await waitFor(() => expect(view.result.current.event?.name).toBe("Before the save"));

    // The controller tab saves, writing its cache and notifying this device.
    remote.pullPublicEvent.mockImplementation(() => new Promise(() => {}));
    act(() => {
      writeEventCache(EVENT_ID, makeEvent("After the save"), 2);
      notifyLocalChange(EVENT_ID);
    });

    await waitFor(() => expect(view.result.current.event?.name).toBe("After the save"));
    view.unmount();
  });

  it("paints this device's cached event before the first poll answers", async () => {
    writeEventCache(EVENT_ID, makeEvent("From the cache"), 1);
    remote.pullPublicEvent.mockImplementation(() => new Promise(() => {}));

    const view = renderHook(() => usePublicEvent(VIEWER_TOKEN));

    await waitFor(() => expect(view.result.current.event?.name).toBe("From the cache"));
    view.unmount();
  });
});

describe("the Zoom App", () => {
  it("shows the event its pairing code resolves to", async () => {
    remote.pullZoomEvent.mockResolvedValue(found(makeEvent("Leadership Summit")));

    const view = renderHook(() => useZoomEvent(ZOOM_TOKEN));

    await waitFor(() => expect(view.result.current.event?.name).toBe("Leadership Summit"));
    expect(view.result.current.connection).toBe("live");
    view.unmount();
  });

  it("stops showing a deleted event after the next successful poll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    remote.pullZoomEvent.mockResolvedValue(found(makeEvent("Leadership Summit")));

    const view = renderHook(() => useZoomEvent(ZOOM_TOKEN));
    await waitFor(() => expect(view.result.current.event).not.toBeNull());

    remote.pullZoomEvent.mockResolvedValue(notFound);
    await tick();

    await waitFor(() => expect(view.result.current.event).toBeNull());
    expect(view.result.current.connection).toBe("not-found");
    view.unmount();
  });

  it("keeps the last known timer when the poll fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    remote.pullZoomEvent.mockResolvedValue(found(makeEvent("Leadership Summit")));

    const view = renderHook(() => useZoomEvent(ZOOM_TOKEN));
    await waitFor(() => expect(view.result.current.event).not.toBeNull());

    remote.pullZoomEvent.mockResolvedValue(unavailable);
    await tick();

    await waitFor(() => expect(view.result.current.connection).toBe("unavailable"));
    expect(view.result.current.event?.name).toBe("Leadership Summit");
    view.unmount();
  });

  it("does nothing at all without a pairing code", async () => {
    const view = renderHook(() => useZoomEvent(""));

    await waitFor(() => expect(view.result.current.connection).toBe("idle"));
    expect(remote.pullZoomEvent).not.toHaveBeenCalled();
    expect(view.result.current.event).toBeNull();
    view.unmount();
  });
});

/* Required regression test 4, plus the single-flight guarantee for these loops. */
describe("stale read-only responses", () => {
  /** A promise the test releases when it wants a request to resolve. */
  function gate<T>() {
    let release!: (value: T) => void;
    const waited = new Promise<T>((resolve) => {
      release = resolve;
    });
    return { waited, release };
  }

  it("cannot let an old audience token overwrite the new one's state", async () => {
    const first = gate<PublicEventResult>();
    remote.pullPublicEvent.mockImplementation((_client: unknown, token: string) =>
      token === VIEWER_TOKEN ? first.waited : Promise.resolve(found(makeEvent("Second event"))),
    );

    const view = renderHook(({ token }) => usePublicEvent(token), {
      initialProps: { token: VIEWER_TOKEN },
    });
    await waitFor(() => expect(remote.pullPublicEvent).toHaveBeenCalled());

    // The screen is pointed at a different event before the first read answers.
    const OTHER_TOKEN = "99999999-8888-4777-8666-555555555555";
    view.rerender({ token: OTHER_TOKEN });
    await waitFor(() => expect(view.result.current.event?.name).toBe("Second event"));

    // The abandoned request now resolves.
    await act(async () => {
      first.release(found(makeEvent("First event")));
    });

    // It belongs to a token nobody is watching, so it is discarded.
    expect(view.result.current.event?.name).toBe("Second event");
    view.unmount();
  });

  it("ignores a response that arrives after unmount", async () => {
    const held = gate<PublicEventResult>();
    remote.pullPublicEvent.mockImplementation(() => held.waited);

    const view = renderHook(() => usePublicEvent(VIEWER_TOKEN));
    await waitFor(() => expect(remote.pullPublicEvent).toHaveBeenCalled());
    view.unmount();

    // Resolving after teardown must not touch state; React would warn and the
    // guard is what stops it.
    await act(async () => {
      held.release(found(makeEvent("Too late")));
    });
    // Nothing to assert on the unmounted result beyond not throwing; the guard is
    // what this exercises, and a setState here would fail the test run.
    expect(remote.pullPublicEvent).toHaveBeenCalled();
  });

  it("cannot let an old Zoom pairing code overwrite the new one's state", async () => {
    const first = gate<PublicEventResult>();
    remote.pullZoomEvent.mockImplementation((_client: unknown, code: string) =>
      code === ZOOM_TOKEN ? first.waited : Promise.resolve(found(makeEvent("Second event"))),
    );

    const view = renderHook(({ code }) => useZoomEvent(code), {
      initialProps: { code: ZOOM_TOKEN },
    });
    await waitFor(() => expect(remote.pullZoomEvent).toHaveBeenCalled());

    view.rerender({ code: "ZZZZZ99999" });
    await waitFor(() => expect(view.result.current.event?.name).toBe("Second event"));

    await act(async () => {
      first.release(found(makeEvent("First event")));
    });

    expect(view.result.current.event?.name).toBe("Second event");
    view.unmount();
  });

  it("keeps the audience poll single-flight when online and visibility fire mid-request", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    remote.pullPublicEvent.mockResolvedValueOnce(found(makeEvent("Summit")));

    const view = renderHook(() => usePublicEvent(VIEWER_TOKEN));
    await waitFor(() => expect(remote.pullPublicEvent).toHaveBeenCalled());

    let inFlight = 0;
    let maxInFlight = 0;
    const held = gate<PublicEventResult>();
    remote.pullPublicEvent.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        return await held.waited;
      } finally {
        inFlight -= 1;
      }
    });

    await tick();
    expect(inFlight).toBe(1);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("online"));
    });
    expect(maxInFlight).toBe(1);

    await act(async () => {
      held.release(found(makeEvent("Summit")));
    });
    expect(maxInFlight).toBe(1);

    // And exactly one timer survives, so the request rate is unchanged.
    const afterCoalesce = remote.pullPublicEvent.mock.calls.length;
    await tick();
    expect(remote.pullPublicEvent.mock.calls.length).toBe(afterCoalesce + 1);
    view.unmount();
  });
});

/* Required regression test 6. */
describe("queued same-device cache reads belong to the token that queued them", () => {
  /*
   * Both read hooks look this device's own cache up from a microtask, so the first
   * paint stays out of the render that created it. That deferral is the hazard: the
   * screen can be pointed at a different token, or torn down entirely, before the
   * queued read runs. Holding the microtasks and running them by hand is the only
   * deterministic way to land in that window.
   */
  function heldMicrotasks() {
    const queued: (() => void)[] = [];
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task: () => void) => {
      queued.push(task);
    });
    return {
      queued,
      async flush() {
        await act(async () => {
          for (const task of queued.splice(0)) task();
        });
      },
    };
  }

  const OTHER_TOKEN = "99999999-8888-4777-8666-555555555555";
  const OTHER_EVENT_ID = "22222222-3333-4444-8555-666666666666";

  it("cannot apply an old audience token's cached event after the token changed", async () => {
    // This device has both events cached, from having controlled both.
    writeEventCache(EVENT_ID, makeEvent("First event"), 1);
    writeEventCache(OTHER_EVENT_ID, makeEvent("Second event", {
      id: OTHER_EVENT_ID,
      viewerToken: OTHER_TOKEN,
    }), 1);
    remote.pullPublicEvent.mockImplementation(() => new Promise(() => {}));

    const microtasks = heldMicrotasks();
    const view = renderHook(({ token }) => usePublicEvent(token), {
      initialProps: { token: VIEWER_TOKEN },
    });
    expect(microtasks.queued.length).toBeGreaterThan(0);

    // The screen is pointed elsewhere before the first lookup has run.
    view.rerender({ token: OTHER_TOKEN });
    await microtasks.flush();

    /*
     * Only the surviving token's cache may paint. The first token's queued read is
     * cancelled with its effect, so another event's timer cannot appear in front of
     * the room after the display has been repointed.
     */
    expect(view.result.current.event?.name).toBe("Second event");
    view.unmount();
  });

  it("cannot apply a cached event after the audience display unmounted", async () => {
    writeEventCache(EVENT_ID, makeEvent("First event"), 1);
    remote.pullPublicEvent.mockImplementation(() => new Promise(() => {}));

    const microtasks = heldMicrotasks();
    const view = renderHook(() => usePublicEvent(VIEWER_TOKEN));
    view.unmount();
    await microtasks.flush();

    expect(view.result.current.event).toBeNull();
  });

  it("cannot apply an old Zoom pairing code's cached event after the code changed", async () => {
    writeEventCache(EVENT_ID, makeEvent("First event", { zoomToken: ZOOM_TOKEN }), 1);
    writeEventCache(OTHER_EVENT_ID, makeEvent("Second event", {
      id: OTHER_EVENT_ID,
      zoomToken: "ZZZZZ99999",
    }), 1);
    remote.pullZoomEvent.mockImplementation(() => new Promise(() => {}));

    const microtasks = heldMicrotasks();
    const view = renderHook(({ code }) => useZoomEvent(code), {
      initialProps: { code: ZOOM_TOKEN },
    });
    expect(microtasks.queued.length).toBeGreaterThan(0);

    view.rerender({ code: "ZZZZZ99999" });
    await microtasks.flush();

    expect(view.result.current.event?.name).toBe("Second event");
    view.unmount();
  });

  it("cannot report a connection state for a pairing code that has been replaced", async () => {
    remote.pullZoomEvent.mockImplementation(() => new Promise(() => {}));

    const microtasks = heldMicrotasks();
    const view = renderHook(({ code }) => useZoomEvent(code), {
      initialProps: { code: ZOOM_TOKEN },
    });

    // Cleared while the first code's lookup was still queued.
    view.rerender({ code: "" });
    await microtasks.flush();

    // "idle" is the empty code's own answer; the abandoned one said "connecting".
    expect(view.result.current.connection).toBe("idle");
    expect(view.result.current.event).toBeNull();
    view.unmount();
  });
});

/* P1: a new token must never inherit the previous token's event. */
describe("changing the token replaces what is on screen", () => {
  const OTHER_TOKEN = "99999999-8888-4777-8666-555555555555";
  const OTHER_EVENT_ID = "22222222-3333-4444-8555-666666666666";
  const OTHER_ZOOM_TOKEN = "ZZZZZ99999";

  function gate<T>() {
    let release!: (value: T) => void;
    const waited = new Promise<T>((resolve) => {
      release = resolve;
    });
    return { waited, release };
  }

  it("shows the new audience token's cached event immediately", async () => {
    remote.pullPublicEvent.mockResolvedValue(found(makeEvent("First event")));
    const view = renderHook(({ token }) => usePublicEvent(token), {
      initialProps: { token: VIEWER_TOKEN },
    });
    await waitFor(() => expect(view.result.current.event?.name).toBe("First event"));
    expect(view.result.current.connection).toBe("live");

    // This device has the second event cached, and the second request never answers.
    writeEventCache(
      OTHER_EVENT_ID,
      makeEvent("Second event", { id: OTHER_EVENT_ID, viewerToken: OTHER_TOKEN }),
      4,
    );
    const held = gate<PublicEventResult>();
    remote.pullPublicEvent.mockImplementation(() => held.waited);

    view.rerender({ token: OTHER_TOKEN });

    await waitFor(() => expect(view.result.current.event?.name).toBe("Second event"));
    // A definitive answer about the old token says nothing about this one.
    expect(view.result.current.connection).toBe("connecting");
    view.unmount();
  });

  it("clears the previous audience event when the new token has nothing cached", async () => {
    remote.pullPublicEvent.mockResolvedValue(found(makeEvent("First event")));
    const view = renderHook(({ token }) => usePublicEvent(token), {
      initialProps: { token: VIEWER_TOKEN },
    });
    await waitFor(() => expect(view.result.current.event?.name).toBe("First event"));

    const held = gate<PublicEventResult>();
    remote.pullPublicEvent.mockImplementation(() => held.waited);
    view.rerender({ token: OTHER_TOKEN });

    /*
     * The first event's countdown under the second event's link would be wrong in
     * front of a room, and an unreachable second token would leave it there
     * indefinitely. It is cleared while the new link connects.
     */
    await waitFor(() => expect(view.result.current.event).toBeNull());
    expect(view.result.current.connection).toBe("connecting");
    expect(remote.pullPublicEvent).toHaveBeenLastCalledWith(expect.anything(), OTHER_TOKEN);

    // And it does not come back while that request stays outstanding.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await tick(3000);
    expect(view.result.current.event).toBeNull();
    view.unmount();
  });

  it("shows the new Zoom code's cached event immediately", async () => {
    remote.pullZoomEvent.mockResolvedValue(found(makeEvent("First event")));
    const view = renderHook(({ code }) => useZoomEvent(code), {
      initialProps: { code: ZOOM_TOKEN },
    });
    await waitFor(() => expect(view.result.current.event?.name).toBe("First event"));
    expect(view.result.current.connection).toBe("live");

    writeEventCache(
      OTHER_EVENT_ID,
      makeEvent("Second event", { id: OTHER_EVENT_ID, zoomToken: OTHER_ZOOM_TOKEN }),
      4,
    );
    const held = gate<PublicEventResult>();
    remote.pullZoomEvent.mockImplementation(() => held.waited);

    view.rerender({ code: OTHER_ZOOM_TOKEN });

    await waitFor(() => expect(view.result.current.event?.name).toBe("Second event"));
    expect(view.result.current.connection).toBe("connecting");
    view.unmount();
  });

  it("clears the previous Zoom event when the new code has nothing cached", async () => {
    remote.pullZoomEvent.mockResolvedValue(found(makeEvent("First event")));
    const view = renderHook(({ code }) => useZoomEvent(code), {
      initialProps: { code: ZOOM_TOKEN },
    });
    await waitFor(() => expect(view.result.current.event?.name).toBe("First event"));

    const held = gate<PublicEventResult>();
    remote.pullZoomEvent.mockImplementation(() => held.waited);
    view.rerender({ code: OTHER_ZOOM_TOKEN });

    await waitFor(() => expect(view.result.current.event).toBeNull());
    expect(view.result.current.connection).toBe("connecting");
    expect(remote.pullZoomEvent).toHaveBeenLastCalledWith(expect.anything(), OTHER_ZOOM_TOKEN);

    vi.useFakeTimers({ shouldAdvanceTime: true });
    await tick(3000);
    expect(view.result.current.event).toBeNull();
    view.unmount();
  });
});
