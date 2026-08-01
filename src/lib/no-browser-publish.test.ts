// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * A structural guard, because this one is not testable from behaviour.
 *
 * Supabase Broadcast channels are public: any client that can subscribe to one can
 * also publish on it. A channel named after an event's viewer token is therefore
 * writable by anybody holding an audience link, which would let them
 *
 *  - push a fabricated timer to every audience and Zoom screen watching,
 *  - announce an enormous version number and make authenticated controllers refetch
 *    in a loop,
 *  - and read whatever a controller published on it, including the Zoom pairing
 *    code.
 *
 * So no browser code publishes anything. Controllers poll their authenticated
 * endpoint, audience displays poll `get_public_event`, and the Zoom App polls
 * `get_zoom_event`; the database is the only thing that can answer. This test fails
 * if a `.channel(...)`, a `.send(...)`, or a `broadcast` subscription reappears
 * anywhere in the client.
 *
 * A private-channel design could be safe later, but only with receive-only
 * authorization, short-lived event-scoped credentials, and publishing done solely
 * on the server. None of that exists yet, so none of this is allowed yet.
 */

const SOURCE_ROOT = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = `${directory}/${entry}`;
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry)) return [];
    // This file necessarily names the forbidden calls in order to look for them.
    if (path.endsWith("no-browser-publish.test.ts")) return [];
    return [path];
  });
}

function relative(path: string) {
  return path.slice(SOURCE_ROOT.length);
}

const FILES = sourceFiles(SOURCE_ROOT).map((path) => ({
  path: relative(path),
  source: readFileSync(path, "utf8"),
}));

describe("no browser code publishes authoritative state", () => {
  it("scans a meaningful number of source files", () => {
    // Guards the guard: a broken walk would silently pass everything below.
    expect(FILES.length).toBeGreaterThan(40);
  });

  it("opens no Supabase Realtime channel anywhere", () => {
    const offenders = FILES.filter(({ source }) => /\.channel\s*\(/.test(source));
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it("sends nothing on a Supabase channel", () => {
    const offenders = FILES.filter(({ source }) =>
      /channel[\w.]*\.send\s*\(|\.send\s*\(\s*\{\s*type:\s*["']broadcast/.test(source),
    );
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it("subscribes to no broadcast event", () => {
    const offenders = FILES.filter(({ source }) =>
      /["']broadcast["']|removeChannel\s*\(/.test(source),
    );
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it("keeps no realtime module behind", () => {
    const offenders = FILES.filter(
      ({ path }) => path.includes("realtime") || path.includes("broadcastEventState"),
    );
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it("still uses the local BroadcastChannel for same-device tabs", () => {
    /*
     * Deliberately kept. `window.BroadcastChannel` is a browser-local API between
     * tabs of one device — unrelated to Supabase Broadcast, and reachable by
     * nobody else.
     */
    const persistence = FILES.find(({ path }) =>
      path.endsWith("lib/controller/persistence.ts"),
    );
    expect(persistence?.source).toContain("new BroadcastChannel");
  });

  it("reaches the cloud only through the authenticated API and the two public readers", () => {
    const rpcCallers = FILES.filter(
      ({ path, source }) => /\.rpc\s*\(/.test(source) && !path.includes("/server/") && !path.includes("/test/"),
    ).map((file) => file.path);

    // One module, holding exactly the two anonymous read-only lookups.
    expect(rpcCallers).toEqual(["/lib/supabase/remote.ts"]);

    const remote = FILES.find(({ path }) => path.endsWith("lib/supabase/remote.ts"))!;
    const calls = [...remote.source.matchAll(/\.rpc\(\s*"([^"]+)"/g)].map((match) => match[1]);
    expect(calls.sort()).toEqual(["get_public_event", "get_zoom_event"]);
  });
});
