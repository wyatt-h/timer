# Event access database migration

The final Timer access model has no teams, user accounts, controller usernames,
or recovery codes. Each event is opened with:

- its event name; and
- a password of at least six characters.

The database stores a canonical event-name key (trimmed, whitespace collapsed,
and lowercased), so `Global Call` and ` global   CALL ` identify the same event.
Event names must therefore be globally unique after canonicalization.

## Migration files

Apply every file in `supabase/migrations` in filename order. The two access-model
migrations are:

1. `20260731010000_event_controller_auth.sql` — removes the legacy team/account
   model and creates per-event sessions and versioned writes.
2. `20260801000000_simplify_event_access.sql` — makes the event name the access
   identifier and removes recovery credentials/functions.

Do not edit a migration that has already been applied. Add a new forward migration
for future schema changes.

## Before applying

Confirm the CLI is linked to the intended project:

```bash
npx supabase@latest projects list
npx supabase@latest migration list
```

If the database may contain events, check for event names that will collide:

```sql
select
  lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) as access_name,
  count(*) as event_count,
  array_agg(id order by id) as event_ids
from public.events
group by 1
having count(*) > 1;
```

The result must be empty before applying the simplification migration. Rename or
delete duplicates first. A freshly reset database already satisfies this check.

## Apply

Preview the pending migration:

```bash
npx supabase@latest db push --linked --dry-run
```

The preview should list `20260801000000_simplify_event_access.sql` and no unknown
files. Then apply it:

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

Apply the database migration before pushing/deploying application code that calls
the new four-argument `create_controller_event` function.

## Smoke test

After deployment:

1. Create an event named `Access Smoke Test` with a six-character password.
2. Confirm no recovery-code screen appears.
3. In a private browser, open the event with `access smoke test` and the password.
4. Rename it to `Renamed Smoke Test` and save.
5. Confirm the old name no longer signs in and the new name does.
6. Open it on two devices, edit from both, and confirm a stale save shows the
   existing version-conflict resolution instead of overwriting silently.
7. Change the password; confirm another device is signed out while the changing
   device stays signed in.
8. Delete the event and confirm its remembered entry disappears from that device.
9. In a Zoom meeting, sync a running timer and confirm the compact Dynamic
   Indicator shows the remaining time, not the speaker name.

## Rollback

The simplification migration drops recovery hashes and functions, so rolling back
the schema cannot restore old recovery codes. Prefer fixing forward.

If application deployment must be stopped, roll back the application release
before it receives traffic, then decide whether to add a forward compatibility
migration. Do not paste old migration files into SQL Editor or mark migrations as
applied without running them.
