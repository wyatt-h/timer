// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * A structural guard for a product decision, because "we did not build this" is
 * not testable from behaviour.
 *
 * Multiple controllers may edit one event at the same time. Every controller stays
 * editable, every timer control and keyboard shortcut stays live, and conflicts are
 * resolved where the authority actually is: the database's optimistic version
 * check, which makes the first valid save win and answers a stale one with a 409
 * carrying the winning state.
 *
 * A writer lease existed here briefly. It made one tab of a browser read-only and
 * offered a "take control" button, and it brought ownership, heartbeats, stale
 * detection, takeover and a handover of another tab's unsaved work with it — a
 * coordination protocol, plus a mode in which the operator's controls do not work,
 * for a case that is rare and already handled. It was removed, and this test fails
 * if any of it comes back: no lease, no leader, no tab ownership, no Web Locks, no
 * heartbeat, and no read-only controller.
 *
 * Per-tab isolation of *unsaved* work is still guaranteed — by `sessionStorage`,
 * which is the browser's own boundary and requires no protocol at all.
 */

const SOURCE_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = `${directory}/${entry}`;
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry)) return [];
    // This file necessarily names everything it is looking for.
    if (path.endsWith("no-tab-ownership.test.ts")) return [];
    return [path];
  });
}

const FILES = sourceFiles(SOURCE_ROOT).map((path) => ({
  path: path.slice(SOURCE_ROOT.length),
  source: readFileSync(path, "utf8"),
}));

function offenders(pattern: RegExp) {
  return FILES.filter(({ source }) => pattern.test(source)).map((file) => file.path);
}

describe("no tab ownership anywhere", () => {
  it("scans a meaningful number of source files", () => {
    // Guards the guard: a broken walk would silently pass everything below.
    expect(FILES.length).toBeGreaterThan(40);
  });

  it("keeps no writer-lease module or test", () => {
    expect(FILES.map((file) => file.path).filter((path) => /lease|writer-/i.test(path))).toEqual(
      [],
    );
  });

  it("names no lease, ownership or takeover concept", () => {
    expect(offenders(/claimLease|refreshLease|releaseLease|stealLease|writerLease/)).toEqual([]);
    expect(offenders(/aura:writer|HEARTBEAT_MS|heartbeatAt|makeTabId/)).toEqual([]);
    expect(offenders(/\btakeControl\b|Take control/)).toEqual([]);
  });

  it("exposes no read-only controller state", () => {
    // `canEdit` was the flag that turned the control room into a spectator.
    expect(offenders(/\bcanEdit\b|onTakeControl/)).toEqual([]);
    expect(offenders(/another tab is controlling/i)).toEqual([]);
  });

  it("uses no Web Locks, leader election or cross-tab lease coordination", () => {
    expect(offenders(/navigator\.locks|requestPermission\(\s*["']locks/)).toEqual([]);
    expect(offenders(/\bleaderElection\b|\bbecomeLeader\b|\bisLeader\b/)).toEqual([]);
  });

  it("keeps unsaved work in sessionStorage and nothing else there", () => {
    const persistence = FILES.find(({ path }) =>
      path.endsWith("lib/controller/persistence.ts"),
    )!;
    // The outbox prefix is written through the tab-scoped source, and only that.
    expect(persistence.source).toContain("window.sessionStorage");
    expect(persistence.source).toContain("createOutboxStore(tabStorage)");

    // No other module reaches for sessionStorage, so there is one tab-scoped store.
    const users = FILES.filter(
      ({ path, source }) =>
        /(window|globalThis)\.sessionStorage|\bsessionStorage\.(getItem|setItem|removeItem|key|clear)/.test(
          source,
        ) && !path.endsWith("lib/controller/persistence.ts"),
    )
      // Tests are allowed to assert on where things went.
      .filter(({ path }) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"))
      .map((file) => file.path);
    expect(users).toEqual([]);
  });

  it("leaves every timer control available to every authorized controller", () => {
    const controlRoom = FILES.find(({ path }) => path.endsWith("components/control-room.tsx"))!;
    /*
     * The shortcut handler and the control buttons must not be gated on anything
     * resembling permission to edit. A `disabled` bound to ownership was exactly
     * the read-only mode this decision removed.
     */
    expect(/disabled=\{!?\s*(canEdit|owns|isOwner|hasControl)/.test(controlRoom.source)).toBe(
      false,
    );
    expect(/if\s*\(!\s*(canEdit|owns|isOwner|hasControl)\s*\)/.test(controlRoom.source)).toBe(
      false,
    );
  });

  it("still resolves conflicts with the server's version, and offers both choices", () => {
    const hook = FILES.find(({ path }) => path.endsWith("controller/use-controller-event.ts"))!;
    expect(hook.source).toContain("markConflict");
    expect(hook.source).toContain("discardLocalChanges");
    expect(hook.source).toContain("keepLocalChanges");

    const controlRoom = FILES.find(({ path }) => path.endsWith("components/control-room.tsx"))!;
    expect(controlRoom.source).toContain("Use the other version");
    expect(controlRoom.source).toContain("Keep my changes");
    /*
     * Both choices read the server before they change anything, and the hook refuses
     * a second one while the first is in flight — so the buttons have to say so
     * rather than silently swallowing the press.
     */
    expect(controlRoom.source).toContain("disabled={conflictResolution !== null}");
  });
});
