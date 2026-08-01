# Report: final client-concurrency hardening

All five items are fixed, each with a test that fails without its fix. The product
model is unchanged: every authorized controller is editable, there is no lease,
ownership, leader, Web Locks, heartbeat, takeover or read-only controller,
PostgreSQL's event-version check is the authority, outboxes stay tab-local in
`sessionStorage`, and the public and Zoom screens stay read-only. Nothing was
deployed and the migration was not run.

**392 tests pass (was 376), typecheck and lint clean.**

---

## 1. Files changed

| File | Change |
|---|---|
| `src/lib/controller/use-controller-event.ts` | All five fixes: coordinator advanced on same-device cache adoption; single-flight, identity- and revision-guarded conflict resolution with a `conflictResolution` state; `applyAuthoritative` yields to a save the coordinator already holds; per-event coordinator with `owns()` guards on every callback that touches shared state; event-scoped reset and coordinator disposal on any change of event id |
| `src/lib/store.ts` | A change of audience token or Zoom code now replaces what is on screen — the new token's cache, or nothing — and resets the connection state |
| `src/components/control-room.tsx` | Both conflict buttons are disabled while either choice is awaiting the server, and the running one is labelled; a stale error message is cleared when a new choice starts |
| `src/lib/controller/use-controller-event.test.tsx` | 12 new tests across the four hook-side items |
| `src/lib/store.test.tsx` | 4 new tests for the token-change behaviour, both hooks |
| `src/lib/controller/no-tab-ownership.test.ts` | Also guards that the conflict buttons are wired to the resolving state |
| `README.md`, `docs/event-controller-auth-migration.md` | The conflict-resolution guarantees written down; manual checklist rows 14c and 14d added |

**Not touched:** `save-coordinator.ts`, `polling.ts`, `persistence.ts`, every server
route, the migration SQL, and `CODEX_TO_CLAUDE.md` (read, left unmodified).

`SaveCoordinator` needed no change. Everything here is enforced in the hook, which
is where the shared refs and the screen live.

---

## 2. P0: same-device cache adoption advances the coordinator

`subscribeLocalChanges` now advances the coordinator's own version alongside
`version.current`:

```ts
generation.current += 1;
version.current = cached.version;
commit(cached.event);
coordinator.current?.setVersion(cached.version);
```

**Invariant:** after adopting acknowledged state, the version the next request
carries and the version the next outbox entry expects are the same number.

`setVersion` rather than `resume`: there is no local work to resume or discard on
this path (the callback returns early if `hasLocalWork()`), and `resume` would also
emit `idle`, wiping a **Saved** badge that is telling the truth about the last save.

**Test** — *"sends the next save against the version that tab committed, not the one
before"*. It saves once first so the coordinator genuinely exists holding version 2
(a lazily-created one would read the ref and hide the bug), then writes the cache at
version 3 and notifies, then edits immediately without letting a poll run. Asserts
the outbox expects 3 **and** the PUT carries 3, and that no conflict appears.
Reverting the one line fails it.

---

## 3. P0: conflict resolution cannot discard or overwrite a newer edit

Both choices now go through one guarded wrapper, `resolveConflict(choice, apply)`:

- **Single-flight.** A second choice while one is awaiting is refused with
  *"That is still being worked out…"* and makes no request of its own. Refused rather
  than queued, because by the time the first finishes the second's premise is gone.
- **Identity guarded.** `identity.current` is captured at the start and re-checked
  after the await; a response that arrives after unmount or after a change of event id
  applies nothing, and does not clear the flag or label belonging to whatever is on
  screen by then.
- **Revision guarded.** The outbox revision is captured when the operator chooses and
  re-checked after the await.
- **`conflictResolution`** (`"discard" | "keep" | null`) is exposed so the control room
  can disable both buttons and label the running one.

**Use the other version** — the destructive choice, so it applies **only to the exact
revision that was on screen when it was chosen**. If it changed, nothing is cleared
and the operator is told to choose again. An edit made during the read was never
offered up for discarding and exists nowhere else.

**Keep my changes** — **policy: rebase whatever is unsaved at the moment it applies**,
not the snapshot captured when the button was pressed. Documented in the function's
doc comment and tested. Rationale: "my changes" means the changes on screen; the
outbox holds exactly one entry per event, so a newer edit already supersedes the older
one locally; rebasing the captured snapshot would silently undo it, and aborting would
make the operator re-answer a question they have already answered. A rebase discards
nothing either way.

**Tests** (6): an edit made mid-request is not discarded and the banner stays; the
ordinary discard still works when nothing moved; keep rebases the newer edit and
sends it against the server's current version; a second choice mid-flight is refused
with `conflictResolution === "discard"` observable and no extra GET; a repeat press
*after* the first finished is a legitimate no-op-with-ok; a choice resolving after
unmount changes nothing and leaves the unsaved edit intact. Reverting the guards
fails four of them; reverting keep-latest to keep-captured fails the fifth.

---

## 4. P1: a resumed outbox is reconciled by its own save

`applyAuthoritative` gained one guard, before the queue/conflict decision:

```ts
if (active.trackedRevision === pending.revision) return;
```

**Invariant:** once a revision is queued or in flight in the coordinator, only that
save's own 200 or 409 resolves it. A successful GET neither requeues it (which would
send the same snapshot twice) nor marks a conflict (which would be a conflict against
this tab's own successful save). A pre-existing outbox still resumes on mount — `sync`
deliberately lets its revision through — and the save response is what settles it.

**Test** — *"leaves the resumed save's own response to reconcile it"*: reload with
revision `rev-resumed` expected at version 1, the resumed PUT held, the mount GET
released first with that revision's committed version 2. Asserts no conflict, exactly
one PUT, the outbox still holding `rev-resumed`; then releases the 200 and asserts the
outbox clears, the badge reads **Saved**, and a later edit saves against version 2.
Removing the guard fails it.

---

## 5. P1: a token change replaces the previous timer

Both read hooks previously used `setEvent(current => current ?? cached)`, which kept
event A visible under token B — indefinitely if B was unreachable. Now, on any change
of viewer token or Zoom code:

- `setEvent(cachedForThisToken ?? null)` — this token's cached event, or nothing;
- the connection state is reset for the new token (`live`/`not-found` → `connecting`
  for the audience display; the Zoom hook recomputes its own);
- `unavailable` is deliberately left alone, because it is also the answer when there
  is no client at all, which the leading poll has already reported by then;
- the cancelled-microtask and stale-network-response guards are unchanged, and the
  cache read still runs before any network answer can land.

**Tests** (4): with the new token cached, B appears immediately while B's request is
held; without a cache, A is cleared, the connection reads `connecting`, and A does not
come back over three seconds of held requests. Both for the audience token and the
Zoom code. Restoring the `current ?? cached` form fails all four.

---

## 6. P1: an event-id change reuses nothing

- The mount effect is now per event in both directions: its cleanup disposes the old
  coordinator **and nulls the ref**, and its body resets the event-scoped refs
  (`version`, `blocked`, `resolving`) synchronously plus the event-scoped state
  (snapshot, login name, status, save state, resolution label) in the same microtask
  that paints the new event's cache. The separate unmount-only disposal effect is gone,
  because this covers unmount and event change with one rule.
- Every coordinator callback that touches shared hook state is gated on
  `owns()` — `coordinator.current === self` — so a save that was already on the wire
  cannot, after disposal or an event change, write `version.current`, set the save
  state, mark the screen signed-out, or record a conflict version.
- Writes keyed by the event that was saved stay unconditional: a late acknowledged
  save still writes **its own** event's cache, renames its recent-event entry,
  notifies other tabs, and settles **its own** outbox. That is correct however stale
  the coordinator is.
- The outstanding-entry advance uses `self?.setVersion(...)` instead of
  `coordinator.current?.setVersion(...)`, which after an event change was pushing one
  event's version into another event's writer.

**Tests** (4): the previous event is cleared from the screen the moment the id changes
(status back to `loading`, no name, no login name) while the new event's read is held;
event A's in-flight PUT lands late and leaves B's screen, badge and version alone
while still clearing A's own outbox and caching A at version 2, after which B's first
edit carries B's version 7; A's in-flight GET lands late and cannot paint B; and a
conflict choice for A resolving after the switch to B does nothing to B and does not
discard A's unsaved edit. Reverting the reset and the `owns()` guards fails three of
them (the fourth is held by the identity guard from the previous round, and stays as
a regression test).

---

## 7. Established guarantees, re-verified

Every previous test is retained and passing, unstrengthened except where the items
above demanded it (no test was deleted or weakened this round): the real
two-controller 409/version integration test; tab-local `sessionStorage` outboxes with
the acknowledged cache in `localStorage`; opaque unique revisions with exact settle
and failure matching; the single-flight polling loop and its stale-response guards;
explicit 401/403 preservation and explicit 404 clearing; both conflict choices; the
structural guard that no lease, ownership or read-only controller has returned; no
browser publish path and no client service-role secret; and the teamless per-event
credential/session design with the read-only Zoom integration.

---

## 8. Command results

| Command | Result |
|---|---|
| `git diff --check` | clean (exit 0) |
| `npm test -- --run` | **392 passed / 24 files**, 0 failed |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npx next build --webpack` | **succeeds** — 14 routes |
| `npm run build` (default Turbopack) | **fails, environment-specific** (unchanged from the last round) |

Test count **376 → 392, net +16**: 12 controller (1 same-device version, 6 guarded
resolution, 1 resumed outbox, 4 event-id change) + 4 store (token change).

`npm run build` fails here with `creating new process — binding to a port —
Operation not permitted (os error 1)` from Turbopack's PostCSS worker while
processing `src/app/globals.css`, a file no round has touched. It reproduces with and
without the tool sandbox, so this host does not permit binding a local port; the
webpack builder compiles the identical tree and emits all 14 routes. **Not a code
failure — please keep confirming plain `npm run build` on your host.**

One lint interaction worth noting: `react-hooks/set-state-in-effect` rejects setting
state synchronously in an effect body, which is why the event-scoped *state* reset
happens in the mount microtask (the refs are reset synchronously, since callbacks read
them and nothing runs in between).

---

## 9. Remaining limitations

1. **The control room's conflict UI has no DOM test.** There is no test harness for
   `control-room.tsx` in this repo, so the wiring is covered by the hook's
   `conflictResolution` tests plus a structural assertion that the buttons are
   disabled by it. Rows 14c/14d of the manual checklist are the browser-level check.
2. **An edit made during a resolution still cannot send until the conflict is
   resolved.** The coordinator stays halted, so the newer edit sits in the outbox
   until a choice applies. That is unchanged and deliberate, but it means "type
   something during a resolution" always ends in one more press of a button.
3. **`keepLocalChanges` rebasing the latest entry means the operator's own newer edit
   wins over their older one silently.** Correct for one tab, where the outbox is a
   single linear sequence; it would need revisiting if an event ever had more than one
   outbox entry.
4. **A disposed coordinator's in-flight request is not cancelled**, because there is no
   `AbortController` on this path. It is made harmless by `owns()` rather than stopped,
   so it still costs one request and one write of its own event's cache.
5. **An unsaved edit still dies with its tab** (`sessionStorage`), bounded by the
   220 ms autosave debounce.
6. **Optimistic concurrency is per whole-event document**, so two controllers editing
   different agenda items still conflict.
7. **`hasLocalWork()` reads `sessionStorage` on every poll tick**; single-flight
   polling is per hook instance, so N tabs make N requests a second.
8. **The rate limiter's advisory locks are still untested under real contention**
   (PGlite is single-connection).
9. **Not validated live:** the Turbopack build, the real two-browser and two-tab
   conflict flow, in-room latency, and 30-day cookie expiry. The event-id-change
   fixes are proven at the hook level; the current routes remount instead, so that
   path is correctness insurance rather than an exercised code path.

---

## 10. Confirmation

**Nothing was deployed. The migration was not applied, the migration SQL was not
changed, and the hosted database was never contacted.** No `supabase` command, no
`vercel` command, no network call to any project: only local `npm` scripts, local
`next build`, and PGlite in-process. `CODEX_TO_CLAUDE.md` was read and left
unmodified. The teamless per-event credential design, the read-only Zoom integration,
and the no-ownership concurrency model are all intact.
