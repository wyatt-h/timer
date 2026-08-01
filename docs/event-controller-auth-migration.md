# Event access database migration

The final Timer access model has no teams, user accounts, or recovery codes. Each
event is opened with:

- its separately chosen lowercase login name; and
- a password of at least six characters.

The visible event title is independent and can be changed without changing the
login. The database canonicalizes login names by trimming, collapsing whitespace,
and lowercasing them.

A signed-in controller can also create a one-time invitation. The raw token is
never stored in PostgreSQL; its hash expires after 24 hours and is deleted as it
creates the recipient's event session.

## Migration files

Apply every file in `supabase/migrations` in filename order. The access-model
migrations are:

1. `20260731010000_event_controller_auth.sql` — removes the legacy team/account
   model and creates per-event sessions and versioned writes.
2. `20260801000000_simplify_event_access.sql` — makes the event name the access
   identifier and removes recovery credentials/functions.
3. `20260801010000_event_invites.sql` — adds hashed, one-time, 24-hour event
   invitation links and the transactional redemption functions.
4. `20260801020000_separate_event_login_name.sql` — separates the stable login
   name from the editable event title.

Do not edit a migration that has already been applied. Add a new forward migration
for future schema changes.

## Before applying

Confirm the CLI is linked to the intended project:

```bash
npx supabase@latest projects list
npx supabase@latest migration list
```

The separation migration retains every existing login name, so it does not need
to rewrite event or credential rows.

## Apply

Preview the pending migration:

```bash
npx supabase@latest db push --linked --dry-run
```

The preview should list the locally pending migration files and no unknown files.
Then apply them:

```bash
npx supabase@latest db push --linked
```

Confirm local and remote versions match:

```bash
npx supabase@latest migration list
```

## Validate the complete database

Open Supabase Dashboard → SQL Editor, paste the entire contents of
`supabase/validate_event_controller_database.sql`, and run it.

The first `SUMMARY` row must be `PASS`, and every non-summary row should be
`PASS`. A `WARN` is non-blocking housekeeping that should still be reviewed. A
`FAIL` means the application should not be deployed yet.

The validator is read-only. It verifies:

- exact tables, columns, types, nullability, enums, indexes, and triggers;
- no legacy team objects and no recovery column/functions;
- the invitation table, token constraints, indexes, grants, and transactional functions;
- function signatures and grants;
- RLS and public/service-role boundaries;
- constraints for access names, timer bounds, hashes, and rate-limit scopes;
- event/credential/runtime integrity and session consistency; and
- audience, controller, and Zoom payload readers.

## Configure Vercel

Set these variables for both Production and Preview:

```text
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` must never have a `NEXT_PUBLIC_` prefix. Redeploy after
adding or changing environment variables.

Apply the database migration before deploying application code that calls the new
five-argument `create_controller_event` function.

## Smoke test

After deployment:

1. Create an event titled `Access Smoke Test`, with login name `access smoke`, and
   a six-character password.
2. Confirm no recovery-code screen appears.
3. In a private browser, open the event with `access smoke` and the password.
4. Rename its visible title to `Renamed Smoke Test` and save.
5. Confirm `access smoke` still signs in.
6. Open it on two devices, edit from both, and confirm a stale save shows the
   existing version-conflict resolution instead of overwriting silently.
7. Change the password; confirm another device is signed out while the changing
   device stays signed in.
8. Delete the event and confirm its remembered entry disappears from that device.
9. In a Zoom meeting, sync a running timer and confirm the compact Dynamic
   Indicator shows the remaining time, not the speaker name.
10. Create an invitation link, open it in a private browser, and confirm it opens
    the event and appears under **On this device**.
11. Open the same invitation again and confirm it is rejected as already used.
12. Create another invitation, revoke it, and confirm it cannot be opened.

## Rollback

The simplification migration drops recovery hashes and functions, so rolling back
the schema cannot restore old recovery codes. Prefer fixing forward.

If application deployment must be stopped, roll back the application release
before it receives traffic, then decide whether to add a forward compatibility
migration. Do not paste old migration files into SQL Editor or mark migrations as
applied without running them.
