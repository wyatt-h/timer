import { beforeEach, describe, expect, it } from "vitest";
import { SaveCoordinator, type SaveOutcome, type SaveState } from "@/lib/save-coordinator";
import type { TimerEvent } from "@/lib/types";

/** Lets every pending microtask and promise continuation run. */
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A promise the test releases when it wants an in-flight save to finish. */
function gate() {
  let release!: () => void;
  const waited = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { waited, release };
}

/*
 * Timers are injected rather than faked globally, so each test drives the clock
 * itself and nothing depends on real elapsed time.
 */
function makeClock() {
  const pending = new Map<number, { run: () => void; at: number }>();
  let handle = 0;
  let now = 0;

  return {
    setTimer(run: () => void, delay: number) {
      handle += 1;
      pending.set(handle, { run, at: now + delay });
      return handle;
    },
    clearTimer(id: number) {
      pending.delete(id);
    },
    /** Runs everything due at or before `now + by`, in scheduled order. */
    async advance(by: number) {
      now += by;
      const due = [...pending.entries()]
        .filter(([, entry]) => entry.at <= now)
        .sort((a, b) => a[1].at - b[1].at);
      for (const [id, entry] of due) {
        pending.delete(id);
        entry.run();
        // Let the awaited save settle before the next timer fires.
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      }
    },
    get scheduled() {
      return pending.size;
    },
  };
}

function event(name: string): TimerEvent {
  return {
    id: "11111111-2222-4333-8444-555555555555",
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
          {
            id: "cccccccc-dddd-4eee-8fff-000000000000",
            name: "Speaker",
            durationSeconds: 600,
          },
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
  };
}

type Harness = {
  coordinator: SaveCoordinator;
  clock: ReturnType<typeof makeClock>;
  states: SaveState[];
  saved: string[];
  conflicts: number;
  signedOut: number;
};

function harness(
  respond: (name: string, attempt: number) => SaveOutcome | Promise<SaveOutcome>,
  debounceMs = 200,
): Harness {
  const clock = makeClock();
  const states: SaveState[] = [];
  const saved: string[] = [];
  const result: Partial<Harness> = { conflicts: 0, signedOut: 0 };
  let attempt = 0;

  const coordinator = new SaveCoordinator(0, {
    save: async (candidate) => {
      attempt += 1;
      saved.push(candidate.name);
      return respond(candidate.name, attempt);
    },
    onState: (state) => states.push(state),
    onConflict: () => {
      result.conflicts = (result.conflicts ?? 0) + 1;
    },
    onSignedOut: () => {
      result.signedOut = (result.signedOut ?? 0) + 1;
    },
    debounceMs,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });

  return {
    coordinator,
    clock,
    states,
    saved,
    get conflicts() {
      return result.conflicts ?? 0;
    },
    get signedOut() {
      return result.signedOut ?? 0;
    },
  } as Harness;
}

let version = 0;
beforeEach(() => {
  version = 0;
});

const acceptEverything = (): SaveOutcome => {
  version += 1;
  return { status: "saved", version };
};

describe("coalescing", () => {
  it("sends only the newest snapshot of a burst of edits", async () => {
    const test = harness(acceptEverything);

    test.coordinator.queue(event("A"), "rev-1");
    test.coordinator.queue(event("AB"), "rev-2");
    test.coordinator.queue(event("ABC"), "rev-3");
    await test.clock.advance(200);

    // One request for three keystrokes, carrying the last value typed.
    expect(test.saved).toEqual(["ABC"]);
    expect(test.coordinator.currentState).toBe("saved");
  });

  it("does not send anything before the debounce elapses", async () => {
    const test = harness(acceptEverything);

    test.coordinator.queue(event("A"), "rev-4");
    await test.clock.advance(100);

    expect(test.saved).toEqual([]);
    expect(test.coordinator.currentState).toBe("saving");
  });

  it("skips the debounce when asked to flush", async () => {
    const test = harness(acceptEverything);

    test.coordinator.queue(event("A"), "rev-5");
    test.coordinator.flush();
    await test.clock.advance(0);

    expect(test.saved).toEqual(["A"]);
  });
});

describe("ordering", () => {
  it("never runs two requests at once", async () => {
    let inFlight = 0;
    let overlapped = false;
    const test = harness(async () => {
      inFlight += 1;
      if (inFlight > 1) overlapped = true;
      await Promise.resolve();
      inFlight -= 1;
      version += 1;
      return { status: "saved", version };
    });

    test.coordinator.queue(event("first"), "rev-6");
    await test.clock.advance(200);
    test.coordinator.queue(event("second"), "rev-7");
    await test.clock.advance(200);

    expect(overlapped).toBe(false);
    expect(test.saved).toEqual(["first", "second"]);
  });

  it("does not let an older response mark newer state as saved", async () => {
    const first = gate();
    const test = harness(async (name) => {
      if (name === "first") await first.waited;
      version += 1;
      return { status: "saved", version };
    });

    test.coordinator.queue(event("first"), "rev-8");
    await test.clock.advance(200);
    expect(test.saved).toEqual(["first"]);

    // An edit arrives while the first save is still in flight.
    test.coordinator.queue(event("second"), "rev-9");
    first.release();
    await settle();

    /*
     * The first save has landed, but the state it saved is no longer the newest,
     * so nothing may claim to be saved yet.
     */
    expect(test.coordinator.currentState).not.toBe("saved");

    await test.clock.advance(0);
    expect(test.saved).toEqual(["first", "second"]);
    expect(test.coordinator.currentState).toBe("saved");
  });

  it("sends the version the server last returned", async () => {
    const seen: number[] = [];
    const clock = makeClock();
    const coordinator = new SaveCoordinator(7, {
      save: async (_event, sentVersion) => {
        seen.push(sentVersion);
        return { status: "saved", version: sentVersion + 1 };
      },
      onState: () => {},
      onConflict: () => {},
      onSignedOut: () => {},
      debounceMs: 10,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });

    coordinator.queue(event("one"), "rev-10");
    await clock.advance(10);
    coordinator.queue(event("two"), "rev-11");
    await clock.advance(10);

    expect(seen).toEqual([7, 8]);
    expect(coordinator.currentVersion).toBe(9);
  });
});

describe("failures", () => {
  it("retries a transient failure with growing delays and keeps the snapshot", async () => {
    const test = harness((name, attempt) =>
      attempt < 3 ? { status: "offline" } : { status: "saved", version: 1 },
    );

    test.coordinator.queue(event("держится"), "rev-12");
    await test.clock.advance(200);
    expect(test.coordinator.currentState).toBe("offline");

    await test.clock.advance(500);
    expect(test.saved).toHaveLength(2);

    await test.clock.advance(1000);
    expect(test.saved).toEqual(["держится", "держится", "держится"]);
    expect(test.coordinator.currentState).toBe("saved");
  });

  it("gives up after a bounded number of attempts rather than retrying forever", async () => {
    const test = harness(() => ({ status: "offline" }));

    test.coordinator.queue(event("offline"), "rev-13");
    await test.clock.advance(200);
    for (let step = 0; step < 12; step += 1) await test.clock.advance(8_000);

    // Six retries after the first attempt, then it stops and stays honest.
    expect(test.saved).toHaveLength(7);
    expect(test.clock.scheduled).toBe(0);
    expect(test.coordinator.currentState).toBe("offline");
  });

  it("retries on demand after it has given up", async () => {
    let allow = false;
    const test = harness(() => (allow ? { status: "saved", version: 1 } : { status: "offline" }));

    test.coordinator.queue(event("offline"), "rev-14");
    await test.clock.advance(200);
    for (let step = 0; step < 12; step += 1) await test.clock.advance(8_000);
    expect(test.coordinator.currentState).toBe("offline");

    allow = true;
    test.coordinator.retry();
    await test.clock.advance(0);
    expect(test.coordinator.currentState).toBe("saved");
  });

  it("stops on a conflict instead of pushing stale state again", async () => {
    const test = harness(() => ({ status: "conflict", payload: null }));

    test.coordinator.queue(event("mine"), "rev-15");
    await test.clock.advance(200);

    expect(test.coordinator.currentState).toBe("conflict");
    expect(test.conflicts).toBe(1);

    // Further edits are dropped until the authoritative state has been adopted.
    test.coordinator.queue(event("mine again"), "rev-16");
    await test.clock.advance(1000);
    expect(test.saved).toEqual(["mine"]);
  });

  it("resumes at the server's version once the conflict is resolved", async () => {
    let conflict = true;
    const seen: number[] = [];
    const clock = makeClock();
    const coordinator = new SaveCoordinator(1, {
      save: async (_event, sentVersion) => {
        seen.push(sentVersion);
        if (conflict) return { status: "conflict", payload: null };
        return { status: "saved", version: sentVersion + 1 };
      },
      onState: () => {},
      onConflict: () => {},
      onSignedOut: () => {},
      debounceMs: 10,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });

    coordinator.queue(event("stale"), "rev-17");
    await clock.advance(10);
    expect(seen).toEqual([1]);

    conflict = false;
    coordinator.resume(9);
    coordinator.queue(event("fresh"), "rev-18");
    await clock.advance(10);

    expect(seen).toEqual([1, 9]);
    expect(coordinator.currentState).toBe("saved");
  });

  it("stops and reports a lost session", async () => {
    const test = harness(() => ({ status: "signed-out" }));

    test.coordinator.queue(event("orphan"), "rev-19");
    await test.clock.advance(200);

    expect(test.coordinator.currentState).toBe("signed-out");
    expect(test.signedOut).toBe(1);
  });

  it("gives a rejected document its own state, not Offline", async () => {
    const test = harness(() => ({ status: "rejected" }));

    test.coordinator.queue(event("bad"), "rev-20");
    await test.clock.advance(200);

    expect(test.states).not.toContain("saved");
    /*
     * Calling this "Offline" told an operator to wait for a connection that was
     * never the problem. Retrying the same bytes cannot help, so the loop stops
     * and says so.
     */
    expect(test.coordinator.currentState).toBe("rejected");
    expect(test.states).not.toContain("offline");
    expect(test.coordinator.isHalted).toBe(true);
  });

  it("treats a thrown save as a transient failure", async () => {
    const test = harness((_name, attempt) => {
      if (attempt === 1) throw new Error("boom");
      return { status: "saved", version: 1 };
    });

    test.coordinator.queue(event("thrower"), "rev-21");
    await test.clock.advance(200);
    expect(test.coordinator.currentState).toBe("offline");

    await test.clock.advance(500);
    expect(test.coordinator.currentState).toBe("saved");
  });
});

describe("lifecycle", () => {
  it("cancels pending work when disposed", async () => {
    const test = harness(acceptEverything);

    test.coordinator.queue(event("abandoned"), "rev-22");
    test.coordinator.dispose();
    await test.clock.advance(1000);

    expect(test.saved).toEqual([]);
  });

  it("reports each state change once", async () => {
    const test = harness(acceptEverything);

    test.coordinator.queue(event("A"), "rev-23");
    await test.clock.advance(200);

    expect(test.states).toEqual(["saving", "saved"]);
  });

  it("does not send a save for the ticking display clock", async () => {
    // The coordinator only ever sends what is queued, and a 200 ms visual tick is
    // never queued, so five seconds of ticking costs no requests at all.
    const test = harness(acceptEverything);
    await test.clock.advance(5_000);
    expect(test.saved).toEqual([]);
    expect(test.clock.scheduled).toBe(0);
  });
});
