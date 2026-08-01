import { beforeEach, describe, expect, it } from "vitest";
import type { TimerEvent } from "@/lib/types";
import {
  createOutboxStore,
  makeOutboxRevision,
  readEventCache,
  readOutbox,
  writeEventCache,
  writeOutbox,
  type OutboxEntry,
} from "@/lib/controller/persistence";

/*
 * Where unsaved work lives, and why no tab can touch another tab's copy of it.
 *
 * The product decision this pins down: multiple controllers may edit the same
 * event at once, and nothing coordinates them. Cloud conflicts are settled by the
 * database's version check; same-browser conflicts are prevented by giving each
 * tab its own outbox, which is what `sessionStorage` is. There is deliberately no
 * mechanism by which one tab can settle, fail, clear or overwrite another's entry
 * — these tests hold two stores at once and prove there is no such path.
 */

const EVENT_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_EVENT_ID = "99999999-8888-4777-8666-555555555555";

function makeEvent(name: string, id = EVENT_ID): TimerEvent {
  return {
    id,
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
  };
}

/**
 * One tab's storage area. jsdom gives the whole test file a single
 * `sessionStorage`, so two independent instances are the only honest way to model
 * two tabs of one browser.
 */
function tabStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, String(value)),
  } as Storage;
}

function entry(name: string, overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    eventId: EVENT_ID,
    event: makeEvent(name),
    expectedVersion: 1,
    revision: makeOutboxRevision(),
    status: "pending",
    lastError: null,
    updatedAt: 0,
    ...overrides,
  };
}

/** Two tabs of one browser, each with the storage a real tab would have. */
let storageA: Storage;
let storageB: Storage;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  storageA = tabStorage();
  storageB = tabStorage();
});

/* Required regression test 2. */
describe("what goes where", () => {
  it("puts the outbox in sessionStorage and the acknowledged cache in localStorage", () => {
    writeEventCache(EVENT_ID, makeEvent("Acknowledged"), 3);
    writeOutbox(entry("Unsaved"));

    expect(window.sessionStorage.getItem(`aura:outbox:${EVENT_ID}`)).toContain("Unsaved");
    expect(window.localStorage.getItem(`aura:outbox:${EVENT_ID}`)).toBeNull();

    expect(window.localStorage.getItem(`aura:event:${EVENT_ID}`)).toContain("Acknowledged");
    expect(window.sessionStorage.getItem(`aura:event:${EVENT_ID}`)).toBeNull();

    // Both are still readable through the helpers, from the right place each.
    expect(readOutbox(EVENT_ID)?.event.name).toBe("Unsaved");
    expect(readEventCache(EVENT_ID)?.event.name).toBe("Acknowledged");
  });

  it("keeps a reload's worth of durability, which is what sessionStorage provides", () => {
    writeOutbox(entry("Unsaved", { revision: "rev-one" }));

    // A reload is the same tab reading the same storage back.
    expect(readOutbox(EVENT_ID)?.revision).toBe("rev-one");
  });
});

/* Required regression test 3. */
describe("two tabs of one browser", () => {
  it("cannot see one another's unsaved work at all", () => {
    const tabA = createOutboxStore(() => storageA);
    const tabB = createOutboxStore(() => storageB);

    tabA.write(entry("From A", { revision: "rev-a" }));
    tabB.write(entry("From B", { revision: "rev-b" }));

    expect(tabA.read(EVENT_ID)?.event.name).toBe("From A");
    expect(tabB.read(EVENT_ID)?.event.name).toBe("From B");
    // Neither write went anywhere near the other, so neither was overwritten.
    expect(tabA.read(EVENT_ID)?.revision).toBe("rev-a");
    expect(tabB.read(EVENT_ID)?.revision).toBe("rev-b");
  });

  it("cannot settle one another's entry when a save is acknowledged", () => {
    const tabA = createOutboxStore(() => storageA);
    const tabB = createOutboxStore(() => storageB);
    tabA.write(entry("From A", { revision: "rev-a" }));
    tabB.write(entry("From B", { revision: "rev-b", expectedVersion: 1 }));

    // A's save is acknowledged as version 2 and clears A's entry.
    expect(tabA.settle(EVENT_ID, "rev-a", 2)).toBeNull();
    expect(tabA.read(EVENT_ID)).toBeNull();

    /*
     * B's entry is untouched — not cleared, not renumbered, and not advanced to a
     * version it never read. B will learn about version 2 the only legitimate way:
     * its own save comes back as a 409.
     */
    expect(tabB.read(EVENT_ID)).toEqual(
      expect.objectContaining({ revision: "rev-b", expectedVersion: 1, status: "pending" }),
    );
  });

  it("cannot mark one another's entry failed", () => {
    const tabA = createOutboxStore(() => storageA);
    const tabB = createOutboxStore(() => storageB);
    tabA.write(entry("From A", { revision: "rev-a" }));
    tabB.write(entry("From B", { revision: "rev-b" }));

    tabA.markFailed(EVENT_ID, "rev-a", "A could not save");

    expect(tabA.read(EVENT_ID)?.status).toBe("failed");
    // B has not been attempted, so it is neither failed nor carrying A's error.
    expect(tabB.read(EVENT_ID)?.status).toBe("pending");
    expect(tabB.read(EVENT_ID)?.lastError).toBeNull();
  });

  it("cannot clear one another's entry", () => {
    const tabA = createOutboxStore(() => storageA);
    const tabB = createOutboxStore(() => storageB);
    tabA.write(entry("From A", { revision: "rev-a" }));
    tabB.write(entry("From B", { revision: "rev-b" }));

    tabA.clear(EVENT_ID);

    expect(tabA.read(EVENT_ID)).toBeNull();
    expect(tabB.read(EVENT_ID)?.event.name).toBe("From B");
  });

  it("does not list one another's events, so neither can retry the other's work", () => {
    const tabA = createOutboxStore(() => storageA);
    const tabB = createOutboxStore(() => storageB);
    tabA.write(entry("From A"));
    tabB.write(entry("From B", { eventId: OTHER_EVENT_ID, event: makeEvent("From B", OTHER_EVENT_ID) }));

    expect(tabA.listEventIds()).toEqual([EVENT_ID]);
    expect(tabB.listEventIds()).toEqual([OTHER_EVENT_ID]);
  });
});

/*
 * Within one tab the revision rules are unchanged: equality means identity, and
 * an acknowledgement of one edit never disturbs a different one.
 */
describe("revision identity within a tab", () => {
  it("clears only the exact revision the server acknowledged", () => {
    const tab = createOutboxStore(() => storageA);
    tab.write(entry("A", { revision: "rev-a" }));

    expect(tab.settle(EVENT_ID, "rev-a", 2)).toBeNull();
    expect(tab.read(EVENT_ID)).toBeNull();
  });

  it("keeps a newer edit and advances its expectation instead", () => {
    const tab = createOutboxStore(() => storageA);
    tab.write(entry("B", { revision: "rev-b", expectedVersion: 1 }));

    // The acknowledged revision is A, which B has already replaced on disk.
    const outstanding = tab.settle(EVENT_ID, "rev-a", 2);

    expect(outstanding?.revision).toBe("rev-b");
    expect(outstanding?.expectedVersion).toBe(2);
    expect(tab.read(EVENT_ID)?.event.name).toBe("B");
  });

  it("marks failed only the revision that was actually attempted", () => {
    const tab = createOutboxStore(() => storageA);
    tab.write(entry("B", { revision: "rev-b" }));

    tab.markFailed(EVENT_ID, "rev-a", "an older attempt failed");

    expect(tab.read(EVENT_ID)?.status).toBe("pending");
    expect(tab.read(EVENT_ID)?.lastError).toBeNull();
  });

  it("mints revisions that cannot collide with anything already stored", () => {
    const first = makeOutboxRevision();
    const second = makeOutboxRevision();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThan(8);
    // Never a counter: an empty outbox used to restart the sequence at 1.
    expect([first, second]).not.toContain("1");
  });
});
