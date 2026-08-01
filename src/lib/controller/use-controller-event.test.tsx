import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimerEvent } from "@/lib/types";

/*
 * The controller hook's behaviour when things go wrong, when another device gets
 * there first, and when authorization lapses mid-edit.
 *
 * The API client is the only seam. Everything else — the outbox and its revision,
 * the polling loop, the conflict decision, and the distinction between a lost
 * session and a deleted event — is the real implementation.
 */

const api = vi.hoisted(() => ({
  fetchControllerEvent: vi.fn(),
  saveControllerEvent: vi.fn(),
  deleteControllerEvent: vi.fn(),
  logoutOfEvent: vi.fn(),
}));

vi.mock("@/lib/event-auth/client", () => api);

const { useControllerEvent } = await import("@/lib/controller/use-controller-event");
const { readOutbox, readEventCache, writeEventCache, writeOutbox, notifyLocalChange } =
  await import("@/lib/controller/persistence");

const EVENT_ID = "11111111-2222-4333-8444-555555555555";

function makeEvent(name: string, overrides: Partial<TimerEvent> = {}): TimerEvent {
  return {
    id: EVENT_ID,
    name,
    date: "2026-08-01",
    status: "live",
    viewerToken: "66666666-7777-4888-8999-aaaaaaaaaaaa",
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

function payload(event: TimerEvent, version: number) {
  return { version, loginName: "summit-2026", event };
}

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function failure(code: string, message = "failed") {
  return { ok: false as const, code, message };
}

/** A promise the test releases when it wants an in-flight request to finish. */
function gate<T>() {
  let release!: (value: T) => void;
  const waited = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { waited, release };
}

beforeEach(() => {
  window.localStorage.clear();
  // The outbox lives in this tab's sessionStorage now, so both have to be reset.
  window.sessionStorage.clear();
  api.fetchControllerEvent.mockReset();
  api.saveControllerEvent.mockReset();
  api.deleteControllerEvent.mockReset();
  api.logoutOfEvent.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function mounted(eventId = EVENT_ID) {
  const view = renderHook(() => useControllerEvent(eventId));
  await waitFor(() => expect(view.result.current.status).not.toBe("loading"));
  return view;
}

describe("loading", () => {
  it("adopts the authoritative event and caches it", async () => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("From the server"), 4)));

    const view = await mounted();

    expect(view.result.current.event?.name).toBe("From the server");
    expect(view.result.current.loginName).toBe("summit-2026");
    expect(readEventCache(EVENT_ID)?.version).toBe(4);
  });

  it("paints the cache before the server answers", async () => {
    writeEventCache(EVENT_ID, makeEvent("Cached"), 2);
    const first = gate<ReturnType<typeof ok>>();
    api.fetchControllerEvent.mockImplementation(() => first.waited);

    const view = renderHook(() => useControllerEvent(EVENT_ID));
    await waitFor(() => expect(view.result.current.event?.name).toBe("Cached"));

    act(() => first.release(ok(payload(makeEvent("Fresh"), 3))));
    await waitFor(() => expect(view.result.current.event?.name).toBe("Fresh"));
  });
});

describe("a temporary failure keeps the event", () => {
  it.each(["internal", "unavailable", "network", "rate_limited"])(
    "retains the cached event on a %s failure and reports offline",
    async (code) => {
      writeEventCache(EVENT_ID, makeEvent("Still here"), 2);
      api.fetchControllerEvent.mockResolvedValue(failure(code));

      const view = await mounted();

      expect(view.result.current.event?.name).toBe("Still here");
      expect(view.result.current.status).toBe("ready");
      expect(view.result.current.saveState).toBe("offline");
      expect(readEventCache(EVENT_ID)).not.toBeNull();
    },
  );

  it("reports unavailable rather than not-found when there is no cache", async () => {
    api.fetchControllerEvent.mockResolvedValue(failure("internal"));

    const view = await mounted();

    expect(view.result.current.status).toBe("unavailable");
    expect(view.result.current.event).toBeNull();
  });
});

describe("authorization expiring is not deletion", () => {
  it.each(["session_required", "wrong_event"])(
    "keeps the cached event and the outbox on %s",
    async (code) => {
      writeEventCache(EVENT_ID, makeEvent("Still mine"), 2);
      writeOutbox({
        eventId: EVENT_ID,
        event: makeEvent("Edited offline"),
        expectedVersion: 2,
        revision: "rev-seed",
        status: "pending",
        lastError: null,
        updatedAt: Date.now(),
      });
      api.fetchControllerEvent.mockResolvedValue(failure(code));

      const view = await mounted();

      // Sign in again, not "gone".
      expect(view.result.current.status).toBe("authorization-required");
      expect(view.result.current.saveState).toBe("signed-out");
      // Neither the cache nor the unsaved edit is touched.
      expect(readEventCache(EVENT_ID)?.event.name).toBe("Still mine");
      expect(readOutbox(EVENT_ID)?.event.name).toBe("Edited offline");
      expect(view.result.current.hasUnsavedWork()).toBe(true);
    },
  );

  it("clears local data only when the server confirms not_found", async () => {
    writeEventCache(EVENT_ID, makeEvent("Deleted elsewhere"), 2);
    writeOutbox({
      eventId: EVENT_ID,
      event: makeEvent("Doomed edit"),
      expectedVersion: 2,
      revision: "rev-seed",
      status: "pending",
      lastError: null,
      updatedAt: Date.now(),
    });
    api.fetchControllerEvent.mockResolvedValue(failure("not_found"));

    const view = await mounted();

    expect(view.result.current.status).toBe("not-found");
    expect(view.result.current.event).toBeNull();
    expect(readEventCache(EVENT_ID)).toBeNull();
    expect(readOutbox(EVENT_ID)).toBeNull();
  });

  it("stops sending writes while authorization is missing, but still stores them", async () => {
    writeEventCache(EVENT_ID, makeEvent("Original"), 2);
    api.fetchControllerEvent.mockResolvedValue(failure("session_required"));

    const view = await mounted();
    expect(view.result.current.status).toBe("authorization-required");

    act(() => view.result.current.update((current) => ({ ...current, name: "Typed anyway" })));

    // Kept on disk, and nothing was sent to be refused again.
    expect(readOutbox(EVENT_ID)?.event.name).toBe("Typed anyway");
    expect(api.saveControllerEvent).not.toHaveBeenCalled();
    expect(view.result.current.saveState).toBe("signed-out");
  });

  it("resumes the outbox after signing in again, keeping optimistic concurrency", async () => {
    writeEventCache(EVENT_ID, makeEvent("Original"), 2);
    api.fetchControllerEvent.mockResolvedValue(failure("session_required"));

    const view = await mounted();
    act(() => view.result.current.update((current) => ({ ...current, name: "Survived" })));
    expect(readOutbox(EVENT_ID)?.event.name).toBe("Survived");

    // The operator signs in again. The server is still at the version the edit
    // expects, so the edit is a legitimate write.
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Original"), 2)));
    api.saveControllerEvent.mockResolvedValue(ok(payload(makeEvent("Survived"), 3)));

    await act(async () => {
      await view.result.current.resumeAfterSignIn();
    });

    await waitFor(() =>
      expect(api.saveControllerEvent).toHaveBeenCalledWith(
        EVENT_ID,
        2,
        expect.objectContaining({ name: "Survived" }),
      ),
    );
    await waitFor(() => expect(readOutbox(EVENT_ID)).toBeNull());
    expect(view.result.current.event?.name).toBe("Survived");
  });

  it("turns a conflict, not an overwrite, when the server moved on during the lapse", async () => {
    writeEventCache(EVENT_ID, makeEvent("Original"), 2);
    api.fetchControllerEvent.mockResolvedValue(failure("session_required"));

    const view = await mounted();
    act(() => view.result.current.update((current) => ({ ...current, name: "Mine" })));

    // Somebody else committed while this device was locked out.
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Theirs"), 9)));
    await act(async () => {
      await view.result.current.resumeAfterSignIn();
    });

    await waitFor(() => expect(view.result.current.saveState).toBe("conflict"));
    expect(api.saveControllerEvent).not.toHaveBeenCalled();
    // Neither version is thrown away.
    expect(readOutbox(EVENT_ID)?.event.name).toBe("Mine");
    expect(view.result.current.event?.name).toBe("Mine");
  });
});

describe("the outbox", () => {
  it("records an edit synchronously, with a revision, before anything is sent", async () => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Original"), 5)));
    api.saveControllerEvent.mockImplementation(() => new Promise(() => {}));

    const view = await mounted();
    act(() => view.result.current.update((current) => ({ ...current, name: "Edited" })));

    const pending = readOutbox(EVENT_ID);
    expect(pending?.event.name).toBe("Edited");
    expect(pending?.expectedVersion).toBe(5);
    expect(pending?.status).toBe("pending");
    // Opaque and non-empty, never a counter.
    expect(typeof pending?.revision).toBe("string");
    expect(pending?.revision.length).toBeGreaterThan(8);
  });

  it("mints a fresh opaque revision per edit, not derived from what is stored", async () => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Original"), 5)));
    api.saveControllerEvent.mockImplementation(() => new Promise(() => {}));

    const view = await mounted();
    act(() => view.result.current.update((current) => ({ ...current, name: "One" })));
    const first = readOutbox(EVENT_ID)!.revision;
    act(() => view.result.current.update((current) => ({ ...current, name: "Two" })));
    const second = readOutbox(EVENT_ID)!.revision;

    expect(readOutbox(EVENT_ID)?.event.name).toBe("Two");
    expect(second).not.toBe(first);
    /*
     * The old counter restarted at 1 whenever the outbox was empty, so two tabs
     * could mint the same value for different edits and an acknowledgement of one
     * would erase the other. Nothing about these ids can collide.
     */
    expect(second).not.toBe("1");
    expect(second).not.toBe("2");
  });

  it("survives a reload and resumes the retry", async () => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Original"), 5)));
    api.saveControllerEvent.mockImplementation(() => new Promise(() => {}));

    const first = await mounted();
    act(() => first.result.current.update((current) => ({ ...current, name: "Edited" })));
    expect(readOutbox(EVENT_ID)?.event.name).toBe("Edited");
    first.unmount();

    api.saveControllerEvent.mockResolvedValue(ok(payload(makeEvent("Edited"), 6)));
    const second = await mounted();

    expect(second.result.current.event?.name).toBe("Edited");
    await waitFor(() => expect(api.saveControllerEvent).toHaveBeenCalled());
    await waitFor(() => expect(readOutbox(EVENT_ID)).toBeNull());
  });

  /*
   * The race this revision exists for. Without it, A's success unconditionally
   * cleared the outbox, and B — which had replaced A on disk — survived only in
   * React state and died on the next reload.
   */
  it("keeps an edit made while an earlier save was in flight, and retries it after a reload", async () => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Original"), 1)));
    const saveA = gate<ReturnType<typeof ok>>();
    api.saveControllerEvent.mockImplementationOnce(() => saveA.waited);

    const view = await mounted();

    // Edit A goes in flight.
    act(() => view.result.current.update((current) => ({ ...current, name: "A" })));
    await waitFor(() => expect(api.saveControllerEvent).toHaveBeenCalledTimes(1));
    const revisionA = readOutbox(EVENT_ID)!.revision;

    // Edit B replaces A on disk while A is still in flight.
    act(() => view.result.current.update((current) => ({ ...current, name: "B" })));
    expect(readOutbox(EVENT_ID)?.event.name).toBe("B");
    const revisionB = readOutbox(EVENT_ID)!.revision;
    expect(revisionB).not.toBe(revisionA);

    // A succeeds, committing version 2. B must not be cleared by it.
    api.saveControllerEvent.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      saveA.release(ok(payload(makeEvent("A"), 2)));
    });

    await waitFor(() => {
      const pending = readOutbox(EVENT_ID);
      expect(pending?.event.name).toBe("B");
      // Advanced to the version A just created, so B's retry is a real write.
      expect(pending?.expectedVersion).toBe(2);
      // Still B's own revision: acknowledging A must not renumber or replace it.
      expect(pending?.revision).toBe(revisionB);
    });
    // The screen still shows B, not the acknowledged older snapshot.
    expect(view.result.current.event?.name).toBe("B");
    // The authoritative snapshot is preserved separately.
    expect(readEventCache(EVENT_ID)?.event.name).toBe("A");
    expect(readEventCache(EVENT_ID)?.version).toBe(2);

    // Reload before B completes: B is still there and is retried against 2.
    view.unmount();
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("A"), 2)));
    api.saveControllerEvent.mockReset();
    api.saveControllerEvent.mockResolvedValue(ok(payload(makeEvent("B"), 3)));

    const reloaded = await mounted();
    expect(reloaded.result.current.event?.name).toBe("B");
    await waitFor(() =>
      expect(api.saveControllerEvent).toHaveBeenCalledWith(
        EVENT_ID,
        2,
        expect.objectContaining({ name: "B" }),
      ),
    );
    await waitFor(() => expect(readOutbox(EVENT_ID)).toBeNull());
  });

  it("clears only once the server has confirmed the write", async () => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Original"), 1)));
    api.saveControllerEvent.mockResolvedValue(failure("internal"));

    const view = await mounted();
    act(() => view.result.current.update((current) => ({ ...current, name: "Edited" })));

    await waitFor(() => expect(view.result.current.saveState).toBe("offline"));
    const pending = readOutbox(EVENT_ID);
    expect(pending?.event.name).toBe("Edited");
    expect(pending?.status).toBe("failed");
    expect(pending?.lastError).toBeTruthy();

    api.saveControllerEvent.mockResolvedValue(ok(payload(makeEvent("Edited"), 2)));
    act(() => view.result.current.retrySave());
    await waitFor(() => expect(readOutbox(EVENT_ID)).toBeNull());
    expect(view.result.current.saveState).toBe("saved");
  });

  it("does not let a server fetch overwrite a pending edit", async () => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Original"), 5)));
    api.saveControllerEvent.mockImplementation(() => new Promise(() => {}));

    const view = await mounted();
    act(() => view.result.current.update((current) => ({ ...current, name: "Edited" })));

    await act(async () => {
      await view.result.current.sync();
    });
    expect(view.result.current.event?.name).toBe("Edited");
    expect(readOutbox(EVENT_ID)?.event.name).toBe("Edited");
  });
});

describe("cross-device synchronisation by polling", () => {
  it("picks up a newer committed version without a refresh", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("First"), 1)));
      const view = renderHook(() => useControllerEvent(EVENT_ID));
      await waitFor(() => expect(view.result.current.event?.name).toBe("First"));

      // Another device committed.
      api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Changed elsewhere"), 2)));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100);
      });

      await waitFor(() =>
        expect(view.result.current.event?.name).toBe("Changed elsewhere"),
      );
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  /*
   * A genuine cross-device conflict is resolved by the save's own 409, never by a
   * background poll. The poll has no standing to decide that local unsaved work is
   * stale — it cannot tell "somebody else committed" from "my own save committed
   * and its response has not arrived yet".
   */
  it("leaves a real conflict to the save response rather than the poll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Original"), 1)));
      const save = gate<{ ok: false; code: string; message: string; payload: unknown }>();
      api.saveControllerEvent.mockImplementation(() => save.waited);

      const view = renderHook(() => useControllerEvent(EVENT_ID));
      await waitFor(() => expect(view.result.current.event?.name).toBe("Original"));
      act(() => view.result.current.update((current) => ({ ...current, name: "Mine" })));
      await waitFor(() => expect(api.saveControllerEvent).toHaveBeenCalled());

      // A poll during the flight sees a version this device never wrote.
      api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Theirs"), 9)));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2200);
      });

      // No conflict yet: the save is still the authority on its own outcome.
      expect(view.result.current.saveState).toBe("saving");

      // Now the server refuses it for real.
      await act(async () => {
        save.release({
          ok: false,
          code: "conflict",
          message: "conflict",
          payload: payload(makeEvent("Theirs"), 9),
        });
      });

      await waitFor(() => expect(view.result.current.saveState).toBe("conflict"));
      expect(view.result.current.event?.name).toBe("Mine");
      expect(readOutbox(EVENT_ID)?.event.name).toBe("Mine");
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops polling once unmounted", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("First"), 1)));
      const view = renderHook(() => useControllerEvent(EVENT_ID));
      await waitFor(() => expect(view.result.current.event?.name).toBe("First"));

      view.unmount();
      const callsAtUnmount = api.fetchControllerEvent.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(api.fetchControllerEvent.mock.calls.length).toBe(callsAtUnmount);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not poll while authorization is missing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.fetchControllerEvent.mockResolvedValue(failure("session_required"));
      const view = renderHook(() => useControllerEvent(EVENT_ID));
      await waitFor(() =>
        expect(view.result.current.status).toBe("authorization-required"),
      );
      const callsAtLockout = api.fetchControllerEvent.mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      // Hammering an endpoint that is going to answer 401 helps nobody.
      expect(api.fetchControllerEvent.mock.calls.length).toBe(callsAtLockout);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("resolving a conflict", () => {
  async function conflicted() {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Original"), 1)));
    api.saveControllerEvent.mockResolvedValue({
      ok: false as const,
      code: "conflict",
      message: "conflict",
      payload: payload(makeEvent("Theirs"), 2),
    });

    const view = await mounted();
    act(() => view.result.current.update((current) => ({ ...current, name: "Mine" })));
    await waitFor(() => expect(view.result.current.saveState).toBe("conflict"));
    return view;
  }

  it("can take the other device's version", async () => {
    const view = await conflicted();
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Theirs"), 2)));

    await act(async () => {
      await view.result.current.discardLocalChanges();
    });

    expect(view.result.current.event?.name).toBe("Theirs");
    expect(readOutbox(EVENT_ID)).toBeNull();
  });

  it("keeps the local edit if the operator chooses that instead", async () => {
    const view = await conflicted();
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Theirs"), 2)));
    api.saveControllerEvent.mockResolvedValue(ok(payload(makeEvent("Mine"), 3)));

    await act(async () => {
      await view.result.current.keepLocalChanges();
    });

    expect(view.result.current.event?.name).toBe("Mine");
    await waitFor(() =>
      expect(api.saveControllerEvent).toHaveBeenLastCalledWith(
        EVENT_ID,
        2,
        expect.objectContaining({ name: "Mine" }),
      ),
    );
  });

  it("does not lose the local edit when resolving fails", async () => {
    const view = await conflicted();
    api.fetchControllerEvent.mockResolvedValue(failure("network", "offline"));

    let result: { ok: boolean; message?: string } | undefined;
    await act(async () => {
      result = await view.result.current.discardLocalChanges();
    });

    expect(result?.ok).toBe(false);
    expect(readOutbox(EVENT_ID)?.event.name).toBe("Mine");
  });
});

describe("delete", () => {
  it("removes the event locally once the server confirms", async () => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Doomed"), 1)));
    api.deleteControllerEvent.mockResolvedValue(ok({ ok: true }));

    const view = await mounted();
    let result: { ok: boolean } | undefined;
    await act(async () => {
      result = await view.result.current.remove();
    });

    expect(result?.ok).toBe(true);
    expect(view.result.current.event).toBeNull();
    expect(readEventCache(EVENT_ID)).toBeNull();
  });

  it("treats a confirmed not_found as already deleted", async () => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Gone"), 1)));
    api.deleteControllerEvent.mockResolvedValue(failure("not_found"));

    const view = await mounted();
    let result: { ok: boolean } | undefined;
    await act(async () => {
      result = await view.result.current.remove();
    });

    expect(result?.ok).toBe(true);
    expect(readEventCache(EVENT_ID)).toBeNull();
  });

  /*
   * Every other response class. None of these confirms the event is gone, so none
   * of them may report a deletion or throw local data away.
   */
  it.each([
    "session_required",
    "wrong_event",
    "conflict",
    "rate_limited",
    "internal",
    "unavailable",
    "network",
    "invalid_request",
  ])("reports %s as a failure and keeps the event", async (code) => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Still here"), 1)));
    api.deleteControllerEvent.mockResolvedValue(failure(code, "could not delete"));

    const view = await mounted();
    act(() => view.result.current.update((current) => ({ ...current, name: "Unsaved" })));

    let result: { ok: boolean; message?: string } | undefined;
    await act(async () => {
      result = await view.result.current.remove();
    });

    expect(result?.ok).toBe(false);
    expect(result?.message).toBe("could not delete");
    // The event, its cache and its unsaved edit all survive.
    expect(view.result.current.event).not.toBeNull();
    expect(readEventCache(EVENT_ID)).not.toBeNull();
    expect(readOutbox(EVENT_ID)).not.toBeNull();
  });

  it("asks for a sign-in when the delete was refused for authorization", async () => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Still here"), 1)));
    api.deleteControllerEvent.mockResolvedValue(failure("session_required"));

    const view = await mounted();
    await act(async () => {
      await view.result.current.remove();
    });

    expect(view.result.current.status).toBe("authorization-required");
    expect(readEventCache(EVENT_ID)).not.toBeNull();
  });
});

describe("sign out", () => {
  it("clears local state once the server confirms", async () => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Open"), 1)));
    api.logoutOfEvent.mockResolvedValue(ok({ ok: true }));

    const view = await mounted();
    let result: { ok: boolean } | undefined;
    await act(async () => {
      result = await view.result.current.signOut();
    });

    expect(result?.ok).toBe(true);
    expect(view.result.current.status).toBe("authorization-required");
    expect(readEventCache(EVENT_ID)).toBeNull();
  });

  it("refuses once while unsaved work would be discarded with it", async () => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Open"), 1)));
    api.saveControllerEvent.mockImplementation(() => new Promise(() => {}));
    api.logoutOfEvent.mockResolvedValue(ok({ ok: true }));

    const view = await mounted();
    act(() => view.result.current.update((current) => ({ ...current, name: "Unsaved" })));

    let refused: { ok: boolean; message?: string } | undefined;
    await act(async () => {
      refused = await view.result.current.signOut();
    });

    expect(refused?.ok).toBe(false);
    expect(refused?.message).toMatch(/unsaved changes/i);
    expect(api.logoutOfEvent).not.toHaveBeenCalled();
    expect(readOutbox(EVENT_ID)).not.toBeNull();

    // Discarding them is an explicit second act.
    await act(async () => {
      await view.result.current.signOut({ discardUnsaved: true });
    });
    expect(api.logoutOfEvent).toHaveBeenCalled();
    expect(readOutbox(EVENT_ID)).toBeNull();
  });

  it.each(["internal", "network"])(
    "does not claim the session ended when the request failed with %s",
    async (code) => {
      api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Open"), 1)));
      api.logoutOfEvent.mockResolvedValue(failure(code, "could not sign out"));

      const view = await mounted();
      let result: { ok: boolean; message?: string } | undefined;
      await act(async () => {
        result = await view.result.current.signOut();
      });

      expect(result?.ok).toBe(false);
      expect(result?.message).toBe("could not sign out");
      expect(view.result.current.event?.name).toBe("Open");
      expect(view.result.current.status).toBe("ready");
      expect(readEventCache(EVENT_ID)).not.toBeNull();
    },
  );
});

/*
 * The races the review found. Each one is driven by an explicitly-held request
 * rather than by timing, so none of them depends on how fast the machine is.
 */
describe("a poll cannot fight this device's own save", () => {
  /* Required regression test 1. */
  it("does not conflict, duplicate, or wedge when a poll sees its own commit first", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Original"), 1)));
      const save = gate<ReturnType<typeof ok>>();
      api.saveControllerEvent.mockImplementationOnce(() => save.waited);

      const view = renderHook(() => useControllerEvent(EVENT_ID));
      await waitFor(() => expect(view.result.current.event?.name).toBe("Original"));

      // Edit A starts saving against version 1.
      act(() => view.result.current.update((current) => ({ ...current, name: "A" })));
      await waitFor(() => expect(api.saveControllerEvent).toHaveBeenCalledTimes(1));

      /*
       * The database has committed A as version 2, but the POST response has not
       * arrived. The one-second GET poll returns version 2 first — this device's own
       * commit, which the outbox still describes as expecting version 1.
       */
      api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("A"), 2)));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3300);
      });

      // No conflict was declared against our own successful write...
      expect(view.result.current.saveState).not.toBe("conflict");
      // ...and the poll did not resend the snapshot already on the wire.
      expect(api.saveControllerEvent).toHaveBeenCalledTimes(1);

      // The save response now arrives.
      await act(async () => {
        save.release(ok(payload(makeEvent("A"), 2)));
      });
      await waitFor(() => expect(view.result.current.saveState).toBe("saved"));
      expect(readOutbox(EVENT_ID)).toBeNull();

      // The coordinator is not wedged: a later edit still saves normally.
      api.saveControllerEvent.mockResolvedValue(ok(payload(makeEvent("C"), 3)));
      act(() => view.result.current.update((current) => ({ ...current, name: "C" })));
      await waitFor(() => expect(api.saveControllerEvent).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(view.result.current.saveState).toBe("saved"));
      expect(readOutbox(EVENT_ID)).toBeNull();
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  /* Required regression test 2. */
  it("discards a GET that was already in flight when an edit began", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Original"), 1)));
      const view = renderHook(() => useControllerEvent(EVENT_ID));
      await waitFor(() => expect(view.result.current.event?.name).toBe("Original"));

      // A poll starts with nothing pending, so it is allowed to run...
      const poll = gate<ReturnType<typeof ok>>();
      api.fetchControllerEvent.mockImplementation(() => poll.waited);
      api.saveControllerEvent.mockImplementation(() => new Promise(() => {}));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100);
      });

      // ...and an edit begins while it is still on the wire.
      act(() => view.result.current.update((current) => ({ ...current, name: "Mine" })));
      expect(readOutbox(EVENT_ID)?.event.name).toBe("Mine");

      // The stale GET resolves with a version the edit knows nothing about.
      await act(async () => {
        poll.release(ok(payload(makeEvent("Theirs"), 7)));
      });

      /*
       * Checking only before the request would have let this through. The generation
       * captured before the fetch no longer matches, so the response is dropped.
       */
      expect(view.result.current.event?.name).toBe("Mine");
      expect(readOutbox(EVENT_ID)?.event.name).toBe("Mine");
      expect(view.result.current.saveState).not.toBe("conflict");
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  /* Required regression test 3. */
  it("keeps one request and one loop when online and visibility both fire mid-poll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.fetchControllerEvent.mockResolvedValueOnce(ok(payload(makeEvent("Original"), 1)));
      const view = renderHook(() => useControllerEvent(EVENT_ID));
      await waitFor(() => expect(view.result.current.event?.name).toBe("Original"));

      // Hold the next poll open and count concurrency.
      let inFlight = 0;
      let maxInFlight = 0;
      const held = gate<ReturnType<typeof ok>>();
      api.fetchControllerEvent.mockImplementation(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        try {
          return await held.waited;
        } finally {
          inFlight -= 1;
        }
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100);
      });
      expect(inFlight).toBe(1);

      // Three reconciliations arrive while that request is deferred.
      await act(async () => {
        window.dispatchEvent(new Event("online"));
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("online"));
      });
      // None of them started a second request.
      expect(maxInFlight).toBe(1);

      await act(async () => {
        held.release(ok(payload(makeEvent("Original"), 1)));
      });

      /*
       * At most one coalesced follow-up ran, and only one timer survives — so the
       * steady-state request rate is unchanged. Before this, every such event
       * permanently added another loop.
       */
      expect(maxInFlight).toBe(1);
      const afterCoalesce = api.fetchControllerEvent.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100);
      });
      expect(api.fetchControllerEvent.mock.calls.length).toBe(afterCoalesce + 1);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});

/* Required regression tests 5 and 6, at the level the hook drives them. */
describe("outbox acknowledgement is revision-exact", () => {
  it("acknowledging an older revision cannot clear or renumber a newer one", async () => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Original"), 1)));
    const saveA = gate<ReturnType<typeof ok>>();
    api.saveControllerEvent.mockImplementationOnce(() => saveA.waited);

    const view = await mounted();
    act(() => view.result.current.update((current) => ({ ...current, name: "A" })));
    await waitFor(() => expect(api.saveControllerEvent).toHaveBeenCalledTimes(1));

    act(() => view.result.current.update((current) => ({ ...current, name: "B" })));
    const revisionB = readOutbox(EVENT_ID)!.revision;

    api.saveControllerEvent.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      saveA.release(ok(payload(makeEvent("A"), 2)));
    });

    const pending = readOutbox(EVENT_ID);
    expect(pending).not.toBeNull();
    expect(pending?.revision).toBe(revisionB);
    expect(pending?.event.name).toBe("B");
    expect(pending?.expectedVersion).toBe(2);
    view.unmount();
  });

  it("a failure of an older revision cannot mark a newer revision failed", async () => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Original"), 1)));
    const saveA = gate<ReturnType<typeof failure>>();
    api.saveControllerEvent.mockImplementationOnce(() => saveA.waited);

    const view = await mounted();
    act(() => view.result.current.update((current) => ({ ...current, name: "A" })));
    await waitFor(() => expect(api.saveControllerEvent).toHaveBeenCalledTimes(1));

    // B replaces A on disk while A is in flight.
    act(() => view.result.current.update((current) => ({ ...current, name: "B" })));
    const revisionB = readOutbox(EVENT_ID)!.revision;

    api.saveControllerEvent.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      saveA.release(failure("internal", "A failed"));
    });

    const pending = readOutbox(EVENT_ID);
    // B has not been attempted, so it must not be labelled failed or carry A's error.
    expect(pending?.revision).toBe(revisionB);
    expect(pending?.event.name).toBe("B");
    expect(pending?.status).toBe("pending");
    expect(pending?.lastError).toBeNull();
    view.unmount();
  });
});


/* Required regression test 2. */
describe("unsaved work is scoped to this tab", () => {
  it("keeps the outbox in sessionStorage and the acknowledged cache in localStorage", async () => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Acknowledged"), 1)));
    api.saveControllerEvent.mockImplementation(() => new Promise(() => {}));

    const view = await mounted();
    act(() => view.result.current.update((current) => ({ ...current, name: "Unsaved" })));

    const outboxKey = `aura:outbox:${EVENT_ID}`;
    const cacheKey = `aura:event:${EVENT_ID}`;

    /*
     * `sessionStorage` is per tab; `localStorage` is per origin. The unsaved edit
     * therefore cannot be seen — or overwritten — by another tab of this browser,
     * which is the whole of the isolation guarantee and the reason no lease,
     * leader or takeover mechanism exists.
     */
    expect(window.sessionStorage.getItem(outboxKey)).toContain("Unsaved");
    expect(window.localStorage.getItem(outboxKey)).toBeNull();

    // Acknowledged server state is shared, because adopting it can lose nothing.
    expect(window.localStorage.getItem(cacheKey)).toContain("Acknowledged");
    expect(window.sessionStorage.getItem(cacheKey)).toBeNull();

    // And nothing outbox-shaped was left behind in localStorage under any key.
    const sharedKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      sharedKeys.push(window.localStorage.key(index)!);
    }
    expect(sharedKeys.filter((key) => key.startsWith("aura:outbox:"))).toEqual([]);
    view.unmount();
  });

  it("survives a reload of this tab, which is what sessionStorage still guarantees", async () => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Original"), 5)));
    api.saveControllerEvent.mockImplementation(() => new Promise(() => {}));

    const first = await mounted();
    act(() => first.result.current.update((current) => ({ ...current, name: "Unsaved" })));
    first.unmount();

    // A reload is a new hook against the same tab storage, so the edit is still here.
    api.saveControllerEvent.mockReset();
    api.saveControllerEvent.mockResolvedValue(ok(payload(makeEvent("Unsaved"), 6)));
    const reloaded = await mounted();

    expect(reloaded.result.current.event?.name).toBe("Unsaved");
    await waitFor(() =>
      expect(api.saveControllerEvent).toHaveBeenCalledWith(
        EVENT_ID,
        5,
        expect.objectContaining({ name: "Unsaved" }),
      ),
    );
    reloaded.unmount();
  });
});

/* Required regression test 4. */
describe("a deliberate sync cannot race an edit either", () => {
  it("cannot overwrite, requeue, duplicate or conflict an edit that began during the mount GET", async () => {
    writeEventCache(EVENT_ID, makeEvent("Cached"), 1);
    const mountGet = gate<ReturnType<typeof ok>>();
    api.fetchControllerEvent.mockImplementation(() => mountGet.waited);
    api.saveControllerEvent.mockImplementation(() => new Promise(() => {}));

    /*
     * The cache paints and the control room is editable immediately — there is no
     * "wait for the server" state — so an edit can and does begin while the mount
     * GET is still on the wire.
     */
    const view = renderHook(() => useControllerEvent(EVENT_ID));
    await waitFor(() => expect(view.result.current.event?.name).toBe("Cached"));

    act(() => view.result.current.update((current) => ({ ...current, name: "Mine" })));
    const revision = readOutbox(EVENT_ID)!.revision;
    await waitFor(() => expect(api.saveControllerEvent).toHaveBeenCalledTimes(1));

    // The mount GET answers with a version this edit knows nothing about.
    await act(async () => {
      mountGet.release(ok(payload(makeEvent("Theirs"), 9)));
    });

    // Not overwritten...
    expect(view.result.current.event?.name).toBe("Mine");
    const pending = readOutbox(EVENT_ID);
    // ...not requeued under a new expectation, and still this edit's own revision...
    expect(pending?.revision).toBe(revision);
    expect(pending?.expectedVersion).toBe(1);
    expect(pending?.event.name).toBe("Mine");
    // ...not sent twice...
    expect(api.saveControllerEvent).toHaveBeenCalledTimes(1);
    // ...and not conflicted: the save's own response decides that.
    expect(view.result.current.saveState).not.toBe("conflict");
    view.unmount();
  });

  it("still reconciles an outbox that already existed when the sync began", async () => {
    // The counterpart to the guard above: a mount that starts with unsaved work
    // must resume it, or a reload mid-save would strand the edit forever.
    writeEventCache(EVENT_ID, makeEvent("Original"), 4);
    writeOutbox({
      eventId: EVENT_ID,
      event: makeEvent("From before the reload"),
      expectedVersion: 4,
      revision: "rev-existing",
      status: "pending",
      lastError: null,
      updatedAt: Date.now(),
    });
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Original"), 4)));
    api.saveControllerEvent.mockResolvedValue(
      ok(payload(makeEvent("From before the reload"), 5)),
    );

    const view = await mounted();

    await waitFor(() =>
      expect(api.saveControllerEvent).toHaveBeenCalledWith(
        EVENT_ID,
        4,
        expect.objectContaining({ name: "From before the reload" }),
      ),
    );
    await waitFor(() => expect(readOutbox(EVENT_ID)).toBeNull());
    expect(view.result.current.saveState).toBe("saved");
    view.unmount();
  });
});

/* Required regression test 5. */
describe("explicit failures during a poll are still acted on", () => {
  /** Starts a poll with nothing pending, then makes an edit while it is in flight. */
  async function pollingWithAnEditMidFlight() {
    api.fetchControllerEvent.mockResolvedValueOnce(ok(payload(makeEvent("Original"), 1)));
    const view = renderHook(() => useControllerEvent(EVENT_ID));
    await waitFor(() => expect(view.result.current.event?.name).toBe("Original"));

    const poll = gate<ReturnType<typeof failure>>();
    api.fetchControllerEvent.mockImplementation(() => poll.waited);
    api.saveControllerEvent.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    await waitFor(() => expect(api.fetchControllerEvent).toHaveBeenCalledTimes(2));

    // The local edit appears while the poll is on the wire.
    act(() => view.result.current.update((current) => ({ ...current, name: "Mine" })));
    expect(readOutbox(EVENT_ID)?.event.name).toBe("Mine");
    return { view, poll };
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(["session_required", "wrong_event"])(
    "enters authorization-required on %s and preserves the local work",
    async (code) => {
      const { view, poll } = await pollingWithAnEditMidFlight();

      await act(async () => {
        poll.release(failure(code));
      });

      /*
       * The post-await "yield to local work" return used to swallow this, so a
       * lapsed session during an edit left the controller writing into a void.
       */
      expect(view.result.current.status).toBe("authorization-required");
      expect(view.result.current.saveState).toBe("signed-out");
      // Nothing local is discarded for an authorization answer.
      expect(readOutbox(EVENT_ID)?.event.name).toBe("Mine");
      expect(readEventCache(EVENT_ID)?.event.name).toBe("Original");
      expect(view.result.current.hasUnsavedWork()).toBe(true);
      view.unmount();
    },
  );

  it("clears the deleted event and its outbox on an explicit not_found", async () => {
    const { view, poll } = await pollingWithAnEditMidFlight();

    await act(async () => {
      poll.release(failure("not_found"));
    });

    // The server is explicit: there is nothing left to save the edit to.
    await waitFor(() => expect(view.result.current.status).toBe("not-found"));
    expect(view.result.current.event).toBeNull();
    expect(readOutbox(EVENT_ID)).toBeNull();
    expect(readEventCache(EVENT_ID)).toBeNull();
    view.unmount();
  });

  it.each(["network", "internal", "unavailable", "rate_limited"])(
    "yields to the newer local work on a transient %s failure and keeps it intact",
    async (code) => {
      const { view, poll } = await pollingWithAnEditMidFlight();

      await act(async () => {
        poll.release(failure(code));
      });

      // A dropped connection says nothing about the event or the session.
      expect(view.result.current.status).toBe("ready");
      expect(view.result.current.event?.name).toBe("Mine");
      expect(readOutbox(EVENT_ID)?.event.name).toBe("Mine");
      expect(view.result.current.saveState).not.toBe("conflict");
      view.unmount();
    },
  );
});

/* Required regression test 6, for the controller's own deferred cache read. */
describe("queued local-cache reads are guarded too", () => {
  it("cannot paint a superseded event's cache after the hook has been torn down", async () => {
    writeEventCache(EVENT_ID, makeEvent("Cached"), 2);

    // The mount reads the cache from a microtask, so hold those and run them by hand.
    const queued: (() => void)[] = [];
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task: () => void) => {
      queued.push(task);
    });
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Server"), 3)));

    const view = renderHook(() => useControllerEvent(EVENT_ID));
    expect(queued.length).toBeGreaterThan(0);

    // The component goes away before the queued read runs.
    view.unmount();
    await act(async () => {
      for (const task of queued) task();
    });

    // Nothing was painted and nothing was fetched on behalf of a dead hook.
    expect(view.result.current.event).toBeNull();
    expect(api.fetchControllerEvent).not.toHaveBeenCalled();
  });
});

/* P0: a same-device cache adoption has to move the save coordinator with it. */
describe("adopting another tab's committed save", () => {
  it("sends the next save against the version that tab committed, not the one before", async () => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Original"), 1)));
    api.saveControllerEvent.mockResolvedValueOnce(ok(payload(makeEvent("Ours"), 2)));

    const view = await mounted();

    /*
     * A save of our own first, so the coordinator exists and holds version 2
     * internally. A lazily-created coordinator would read the ref and hide the bug.
     */
    act(() => view.result.current.update((current) => ({ ...current, name: "Ours" })));
    await waitFor(() => expect(view.result.current.saveState).toBe("saved"));
    await waitFor(() => expect(readOutbox(EVENT_ID)).toBeNull());

    // Another tab of this browser commits version 3 and notifies the device.
    api.saveControllerEvent.mockResolvedValue(ok(payload(makeEvent("Next"), 4)));
    await act(async () => {
      writeEventCache(EVENT_ID, makeEvent("From the other tab"), 3);
      notifyLocalChange(EVENT_ID);
    });
    await waitFor(() => expect(view.result.current.event?.name).toBe("From the other tab"));

    /*
     * The very next edit — before any poll has run — must be written against 3.
     * The coordinator used to keep its own copy of the version and send 2, which the
     * server refuses as a conflict this device caused itself, with nobody competing.
     */
    act(() => view.result.current.update((current) => ({ ...current, name: "Next" })));
    expect(readOutbox(EVENT_ID)?.expectedVersion).toBe(3);
    await waitFor(() =>
      expect(api.saveControllerEvent).toHaveBeenLastCalledWith(
        EVENT_ID,
        3,
        expect.objectContaining({ name: "Next" }),
      ),
    );
    await waitFor(() => expect(view.result.current.saveState).toBe("saved"));
    expect(view.result.current.saveState).not.toBe("conflict");
    view.unmount();
  });
});

/* P0: neither conflict choice may discard or overwrite a newer edit. */
describe("resolving a conflict is guarded", () => {
  /** A conflicted controller: server at version 2, "Mine" unsaved at version 1. */
  async function conflictedWithHeldRead() {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Original"), 1)));
    api.saveControllerEvent.mockResolvedValue({
      ok: false as const,
      code: "conflict",
      message: "conflict",
      payload: payload(makeEvent("Theirs"), 2),
    });

    const view = await mounted();
    act(() => view.result.current.update((current) => ({ ...current, name: "Mine" })));
    await waitFor(() => expect(view.result.current.saveState).toBe("conflict"));

    // From here the GET both choices make is under the test's control.
    const read = gate<ReturnType<typeof ok>>();
    api.fetchControllerEvent.mockImplementation(() => read.waited);
    return { view, read };
  }

  it("does not discard an edit made while the other version was loading", async () => {
    const { view, read } = await conflictedWithHeldRead();

    let outcome: { ok: boolean; message?: string } | undefined;
    await act(async () => {
      const running = view.result.current.discardLocalChanges().then((result) => {
        outcome = result;
      });
      // The control room stays editable during a resolution, so this can happen.
      view.result.current.update((current) => ({ ...current, name: "Newer" }));
      read.release(ok(payload(makeEvent("Theirs"), 2)));
      await running;
    });

    // Refused, with something the operator can act on.
    expect(outcome?.ok).toBe(false);
    expect(outcome?.message).toMatch(/choose again/i);
    /*
     * "Newer" was never the edit the operator chose to throw away, and it exists
     * nowhere else. Both the screen and the outbox still have it.
     */
    expect(view.result.current.event?.name).toBe("Newer");
    expect(readOutbox(EVENT_ID)?.event.name).toBe("Newer");
    // Nothing was adopted, so the conflict is still there to be resolved.
    expect(view.result.current.saveState).toBe("conflict");
    view.unmount();
  });

  it("still takes the other version when nothing changed underneath it", async () => {
    const { view, read } = await conflictedWithHeldRead();

    let outcome: { ok: boolean; message?: string } | undefined;
    await act(async () => {
      const running = view.result.current.discardLocalChanges().then((result) => {
        outcome = result;
      });
      read.release(ok(payload(makeEvent("Theirs"), 2)));
      await running;
    });

    expect(outcome?.ok).toBe(true);
    expect(view.result.current.event?.name).toBe("Theirs");
    expect(readOutbox(EVENT_ID)).toBeNull();
    view.unmount();
  });

  it("keeps whatever is unsaved now, including an edit made while it was loading", async () => {
    const { view, read } = await conflictedWithHeldRead();
    api.saveControllerEvent.mockResolvedValue(ok(payload(makeEvent("Newer"), 3)));

    let outcome: { ok: boolean; message?: string } | undefined;
    await act(async () => {
      const running = view.result.current.keepLocalChanges().then((result) => {
        outcome = result;
      });
      view.result.current.update((current) => ({ ...current, name: "Newer" }));
      read.release(ok(payload(makeEvent("Theirs"), 2)));
      await running;
    });

    /*
     * The documented policy: "Keep my changes" rebases the newest unsaved snapshot,
     * which is the one on screen. Rebasing the snapshot captured when the button was
     * pressed would silently undo the edit made since.
     */
    expect(outcome?.ok).toBe(true);
    expect(view.result.current.event?.name).toBe("Newer");
    expect(readOutbox(EVENT_ID)?.event.name).toBe("Newer");
    await waitFor(() =>
      expect(api.saveControllerEvent).toHaveBeenLastCalledWith(
        EVENT_ID,
        2,
        expect.objectContaining({ name: "Newer" }),
      ),
    );
    await waitFor(() => expect(readOutbox(EVENT_ID)).toBeNull());
    view.unmount();
  });

  it("refuses a second choice while the first is still loading, and says which is running", async () => {
    const { view, read } = await conflictedWithHeldRead();
    const readsBefore = api.fetchControllerEvent.mock.calls.length;

    let discarded: { ok: boolean; message?: string } | undefined;
    let kept: { ok: boolean; message?: string } | undefined;
    let discarding!: Promise<void>;
    await act(async () => {
      discarding = view.result.current.discardLocalChanges().then((result) => {
        discarded = result;
      });
      void view.result.current.keepLocalChanges().then((result) => {
        kept = result;
      });
    });

    // The second choice is refused outright rather than queued behind the first.
    expect(kept?.ok).toBe(false);
    expect(kept?.message).toMatch(/still being worked out/i);
    expect(view.result.current.conflictResolution).toBe("discard");
    // And it made no request of its own.
    expect(api.fetchControllerEvent.mock.calls.length).toBe(readsBefore + 1);

    await act(async () => {
      read.release(ok(payload(makeEvent("Theirs"), 2)));
      await discarding;
    });

    expect(discarded?.ok).toBe(true);
    expect(view.result.current.conflictResolution).toBeNull();
    expect(view.result.current.event?.name).toBe("Theirs");
    expect(readOutbox(EVENT_ID)).toBeNull();
    view.unmount();
  });

  it("ignores a repeated click that resolves after the first one applied", async () => {
    const { view, read } = await conflictedWithHeldRead();

    let first: { ok: boolean; message?: string } | undefined;
    await act(async () => {
      const running = view.result.current.discardLocalChanges().then((result) => {
        first = result;
      });
      read.release(ok(payload(makeEvent("Theirs"), 2)));
      await running;
    });
    expect(first?.ok).toBe(true);

    // A second press once the first has finished is a fresh, legitimate action —
    // there is simply nothing left to discard.
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("Theirs"), 2)));
    let second: { ok: boolean; message?: string } | undefined;
    await act(async () => {
      second = await view.result.current.discardLocalChanges();
    });

    expect(second?.ok).toBe(true);
    expect(view.result.current.event?.name).toBe("Theirs");
    expect(readOutbox(EVENT_ID)).toBeNull();
    view.unmount();
  });

  it("does nothing at all when the choice resolves after teardown", async () => {
    const { view, read } = await conflictedWithHeldRead();

    let outcome: { ok: boolean; message?: string } | undefined;
    let running!: Promise<void>;
    await act(async () => {
      running = view.result.current.discardLocalChanges().then((result) => {
        outcome = result;
      });
    });

    view.unmount();
    await act(async () => {
      read.release(ok(payload(makeEvent("Theirs"), 2)));
      await running;
    });

    expect(outcome?.ok).toBe(false);
    // The unsaved edit was not thrown away on behalf of a screen that is gone.
    expect(readOutbox(EVENT_ID)?.event.name).toBe("Mine");
  });
});

/* P1: a resumed outbox is reconciled by its own save, not by the mount read. */
describe("resuming a pre-existing outbox", () => {
  it("leaves the resumed save's own response to reconcile it", async () => {
    // A reload, mid-save: revision R for version 1 is already in this tab's outbox.
    writeEventCache(EVENT_ID, makeEvent("Original"), 1);
    writeOutbox({
      eventId: EVENT_ID,
      event: makeEvent("Resumed"),
      expectedVersion: 1,
      revision: "rev-resumed",
      status: "pending",
      lastError: null,
      updatedAt: Date.now(),
    });

    const put = gate<ReturnType<typeof ok>>();
    api.saveControllerEvent.mockImplementation(() => put.waited);
    const get = gate<ReturnType<typeof ok>>();
    api.fetchControllerEvent.mockImplementation(() => get.waited);

    const view = renderHook(() => useControllerEvent(EVENT_ID));
    // Mount resumes the outbox before its GET has answered, by design.
    await waitFor(() =>
      expect(api.saveControllerEvent).toHaveBeenCalledWith(
        EVENT_ID,
        1,
        expect.objectContaining({ name: "Resumed" }),
      ),
    );

    /*
     * The GET now returns the version that very PUT created. `sync` lets a
     * pre-existing revision through — that is how a reload resumes — so without the
     * coordinator check this declared a conflict against this tab's own successful
     * save, or sent the same snapshot a second time.
     */
    await act(async () => {
      get.release(ok(payload(makeEvent("Resumed"), 2)));
    });

    expect(view.result.current.saveState).not.toBe("conflict");
    expect(api.saveControllerEvent).toHaveBeenCalledTimes(1);
    expect(readOutbox(EVENT_ID)?.revision).toBe("rev-resumed");

    // The PUT's own 200 is what settles it.
    await act(async () => {
      put.release(ok(payload(makeEvent("Resumed"), 2)));
    });
    await waitFor(() => expect(readOutbox(EVENT_ID)).toBeNull());
    await waitFor(() => expect(view.result.current.saveState).toBe("saved"));

    // And the coordinator is not wedged: later edits still save, against version 2.
    api.saveControllerEvent.mockReset();
    api.saveControllerEvent.mockResolvedValue(ok(payload(makeEvent("Later"), 3)));
    act(() => view.result.current.update((current) => ({ ...current, name: "Later" })));
    await waitFor(() =>
      expect(api.saveControllerEvent).toHaveBeenCalledWith(
        EVENT_ID,
        2,
        expect.objectContaining({ name: "Later" }),
      ),
    );
    await waitFor(() => expect(view.result.current.saveState).toBe("saved"));
    view.unmount();
  });
});

/* P1: a change of event id must not inherit anything from the previous event. */
describe("changing the event id", () => {
  const EVENT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  function eventB(name = "B event") {
    return makeEvent(name, {
      id: EVENT_B,
      viewerToken: "77777777-8888-4999-8aaa-bbbbbbbbbbbb",
    });
  }

  it("clears the previous event from the screen immediately", async () => {
    const held = gate<ReturnType<typeof ok>>();
    api.fetchControllerEvent.mockImplementation((id: string) =>
      id === EVENT_ID ? Promise.resolve(ok(payload(makeEvent("A event"), 1))) : held.waited,
    );

    const view = renderHook(({ id }) => useControllerEvent(id), {
      initialProps: { id: EVENT_ID },
    });
    await waitFor(() => expect(view.result.current.event?.name).toBe("A event"));

    // B is not cached on this device and its read is still in flight.
    view.rerender({ id: EVENT_B });

    await waitFor(() => expect(view.result.current.status).toBe("loading"));
    expect(view.result.current.event).toBeNull();
    expect(view.result.current.loginName).toBe("");

    await act(async () => {
      held.release(ok(payload(eventB(), 7)));
    });
    expect(view.result.current.event?.id).toBe(EVENT_B);
    view.unmount();
  });

  it("does not let the previous event's in-flight save touch the new one", async () => {
    api.fetchControllerEvent.mockImplementation((id: string) =>
      Promise.resolve(
        id === EVENT_ID ? ok(payload(makeEvent("A event"), 1)) : ok(payload(eventB(), 7)),
      ),
    );
    const saveA = gate<ReturnType<typeof ok>>();
    api.saveControllerEvent.mockImplementation((id: string) =>
      id === EVENT_ID ? saveA.waited : Promise.resolve(ok(payload(eventB("B edited"), 8))),
    );

    const view = renderHook(({ id }) => useControllerEvent(id), {
      initialProps: { id: EVENT_ID },
    });
    await waitFor(() => expect(view.result.current.event?.name).toBe("A event"));

    act(() => view.result.current.update((current) => ({ ...current, name: "A edited" })));
    await waitFor(() =>
      expect(api.saveControllerEvent).toHaveBeenCalledWith(
        EVENT_ID,
        1,
        expect.objectContaining({ name: "A edited" }),
      ),
    );

    // The hook is pointed at another event while A's save is still on the wire.
    view.rerender({ id: EVENT_B });
    await waitFor(() => expect(view.result.current.event?.name).toBe("B event"));
    expect(view.result.current.saveState).toBe("idle");

    // A's save lands late, committing A's version 2.
    await act(async () => {
      saveA.release(ok(payload(makeEvent("A edited"), 2)));
    });

    // B's screen and save state are untouched by a report about another event.
    expect(view.result.current.event?.name).toBe("B event");
    expect(view.result.current.saveState).toBe("idle");
    // A's own cache and outbox are still settled properly by that response.
    expect(readEventCache(EVENT_ID)?.version).toBe(2);
    expect(readOutbox(EVENT_ID)).toBeNull();

    /*
     * And B writes with B's version. Sharing a coordinator, or letting A's
     * acknowledgement write the shared version ref, sent B's document with 2.
     */
    act(() => view.result.current.update((current) => ({ ...current, name: "B edited" })));
    expect(readOutbox(EVENT_B)?.expectedVersion).toBe(7);
    await waitFor(() =>
      expect(api.saveControllerEvent).toHaveBeenLastCalledWith(
        EVENT_B,
        7,
        expect.objectContaining({ name: "B edited" }),
      ),
    );
    await waitFor(() => expect(view.result.current.saveState).toBe("saved"));
    view.unmount();
  });

  it("does not let the previous event's in-flight read paint the new one", async () => {
    const readA = gate<ReturnType<typeof ok>>();
    api.fetchControllerEvent.mockImplementation((id: string) =>
      id === EVENT_ID ? readA.waited : Promise.resolve(ok(payload(eventB(), 7))),
    );
    api.saveControllerEvent.mockResolvedValue(ok(payload(eventB("B edited"), 8)));

    const view = renderHook(({ id }) => useControllerEvent(id), {
      initialProps: { id: EVENT_ID },
    });
    await waitFor(() => expect(api.fetchControllerEvent).toHaveBeenCalledWith(EVENT_ID));

    view.rerender({ id: EVENT_B });
    await waitFor(() => expect(view.result.current.event?.name).toBe("B event"));

    await act(async () => {
      readA.release(ok(payload(makeEvent("A event"), 3)));
    });

    expect(view.result.current.event?.id).toBe(EVENT_B);
    expect(view.result.current.event?.name).toBe("B event");

    act(() => view.result.current.update((current) => ({ ...current, name: "B edited" })));
    await waitFor(() =>
      expect(api.saveControllerEvent).toHaveBeenLastCalledWith(
        EVENT_B,
        7,
        expect.objectContaining({ name: "B edited" }),
      ),
    );
    view.unmount();
  });

  it("does not let a conflict choice for the previous event apply to the new one", async () => {
    api.fetchControllerEvent.mockResolvedValue(ok(payload(makeEvent("A event"), 1)));
    api.saveControllerEvent.mockResolvedValue({
      ok: false as const,
      code: "conflict",
      message: "conflict",
      payload: payload(makeEvent("Theirs"), 2),
    });

    const view = renderHook(({ id }) => useControllerEvent(id), {
      initialProps: { id: EVENT_ID },
    });
    await waitFor(() => expect(view.result.current.event?.name).toBe("A event"));
    act(() => view.result.current.update((current) => ({ ...current, name: "Mine" })));
    await waitFor(() => expect(view.result.current.saveState).toBe("conflict"));

    const read = gate<ReturnType<typeof ok>>();
    api.fetchControllerEvent.mockImplementation((id: string) =>
      id === EVENT_ID ? read.waited : Promise.resolve(ok(payload(eventB(), 7))),
    );

    let outcome: { ok: boolean; message?: string } | undefined;
    let running!: Promise<void>;
    await act(async () => {
      running = view.result.current.discardLocalChanges().then((result) => {
        outcome = result;
      });
    });

    view.rerender({ id: EVENT_B });
    await waitFor(() => expect(view.result.current.event?.name).toBe("B event"));

    await act(async () => {
      read.release(ok(payload(makeEvent("Theirs"), 2)));
      await running;
    });

    expect(outcome?.ok).toBe(false);
    // Neither adopted onto B's screen, nor A's unsaved edit discarded behind its back.
    expect(view.result.current.event?.name).toBe("B event");
    expect(view.result.current.conflictResolution).toBeNull();
    expect(readOutbox(EVENT_ID)?.event.name).toBe("Mine");
    view.unmount();
  });
});
