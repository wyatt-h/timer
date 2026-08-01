# Event controller authentication — migration runbook

This migration does two things that are really one decision:

1. **An event becomes an independent resource.** Teams are removed entirely.
2. **Control of an event is proved by that event's own username and password**,
   held in an opaque server-side session, instead of by a signed-in user who
   belongs to a team.

The final ownership chain is exactly this, and nothing else:

```text
events
  └── event_access        one credential record per event
        └── event_sessions  one session grants access to one event
```

> ### This migration is deliberately destructive
>
> `teams`, `team_members`, `public.team_role`, `events.team_id`,
> `events.created_by`, `event_runtime.updated_by`, the membership functions
> (`add_team_owner`, `is_team_member`, `is_team_owner`) and every team policy are
> **dropped**. Legacy Supabase-user ownership goes with them: `/login` and
> `/auth/callback` no longer exist in the application, and no event row refers to
> `auth.users` any more.
>
> There is no hidden default team, no placeholder team, no nullable `team_id` kept
> for compatibility, and no empty `team` string in any payload. Backward
> compatibility with team-based events is not provided.
>
> **The migration refuses to run if any event row already exists.** See
> [section 2](#2-existing-row-safety).

The migration has **not** been applied to any hosted Supabase project.

Section 1 and section 5 are read-only. Section 2 is read-only **except** for one
explicitly-labelled destructive statement, which you only reach if legacy events
exist. Sections 3, 4 and 8 change the database. Every mutating block below is
marked **MUTATING**.

---

## 1. Preflight — read-only SQL

Run this against the target project. **Nothing here writes.** Every check should
match its "expected" note before you go on.

```sql
-- 1a. What exists today.
--     Expected on a project that has had the historical migrations: all six.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('teams', 'team_members', 'events', 'agenda_items',
                     'speakers', 'event_runtime')
order by table_name;

-- 1b. How much data is at risk, and whether the migration will refuse to run.
--     Expected: events = 0. Any other value means STOP and read section 2.
select
  (select count(*) from public.events)        as events,
  (select count(*) from public.teams)         as teams,
  (select count(*) from public.team_members)  as team_memberships,
  (select count(*) from public.agenda_items)  as agenda_items,
  (select count(*) from public.speakers)      as speakers,
  (select count(*) from public.event_runtime) as runtime_rows,
  (select count(*) from auth.users)           as auth_users;

-- 1c. The objects the migration will drop. Seeing them here is expected.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('add_team_owner', 'is_team_member', 'is_team_owner')
order by p.proname;

select policyname, tablename
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 1d. The objects the migration must NOT harm.
--     Expected: public_event_payload, get_public_event, get_zoom_event.
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('public_event_payload', 'get_public_event', 'get_zoom_event')
order by p.proname;

-- 1e. Nothing the migration creates may already exist.
--     Expected: zero rows from both. If either returns anything, read section 9.
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('event_access', 'event_sessions', 'event_auth_attempts');

select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_controller_event', 'replace_controller_event', 'delete_controller_event',
    'controller_event_payload', 'write_event_children', 'issue_event_session',
    'change_controller_password', 'recover_controller_password',
    'rotate_controller_recovery_code', 'touch_event_session',
    'register_event_auth_attempt', 'clear_event_auth_attempts', 'ms_to_timestamptz'
  );
```

---

## 2. Existing-row safety

Every event that exists before this migration is a team-owned event with **no
controller credentials**, and none can be invented for it: there is no password to
hash and nobody to hand a recovery code to. Dropping its ownership would leave an
event nobody can control; deleting it silently would destroy somebody's work.

So the migration **stops** instead, in its very first statement:

```text
ERROR: Refusing to migrate: N legacy team-owned event row(s) exist and cannot be
       converted to controller-owned events.
HINT:  Export them first (see the runbook), then delete them explicitly with
       "delete from public.events;" and re-run. Nothing is deleted automatically.
```

Because the whole file is one transaction, that refusal leaves the database
exactly as it was — no table dropped, no column removed, nothing half-applied.

If preflight **1b** reported `events = 0`, skip to [section 3](#3-apply-the-migration).

### If events do exist, this is an explicit decision, and it is yours

**Read-only — export first.** Nothing below writes.

```sql
-- Everything needed to rebuild these events by hand afterwards.
select
  e.id, e.name, e.event_date, e.status, e.viewer_token, e.zoom_token, e.created_at,
  t.slug as team_slug,
  (select jsonb_agg(jsonb_build_object(
     'order', a.order_index, 'kind', a.kind, 'host', a.host,
     'durationSeconds', a.duration_seconds,
     'speakerDefaultSeconds', a.speaker_default_seconds,
     'speakers', (select jsonb_agg(jsonb_build_object(
        'order', s.order_index, 'name', s.name, 'durationSeconds', s.duration_seconds)
        order by s.order_index)
       from public.speakers s where s.agenda_item_id = a.id))
     order by a.order_index)
   from public.agenda_items a where a.event_id = e.id) as agenda
from public.events e
join public.teams t on t.id = e.team_id
order by e.created_at;
```

Save that output somewhere durable. Then, and only then:

**MUTATING — the explicit reset. Irreversible.**

```sql
-- Removes every legacy event and, by cascade, its agenda, speakers and runtime.
-- Irreversible. Run it only once you have the export above.
delete from public.events;
```

Teams and memberships need no separate step: they are dropped by the migration,
and with no events left they hold nothing of value. Re-run preflight **1b**,
confirm `events = 0`, then continue.

There is no automatic conversion path, and adding one would mean inventing
credentials for events whose owners never chose any.

---

## 3. Apply the migration

**Exact filename:**

```text
supabase/migrations/20260731010000_event_controller_auth.sql
```

It is the only new migration, it is forward-only, and it is wrapped in a single
`begin; … commit;`. No earlier migration file is edited — historical migrations
still create the team schema, because that is what actually happened, and this one
removes it.

The whole history applies cleanly to an empty database; that is asserted by
`src/test/migrations.test.ts`, which executes every file in order against a real
PostgreSQL instance.

**Do not paste the file into the SQL editor.** Use the CLI so the migration
history stays truthful.

```bash
supabase projects list
supabase link --project-ref <project-ref>   # only if not already linked

# Read-only: what does the remote think has been applied?
supabase migration list

# Read-only: connects and diffs, writes nothing.
supabase db push --dry-run

# MUTATING: applies the migration.
supabase db push
```

If `--dry-run` proposes anything other than
`20260731010000_event_controller_auth.sql`, stop and read
[section 9](#9-migration-history-drift).

### The exact destructive operations, in order

The order is deliberate: policies reference the membership functions, the
functions cannot be dropped while a policy uses them, `team_members` has a foreign
key into `teams`, and the public readers must be rewritten *before* `teams`
disappears or they would be left pointing at a missing table.

| # | Operation | Why it is here |
|---|---|---|
| 1 | `drop policy` × 12, by name, on `teams`, `team_members`, `events`, `agenda_items`, `speakers`, `event_runtime` | All twelve call `is_team_member`/`is_team_owner` |
| 2 | `create or replace` `public_event_payload`, `get_public_event`, `get_zoom_event` | Rewritten without the `teams` join and without a `team` key, before `teams` is dropped |
| 3 | `alter table events drop constraint events_team_id_fkey`; `drop index events_team_id_idx` | Removed by name rather than as a side effect of the column drop |
| 4 | `alter table events drop column team_id`, `drop column created_by`; `alter table event_runtime drop column updated_by` | The last references to teams and to `auth.users` |
| 5 | `drop table team_members` | Before `teams`, because of its foreign key |
| 6 | `drop table teams` | Takes its own triggers with it |
| 7 | `drop function add_team_owner()`, `is_team_member(uuid)`, `is_team_owner(uuid)`; `drop type team_role` | Now unreferenced |
| 8 | `alter table event_runtime drop constraint … remaining_seconds_check` and re-add | Widened to allow negative overtime, bounded to ±86400 |

No `DROP … CASCADE` is used anywhere, so nothing outside this list can vanish
quietly. A `do $$ … $$` block immediately after step 7 re-checks the schema and
**fails the migration** if any team object survived or if any public reader was
lost.

RLS stays enabled on `events`, `agenda_items`, `speakers` and `event_runtime`, now
with **no policies at all** — `anon` and `authenticated` can neither read nor write
an event row directly. Public reads go through the two security-definer readers;
controller writes go through service-role-only transactional functions.

### What the migration adds

- `events.version bigint not null default 0` — optimistic concurrency.
- `event_access`, `event_sessions`, `event_auth_attempts` — RLS on, no policies,
  every privilege revoked from `anon` and `authenticated`, granted to
  `service_role` only. Five indexes.
- Readers: `controller_event_payload`, and the rewritten public pair.
- Writers: `create_controller_event`, `replace_controller_event`,
  `delete_controller_event`, `write_event_children`, `issue_event_session`.
- Credential transactions: `change_controller_password`,
  `recover_controller_password`, `rotate_controller_recovery_code`.
- Sessions and limits: `touch_event_session`, `register_event_auth_attempt`,
  `clear_event_auth_attempts`, `ms_to_timestamptz`.

Every one of them is `security definer` with `set search_path = public` and revoked
from `public`, `anon` and `authenticated`.

Most are then granted to `service_role`, which is what the route handlers use.
Three are deliberately granted to **nobody**: `write_event_children`,
`issue_event_session` and `ms_to_timestamptz` are internal helpers, reachable only
because the definer functions that call them run as the function owner. Postflight
5h asserts the granted set; those three are intentionally absent from it.

`create_controller_event` takes no team argument. It writes the event, its
credential record, its agenda, its speakers, its runtime **and the creating
device's session** in one commit.

---

## 4. Environment variables

Add **one** new variable. It is server-only.

| Variable | Environments | Notes |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview (Development too if you run the controller flow locally) | Supabase → Project Settings → API → `service_role`. **Never** prefix it with `NEXT_PUBLIC_`. |

Already required and unchanged: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.

Optional: `EVENT_AUTH_HASH_PEPPER`, the HMAC key for the username and
client-address digests in `event_auth_attempts`. Any long random string; falls back
to the service-role key. Set it explicitly if you ever want to rotate the
service-role key without resetting the rate-limit buckets.

```bash
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY preview
```

> **Environment variables are read at build and boot, not on demand.** Adding or
> changing one has **no effect on the running deployment**. You must redeploy
> afterwards — `vercel deploy --prod`, or "Redeploy" on the latest deployment in
> the dashboard. A missing key shows up as every create, sign-in and save
> returning a generic 503.

### Ordering

1. `supabase db push`
2. Set `SUPABASE_SERVICE_ROLE_KEY`
3. **Redeploy**

The route handlers call functions that do not exist until the migration has run,
so deploying first makes the whole controller flow fail until it lands.

---

## 5. Postflight — read-only validation SQL

Run all of it. **Nothing here writes.**

```sql
-- 5a. Teams are gone. Expected: zero rows from all four.
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('teams', 'team_members');

select typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and typname = 'team_role';

select column_name from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in
      (('events', 'team_id'), ('events', 'created_by'), ('event_runtime', 'updated_by'));

select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('add_team_owner', 'is_team_member', 'is_team_owner');

-- 5b. The final table list.
--     Expected exactly: agenda_items, event_access, event_auth_attempts,
--     event_runtime, event_sessions, events, speakers.
select table_name from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;

-- 5c. events carries no ownership column.
--     Expected exactly: created_at, event_date, id, name, status, updated_at,
--     version, viewer_token, zoom_token.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'events'
order by column_name;

-- 5d. The only foreign keys left are the event ownership chain.
--     Expected: agenda_items→events, event_access→events, event_runtime→events,
--               event_sessions→events, speakers→agenda_items.
select cl.relname as table_name, ref.relname as references_table
from pg_constraint con
join pg_class cl on cl.oid = con.conrelid
join pg_class ref on ref.oid = con.confrelid
join pg_namespace n on n.oid = cl.relnamespace
where n.nspname = 'public' and con.contype = 'f'
order by 1, 2;

-- 5e. RLS on everywhere, and no policy anywhere.
--     Expected: relrowsecurity true for every row; zero policies.
select relname, relrowsecurity from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by relname;

select policyname, tablename from pg_policies where schemaname = 'public';

-- 5f. THE IMPORTANT ONE. anon and authenticated have no access to credential,
--     session or rate-limit rows. Expected: zero rows.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('event_access', 'event_sessions', 'event_auth_attempts')
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by table_name, grantee, privilege_type;

-- 5g. service_role can reach them. Expected: SELECT/INSERT/UPDATE/DELETE each.
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('event_access', 'event_sessions', 'event_auth_attempts')
  and grantee = 'service_role'
order by table_name, privilege_type;

-- 5h. Every controller function is service_role-only.
--     Expected: has_service true, has_anon and has_authenticated false, for all.
select
  p.proname,
  has_function_privilege('service_role', p.oid, 'execute')  as has_service,
  has_function_privilege('anon', p.oid, 'execute')          as has_anon,
  has_function_privilege('authenticated', p.oid, 'execute') as has_authenticated
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_controller_event', 'replace_controller_event', 'delete_controller_event',
    'controller_event_payload', 'change_controller_password',
    'recover_controller_password', 'rotate_controller_recovery_code',
    'touch_event_session', 'register_event_auth_attempt', 'clear_event_auth_attempts'
  )
order by p.proname;

-- 5i. The public readers are UNCHANGED in who may call them.
--     Expected: get_public_event and get_zoom_event true/true;
--               public_event_payload false/false.
select
  p.proname,
  has_function_privilege('anon', p.oid, 'execute')          as has_anon,
  has_function_privilege('authenticated', p.oid, 'execute') as has_authenticated
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_public_event', 'get_zoom_event', 'public_event_payload')
order by p.proname;

-- 5j. No reader mentions a team. Expected: zero rows.
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('public_event_payload', 'controller_event_payload',
                    'get_public_event', 'get_zoom_event')
  and p.prosrc ilike '%team%';

-- 5k. search_path is pinned on every security definer function.
--     Expected: every proconfig contains search_path=public.
select p.proname, p.proconfig from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by p.proname;

-- 5l. Overtime is storable. Expected: both CHECKs mention -86400.
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.event_runtime'::regclass and contype = 'c'
order by conname;

-- 5m. Concurrency column, and the username rule the application enforces.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'events' and column_name = 'version';

select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.event_access'::regclass and contype = 'c';
```

---

## 6. Smoke test

Run in order against the deployed environment, after the redeploy. Two browsers
are needed — "A" and "B"; a private window is enough for B.

| # | Action | Expected |
|---|---|---|
| 1 | Browser A → home | Two choices only: **Create an event** and **Open an event**. **No team-name field anywhere** |
| 2 | **Create an event** → **New event** | The builder opens at `/events/new` |
| 3 | Add an agenda item, press **Start event** | The controller-credentials step appears, asking only for a username and a password |
| 4 | Enter a username and a 12+ character password twice → **Create and start the event** | The recovery code appears, blocking, with copy and download |
| 5 | Copy the code, tick the box, continue | The control room opens at `/events/<uuid>` — **no `/t/` segment in the URL** |
| 6 | `select count(*) from public.events;` and `select login_name, password_version from public.event_access;` | One event; your username; `password_version = 1` |
| 7 | `select to_regclass('public.teams');` | `NULL` — there is no team table to have written to |
| 8 | `select password_hash, recovery_code_hash from public.event_access;` | Both start `scrypt$`; neither contains the password or the code |
| 9 | Start the timer, rename a speaker, add 15 seconds | The badge goes **Saving** then **Saved** |
| 10 | `select version from public.events;` | Rising with each edit |
| 11 | Browser A: DevTools → Application → Cookies | One `aura_event_<uuid>` cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, expiry ≈30 days out. **No password or token in web storage** — `localStorage` holds only `aura:events` and `aura:event:<id>`, and any `aura:outbox:<id>` is in **`sessionStorage`** |
| 12 | Browser B → **Open an event** → same username and password | The same event opens, at `/events/<same-uuid>` |
| 13 | **Leave both control rooms open.** In B, start/pause the timer | **A follows within a second or two, with no refresh.** This is the controller poll |
| 14 | In A, rename the event; in B, rename it differently at the same moment | Both stay editable — no read-only mode and no "take control" anywhere. The one that saved second shows a **Conflict** banner offering "Use the other version" and "Keep my changes". Neither side is silently overwritten |
| 14a | Open the *same* event in a second tab of browser A and edit both tabs | Both tabs are editable. `sessionStorage["aura:outbox:<id>"]` differs per tab, and neither tab's unsaved edit appears in or is cleared by the other. The later save gets the same conflict banner |
| 14b | With an unsaved edit in one tab, close that tab | Documented limitation: the unsaved edit is gone with the tab. `sessionStorage` survives a reload, not a close |
| 14c | With the conflict banner showing, press **Use the other version** and immediately type a new edit while it loads | Both buttons are disabled and the pressed one is labelled while it loads. The edit survives: the banner stays and says to choose again, and nothing was discarded. Pressing **Keep my changes** then saves the newest edit on top of the server's version |
| 14d | Open a second event in the same tab (navigate from one control room to another) while an edit of the first is still saving | The second event's controls show only the second event, its badge starts clean, and its first save carries the second event's version. The first event's save still lands and clears its own outbox |
| 15 | Let a running timer pass zero, then pause it | The negative value persists. `select remaining_seconds from public.event_runtime;` is negative, and a reload shows the same overtime |
| 16 | Copy the audience link, open it in B or on a phone | The countdown follows, including overtime. No sign-in asked for |
| 17 | Control room → **Create Zoom code**, copy it, open `/zoom`, paste | The timer appears. The page cannot edit anything |
| 18 | In A, turn off the network (DevTools → Offline), make three edits | The badge shows **Offline**. `sessionStorage["aura:outbox:<id>"]` holds the newest edit with its expected version, and `localStorage` holds no outbox key at all |
| 19 | Still offline, reload the page | The edits are **still on screen**, from the outbox |
| 20 | Turn the network back on | The badge returns to **Saved** without any action, and the outbox key disappears |
| 20a | In A, clear the `aura_event_<uuid>` cookie in DevTools while an edit is unsaved | A shows "Sign in again to continue", says the event was **not** deleted, and says the unsaved changes are kept. `localStorage` still holds `aura:event:<id>` and `sessionStorage` still holds `aura:outbox:<id>` |
| 20b | Sign in again in that panel with the same credentials | The control room returns and the unsaved edit is sent. The outbox key disappears |
| 20c | Delete the cookie again and press **Delete this event** | Refused with a message; the event is still listed and still cached. Nothing says "deleted" |
| 21 | Create a **second** event in A with different credentials | Both events are open in A at once |
| 22 | In B (signed in to the first event only), navigate to the second event's URL | "We couldn't find that event" — no name, no date, nothing |
| 23 | In B, **Sign out of this event** | B loses the first event; A keeps both |
| 24 | A: **Change the password** with a wrong current password | Refused; `password_version` unchanged |
| 25 | A: **Change the password** correctly | Succeeds. A stays signed in. `password_version` = 2. `select count(*) from public.event_sessions` is 1 |
| 26 | B: sign in with the old password, then the new one | Old refused, new accepted |
| 27 | A: **New recovery code** → wrong password | Refused, and the stored hash is unchanged |
| 28 | A: **New recovery code** → correct password | A new code appears once. `password_version` is still 2 and sessions are untouched |
| 29 | Try the **old** recovery code at home → **Forgotten the password?** | Refused |
| 30 | Use the **new** code with a new password | Succeeds, shows a further code once, `password_version` = 3, sessions = 1 |
| 31 | Enter a wrong password 11 times | The 11th says "Too many attempts", not "wrong password". `select identifier_hash, address_hash from public.event_auth_attempts limit 1;` shows two 64-character hex strings and no username or IP |
| 32 | Close A completely, reopen it, visit the control room URL | Opens with no sign-in. This is the 30-day session |
| 33 | Control room → **Delete this event** | Gone, and `events`, `agenda_items`, `speakers`, `event_runtime`, `event_access`, `event_sessions` all drop accordingly |
| 34 | Open the deleted event's audience link | No longer found |
| 35 | Home → **Import from CSV** with a two-event file | Asks once for a username prefix and a password, states the numbering (`prefix-1`, `prefix-2`), then shows both recovery codes once with **Copy all** / **Download** |

Failures at 7, 8, 11, 14, 19, 22 or 31 are security- or data-loss-relevant. Stop
and roll back rather than leaving it running.

---

## 7. Rollback limitations

**There is no clean rollback once this migration has committed.**

`teams`, `team_members`, `team_role`, `events.team_id`, `events.created_by` and
`event_runtime.updated_by` are dropped. PostgreSQL does not keep dropped tables or
columns, and this project ships no down-migration. Re-creating the team schema
would give you empty tables, not your data.

What that means in practice:

- **Before you push:** rollback is free. Nothing has happened yet.
- **After you push, with zero controller events:** you can restore the team schema
  by re-running the historical migrations against a fresh database, or by
  restoring a backup taken beforehand. You cannot "undo" the push in place.
- **After controller events exist:** dropping `event_access` destroys **the only
  way into those events**. There is no email address on an event and no second copy
  of the password hash. Nobody — including you — can recover them afterwards.

### Take a backup before pushing

The one genuinely reliable rollback:

```bash
# Before `supabase db push`.
supabase db dump -f pre-controller-auth-schema.sql
supabase db dump --data-only -f pre-controller-auth-data.sql
```

Supabase's own automatic backups (Point-in-Time Recovery on paid plans, daily
backups otherwise) are the other option. Confirm which you have **before** pushing.

### Rolling back the application instead

Almost always the right move if something is wrong after deploying: redeploy the
previous Vercel deployment. But note that the previous application expects
`teams`, `events.team_id` and the membership policies, all of which are now gone —
so the old code **will not work** against the new schema. An application rollback
has to be paired with a database restore.

### Freezing rather than rolling back

If you need to stop controller writes immediately without losing anything:

```sql
revoke execute on function public.create_controller_event(jsonb, text, text, text, text, integer) from service_role;
revoke execute on function public.replace_controller_event(uuid, bigint, jsonb) from service_role;
revoke execute on function public.delete_controller_event(uuid) from service_role;
-- Fully reversible with the matching GRANTs.
```

Reads keep working, every row stays intact, and nothing is destroyed.

---

## 8. Optional maintenance

Expired sessions are pruned by `touch_event_session` on every authorized request,
and stale rate-limit rows by `register_event_auth_attempt`, so no scheduled job is
required. If a project sits idle for a long time and you want to tidy it by hand:

```sql
-- MUTATING, but safe: both only remove rows that are already unusable.
delete from public.event_sessions where expires_at < now();
delete from public.event_auth_attempts where created_at < now() - interval '1 day';
```

---

## 9. Migration history drift

If earlier schema changes were made through the Dashboard or the SQL editor, the
remote database and `supabase_migrations.schema_migrations` disagree, and pushing
either re-runs applied SQL or skips unapplied SQL.

**Never resolve drift by pasting `20260731010000_event_controller_auth.sql` into
the SQL editor.** That applies the schema without recording it — the same problem
one migration later.

Diagnose (read-only):

```bash
supabase migration list
```

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

Then match the case:

- **Applied in the database but missing from the history** — record it without
  re-running: `supabase migration repair --status applied <version>`
- **In the history but never really applied** — mark it reverted, then push:
  `supabase migration repair --status reverted <version>`
- **Remote schema has changes no migration describes** (the manual alignment
  repair in this project's history) — capture them:
  `supabase db diff --linked --schema public -f manual_alignment_backfill`.
  Read the file. If it only describes what is already there, commit it and mark it
  applied; do not push it as a fresh change.
- **Preflight 1e returned rows** — part of this migration already exists. Since
  the file is one transaction, that means somebody ran pieces by hand. Restore
  from backup rather than trying to reconcile it, because the drops in
  [section 3](#3-apply-the-migration) may already have run.

After any repair, `supabase migration list` must show the same set on both sides
before you push.

---

## 10. The security model this leaves you with

- **An event is an independent resource.** No team, no membership, no owner in
  `auth.users`. `events → event_access → event_sessions` is the whole chain.
- **Event data is not publicly writable.** `anon` and `authenticated` hold no
  privilege on any event table and RLS has no policies. Every controller write goes
  through a route handler holding the service-role key, which validates a session
  for the exact event id in the URL and then calls a service-role-only
  transactional function.
- **No browser publishes anything.** Every screen reads. Controllers poll their
  authenticated endpoint about once a second while visible, audience displays poll
  `get_public_event`, and the Zoom App polls `get_zoom_event`. There is no Supabase
  Realtime channel anywhere in the client: a public Broadcast channel is one that
  anybody holding an audience link could also publish on, which would let them push
  a fabricated timer to every screen watching and read whatever a controller put on
  it. A private-channel design could be safe later, but only with receive-only
  authorization, short-lived event-scoped credentials, and server-side-only
  publishing.
- **The rate limiter cannot be reset by an attacker.** A successful sign-in clears
  only the exact username-and-address pair that succeeded, so owning one event does
  not let somebody wipe the record of their failed guesses at another. The
  register-and-count decision holds transaction-scoped advisory locks on both
  buckets, taken in ascending order, so a burst of simultaneous attempts is counted
  rather than all waved through.
- **Credentials are unreachable from the browser**, including the rate-limit table,
  which stores only HMAC digests of the attempted username and client address.
- **Sessions are 30-day HTTP-only cookies named per event.** The database row is
  the authority and its deadline slides forward on every use. Signing out, changing
  the password and recovering the password all end sessions in the same transaction
  that changes the secret.
- **A recovery code is a password-equivalent**, so minting a replacement requires
  the current password and is rate-limited.
- **Losing the password and the recovery code is unrecoverable.** That is the cost
  of an event that needs no account. Both are stored only as scrypt hashes.
- **Controller usernames are globally unique**, so a failed create reveals that a
  name is taken. Every credential endpoint, creation included, is rate-limited in
  the database to blunt that. If public event creation is ever abused, add an
  edge-level control — Vercel WAF rate limiting, or Turnstile on the create form.
  This change deliberately adds no unconfigured third-party dependency for it.
- **There is no event directory.** No endpoint lists events. The home screen's
  "On this device" list is `localStorage` only, and every entry still has to pass
  its own session check.
- **Overtime is real data.** `remaining_seconds` and `panel_remaining_seconds`
  accept negative values within ±86400, so a timer paused past zero persists,
  reloads, synchronises across devices, and reaches audience and Zoom screens as
  the negative number it is.
