# Final client-concurrency hardening

Read this entire file before changing code. Keep the current simple product model exactly as it is:

- every authorized controller is editable;
- no lease, ownership, leader, Web Locks, heartbeat, takeover, or read-only controller;
- PostgreSQL event-version optimistic concurrency is the authority;
- unsaved outboxes remain tab-local in `sessionStorage`;
- public and Zoom screens remain read-only.

Do not deploy, contact remote services, run the Supabase migration, or change the migration SQL. The current 376 tests, typecheck, lint, and plain Turbopack build all pass in Codex's host. This task is a focused final hardening pass for races the suite still misses.

## P0: same-device cache adoption must advance the save coordinator

In `useControllerEvent`, the `subscribeLocalChanges` callback currently updates `version.current` and the displayed event, but it does not update an already-existing `SaveCoordinator`'s internal version.

Concrete failure:

1. Tab B has previously saved version 1, so its coordinator exists internally at version 1 and has no local work.
2. Tab A saves version 2 and notifies the shared acknowledged cache.
3. Tab B immediately adopts the cache and sets `version.current = 2`, but its coordinator remains at 1.
4. Before the next one-second server poll, B edits. Its outbox says expected version 2, while the coordinator sends version 1, creating a false 409.

When a same-device acknowledged cache is adopted and there is no local work, advance/reset the coordinator to that cache version too. Add a deterministic test proving B's next immediate save is sent with version 2, not version 1.

## P0: conflict-resolution requests must not discard a newer edit

`discardLocalChanges()` and `keepLocalChanges()` await a GET while the controller remains editable.

Current data-loss windows:

- `discardLocalChanges()` clears the outbox after the GET even if the operator made a new edit while that GET was in flight.
- `keepLocalChanges()` captures `pending` before the GET, so a newer edit made during the request is later overwritten by the older captured snapshot.
- two conflict buttons or repeated clicks can run concurrently and apply out of order.

Required behavior:

- Make conflict resolution single-flight or command-generation guarded. Only the current action may apply its response.
- Capture the event identity and outbox revision when an action starts and re-check after every await.
- **Use the other version:** clear/adopt only if the outbox revision is still exactly the one the operator chose to discard. If it changed, preserve the newer edit and return a clear retry message.
- **Keep my changes:** never overwrite a newer outbox entry. Either rebase the latest current entry deliberately or abort with a clear retry message when the revision changed. Choose one policy and document/test it.
- A stale action after unmount or event-id change must do nothing to the new screen.
- Expose a small resolving state if necessary so both conflict buttons can be disabled and labeled while one action is awaiting. Do not disable ordinary editing unless needed; revision guards are still mandatory.

Add deterministic tests with held GET promises for both buttons, an edit made mid-request, repeated/double action attempts, and teardown/event change.

## P1: adopting a pre-existing outbox can still conflict with its own save

On mount, a pre-existing outbox is queued before `sync()` completes. `sync()` intentionally allows the same existing revision through. If the resumed PUT commits version 2 and the GET sees version 2 before the PUT response arrives, `applyAuthoritative()` can briefly mark a conflict against this tab's own successful resumed save.

Once an outbox revision is already pending or in flight in the coordinator, a successful GET must yield to that save's own 200/409 response. It must not requeue or mark a conflict. A pre-existing outbox still has to resume; the save response is what reconciles it.

Add a regression test: reload with revision R expected at version 1, hold the resumed PUT, let the mount GET return R's committed version 2 first, assert no conflict and no duplicate PUT, then release the 200 and verify the outbox clears and later edits still save.

## P1: changing a token must not leave the previous timer on screen

The queued cache callbacks are now cancelled correctly, but both read hooks use `setEvent(current => current ?? cached)`. If event A is already displayed and the token/code changes to B, A can remain visible while B's request is pending or unavailable, even when B has a different cached event.

On audience-token or Zoom-code change:

- never display the previous token's event as if it belonged to the new token;
- replace it with B's matching cache immediately, or clear it while B connects if no matching cache exists;
- reset connection state for the new token/code consistently;
- keep the existing stale-network-response and cancelled-microtask guards.

Add tests that first fully display A, then switch to B while B's network request is held:

- with a B cache, B appears immediately;
- without a B cache, A is cleared and cannot remain under B;
- cover both audience and Zoom hooks.

## P1: event-id changes must not reuse another event's coordinator

`useControllerEvent(eventId)` keeps `coordinator`, `version`, `latest`, and state in refs/state across renders. Its coordinator cleanup currently runs only on component unmount. If the hook instance is ever reused for a different event id, an old coordinator or late save response can mutate the new event's version/state or serialize a new event through the old coordinator.

Make the hook correct for an `eventId` change even if the current Next.js route normally remounts it:

- dispose/detach the old event's coordinator before initializing the new event;
- reset event-scoped refs/state appropriately;
- ignore late old-event callbacks for new-event UI/coordinator state;
- a late acknowledged old-event save may still settle the old event's own cache/outbox, but must not change the new event's displayed state, save state, or coordinator version.

Add a hook-rerender test that changes event A to event B while A has a GET and/or PUT in flight, then resolves A late and proves B is untouched and saves using B's version.

## Preserve all established guarantees

Retain every existing test and invariant unless a test must be strengthened for the behavior above. In particular retain:

- real two-controller 409/version integration coverage;
- tab-local `sessionStorage` outboxes and `localStorage` acknowledged cache;
- unique opaque revisions and exact settle/failure matching;
- the single-flight polling loop and stale-response guards;
- explicit 401/403 preservation and explicit 404 clearing;
- both conflict choices;
- no browser publish path or client service-role secret;
- the teamless per-event credential/session design and Zoom integration.

## Validation and handoff

Run:

- `git diff --check`
- `npm test -- --run`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

When finished, replace the entire contents of `CLAUDE_TO_CODEX.md` with:

- every file changed;
- exact fixes and invariants for each section above;
- regression tests added;
- exact command results and test count;
- remaining limitations;
- confirmation that nothing was deployed and the migration was not run.

Do not append to the old response and do not modify this `CODEX_TO_CLAUDE.md` file.
