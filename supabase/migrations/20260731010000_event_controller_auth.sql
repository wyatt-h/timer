-- Event-scoped controller credentials, and the removal of teams.
--
-- Two changes in one forward-only migration, because they are one decision.
--
-- 1. An event is now an independent resource. It has no team, no owner in
--    `auth.users`, and no membership. The ownership chain is exactly:
--
--        events -> event_access -> event_sessions
--
--    One credential record per event; one session grants access to one event.
--
-- 2. Control of an event is proved by that event's own username and password,
--    held in an opaque server-side session, instead of by a signed-in user who
--    belongs to a team.
--
-- This is deliberately destructive: `teams`, `team_members`, `public.team_role`,
-- `events.team_id`, `events.created_by`, `event_runtime.updated_by`, the
-- membership functions and every team policy are dropped. There is no hidden
-- default team, no nullable compatibility column, and no team-shaped value left
-- anywhere in the schema.
--
-- Nothing here is reachable by `anon` or `authenticated`. Event tables keep RLS
-- with no policies, so the only paths in are the public security-definer readers
-- (audience token, Zoom pairing code) and the service-role transactional writers
-- the Next.js route handlers call.
--
-- Audience links, Zoom pairing codes, agenda, speakers and runtime all keep
-- working; they never depended on a team for anything but a label.
--
-- Note that no browser ever publishes state. Every screen reads: controllers poll
-- their authenticated endpoint, audience displays poll `get_public_event`, and the
-- Zoom App polls `get_zoom_event`. Nothing here grants a client the ability to
-- announce a timer state to anybody else.

begin;

-- ---------------------------------------------------------------------------
-- 0. Refuse to run if legacy event rows exist
-- ---------------------------------------------------------------------------

-- Every event that exists before this migration is a team-owned event with no
-- controller credentials, and none can be invented for it: there is no password
-- to hash and nobody to hand a recovery code to. Rather than drop its ownership
-- and leave an event nobody can control, or delete it, this stops and makes the
-- operator decide. See docs/event-controller-auth-migration.md section 1.
do $$
declare
  v_events bigint;
begin
  select count(*) into v_events from public.events;
  if v_events > 0 then
    raise exception
      'Refusing to migrate: % legacy team-owned event row(s) exist and cannot be '
      'converted to controller-owned events.', v_events
      using hint =
        'Export them first (see the runbook), then delete them explicitly with '
        '"delete from public.events;" and re-run. Nothing is deleted automatically.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Drop the team-dependent RLS policies
-- ---------------------------------------------------------------------------

-- These come first because every one of them calls `is_team_member` or
-- `is_team_owner`, which cannot be dropped while a policy still references them.
-- Named individually rather than swept up by a CASCADE, so nothing unrelated can
-- disappear quietly.
drop policy if exists "members can read teams" on public.teams;
drop policy if exists "authenticated users can create teams" on public.teams;
drop policy if exists "owners can update teams" on public.teams;

drop policy if exists "members can read memberships" on public.team_members;
drop policy if exists "owners can manage memberships" on public.team_members;

drop policy if exists "members can read events" on public.events;
drop policy if exists "members can create events" on public.events;
drop policy if exists "members can update events" on public.events;
drop policy if exists "members can delete events" on public.events;

drop policy if exists "members can manage agenda" on public.agenda_items;
drop policy if exists "members can manage speakers" on public.speakers;
drop policy if exists "members can manage runtime" on public.event_runtime;

-- RLS stays on, now with no policies at all. `anon` and `authenticated` can
-- neither read nor write an event row directly; every read goes through a
-- security-definer function and every write through a service-role one.
alter table public.events enable row level security;
alter table public.agenda_items enable row level security;
alter table public.speakers enable row level security;
alter table public.event_runtime enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Replace the functions that join teams
-- ---------------------------------------------------------------------------

-- The audience payload loses its `team` property and its join. Replaced before
-- `teams` is dropped, so the function is never left referencing a missing table.
create or replace function public.public_event_payload(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', events.id,
      'name', events.name,
      'date', events.event_date,
      'status', events.status,
      'viewerToken', events.viewer_token,
      'createdAt', (extract(epoch from events.created_at) * 1000)::bigint,
      'agenda', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', agenda_items.id,
            'kind', agenda_items.kind,
            'host', agenda_items.host,
            'soundMuted', agenda_items.sound_muted,
            'durationSeconds', agenda_items.duration_seconds,
            'speakerDefaultSeconds', agenda_items.speaker_default_seconds,
            'speakers', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', speakers.id,
                  'name', speakers.name,
                  'durationSeconds', speakers.duration_seconds,
                  'soundMuted', speakers.sound_muted
                )
                order by speakers.order_index
              )
              from public.speakers
              where speakers.agenda_item_id = agenda_items.id
            ), '[]'::jsonb)
          )
          order by agenda_items.order_index
        )
        from public.agenda_items
        where agenda_items.event_id = events.id
      ), '[]'::jsonb),
      'runtime', jsonb_build_object(
        'status', coalesce(event_runtime.status, 'ready'::public.timer_status),
        'segmentIndex', coalesce(event_runtime.segment_index, 0),
        'remainingSeconds', coalesce(event_runtime.remaining_seconds, 0),
        'endsAt', event_runtime.ends_at,
        'panelStatus', event_runtime.panel_status,
        'panelRemainingSeconds', event_runtime.panel_remaining_seconds,
        'panelEndsAt', event_runtime.panel_ends_at,
        'soundEnabled', coalesce(event_runtime.sound_enabled, true),
        'updatedAt', coalesce(event_runtime.updated_at, events.updated_at)
      )
    )
  )
  from public.events
  left join public.event_runtime on event_runtime.event_id = events.id
  where events.id = p_event_id
  limit 1;
$$;

-- Callable only by the two wrappers below, which run as the function owner.
revoke all on function public.public_event_payload(uuid) from public, anon, authenticated;

-- The audience display's read, unchanged in shape and in who may call it.
create or replace function public.get_public_event(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.public_event_payload(events.id)
  from public.events
  where events.viewer_token = p_token
  limit 1;
$$;

revoke all on function public.get_public_event(uuid) from public;
grant execute on function public.get_public_event(uuid) to anon, authenticated;

-- The Zoom App's read, addressed by pairing code. Also unchanged in shape.
create or replace function public.get_zoom_event(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.public_event_payload(events.id)
  from public.events
  where events.zoom_token is not null
    and events.zoom_token = upper(p_token)
  limit 1;
$$;

revoke all on function public.get_zoom_event(text) from public;
grant execute on function public.get_zoom_event(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Remove the events -> teams link
-- ---------------------------------------------------------------------------

-- The foreign key and its index come off first, by name, so this cannot rely on
-- what a column drop happens to take with it.
alter table public.events drop constraint if exists events_team_id_fkey;
drop index if exists public.events_team_id_idx;

-- ---------------------------------------------------------------------------
-- 4. Drop the ownership columns
-- ---------------------------------------------------------------------------

-- An event is owned by its controller credentials and by nothing else. Both of
-- these referenced things that are about to stop existing, and neither is kept
-- as a nullable compatibility field.
alter table public.events drop column if exists team_id;
alter table public.events drop column if exists created_by;

-- The last `auth.users` reference on the event tables. Nothing sets it: a
-- controller is not a user, and the session that made a write is not recorded on
-- the row.
alter table public.event_runtime drop column if exists updated_by;

-- ---------------------------------------------------------------------------
-- 5. Drop team_members
-- ---------------------------------------------------------------------------

-- Before `teams`, because it has a foreign key into it.
drop table if exists public.team_members;

-- ---------------------------------------------------------------------------
-- 6. Drop teams
-- ---------------------------------------------------------------------------

-- Its own triggers (`teams_set_updated_at`, `add_team_owner_after_insert`) go
-- with the table. `public.set_updated_at` is shared with `events` and
-- `event_runtime`, so it stays.
drop table if exists public.teams;

-- ---------------------------------------------------------------------------
-- 7. Drop the obsolete team functions and enum
-- ---------------------------------------------------------------------------

-- Now unreferenced: the policies that called them are gone, and so is the table
-- whose trigger called `add_team_owner`.
drop function if exists public.add_team_owner();
drop function if exists public.is_team_member(uuid);
drop function if exists public.is_team_owner(uuid);

-- `public.event_status`, `public.agenda_kind` and `public.timer_status` are all
-- still in use and stay. Only the membership role goes.
drop type if exists public.team_role;

-- Fails the migration rather than committing a half-removed schema.
do $$
begin
  if to_regclass('public.teams') is not null then
    raise exception 'public.teams still exists after the drop';
  end if;
  if to_regclass('public.team_members') is not null then
    raise exception 'public.team_members still exists after the drop';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and (table_name, column_name) in (('events', 'team_id'), ('events', 'created_by'))
  ) then
    raise exception 'events still carries a team_id or created_by column';
  end if;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('add_team_owner', 'is_team_member', 'is_team_owner')
  ) then
    raise exception 'a team membership function still exists';
  end if;
  -- The public readers must have survived all of the above.
  if to_regprocedure('public.get_public_event(uuid)') is null
    or to_regprocedure('public.get_zoom_event(text)') is null
    or to_regprocedure('public.public_event_payload(uuid)') is null then
    raise exception 'a public reader function was lost';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Let a timer run into overtime
-- ---------------------------------------------------------------------------

-- A countdown does not stop at zero; it keeps counting and the display turns
-- red. The original constraints forbade storing that, so a timer paused in
-- overtime could not be saved at all. Bounded rather than unbounded: a day
-- either side is far more than any run of show, and still rejects nonsense.
alter table public.event_runtime
  drop constraint if exists event_runtime_remaining_seconds_check;
alter table public.event_runtime
  add constraint event_runtime_remaining_seconds_check
  check (remaining_seconds between -86400 and 86400);

alter table public.event_runtime
  drop constraint if exists event_runtime_panel_remaining_seconds_check;
alter table public.event_runtime
  add constraint event_runtime_panel_remaining_seconds_check
  check (
    panel_remaining_seconds is null
    or panel_remaining_seconds between -86400 and 86400
  );

-- ---------------------------------------------------------------------------
-- 9. Optimistic concurrency
-- ---------------------------------------------------------------------------

-- Bumped by `replace_controller_event` only when the writer's expected version
-- matches, so two controller devices editing one event cannot silently overwrite
-- one another.
alter table public.events
add column if not exists version bigint not null default 0;

-- ---------------------------------------------------------------------------
-- 10. Controller credentials
-- ---------------------------------------------------------------------------

create table if not exists public.event_access (
  event_id uuid primary key references public.events(id) on delete cascade,
  -- Globally unique and lower-case, so the sign-in form needs only a username
  -- and a password to find the one event they belong to. Never exposed by a
  -- listing or an availability endpoint.
  login_name text not null unique
    check (login_name = lower(login_name) and login_name ~ '^[a-z0-9][a-z0-9-]{2,47}$'),
  -- scrypt, serialised as scrypt$N$r$p$keylen$salt$hash. Never a raw password.
  password_hash text not null,
  -- The single written-down secret that can replace a forgotten password.
  recovery_code_hash text not null,
  -- Incremented by every password change and every recovery, which is what
  -- retires sessions issued against the previous secret.
  password_version integer not null default 1 check (password_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists event_access_set_updated_at on public.event_access;
create trigger event_access_set_updated_at
before update on public.event_access
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 11. Controller sessions
-- ---------------------------------------------------------------------------

create table if not exists public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  -- SHA-256 of a 256-bit random token generated in the route handler. The raw
  -- token exists only in the browser's HTTP-only cookie, so a database leak
  -- cannot be replayed as a sign-in.
  token_hash text not null unique check (char_length(token_hash) = 64),
  -- Checked against `event_access.password_version` on every request, so a
  -- password change retires sessions even before they are deleted.
  password_version integer not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists event_sessions_event_id_idx on public.event_sessions(event_id);
create index if not exists event_sessions_expires_at_idx on public.event_sessions(expires_at);

-- ---------------------------------------------------------------------------
-- 12. Abuse protection
-- ---------------------------------------------------------------------------

-- Vercel functions are ephemeral, so an in-memory counter would reset under
-- exactly the load it exists to slow down. Only hashes are stored: neither the
-- attempted username nor the client address is recoverable from this table.
create table if not exists public.event_auth_attempts (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('login', 'recover', 'create', 'rotate')),
  identifier_hash text not null check (char_length(identifier_hash) = 64),
  address_hash text not null check (char_length(address_hash) = 64),
  created_at timestamptz not null default now()
);

create index if not exists event_auth_attempts_identifier_idx
on public.event_auth_attempts(scope, identifier_hash, created_at desc);

create index if not exists event_auth_attempts_address_idx
on public.event_auth_attempts(scope, address_hash, created_at desc);

create index if not exists event_auth_attempts_created_at_idx
on public.event_auth_attempts(created_at);

-- ---------------------------------------------------------------------------
-- 13. Lock the new tables down
-- ---------------------------------------------------------------------------

-- RLS on with no policy, so every role except `service_role` (which bypasses
-- RLS) sees an empty table even if a grant were added by mistake later. The
-- revokes remove Supabase's default grants on new tables in `public`.
alter table public.event_access enable row level security;
alter table public.event_sessions enable row level security;
alter table public.event_auth_attempts enable row level security;

revoke all on table public.event_access from anon, authenticated;
revoke all on table public.event_sessions from anon, authenticated;
revoke all on table public.event_auth_attempts from anon, authenticated;

grant select, insert, update, delete on table public.event_access to service_role;
grant select, insert, update, delete on table public.event_sessions to service_role;
grant select, insert, update, delete on table public.event_auth_attempts to service_role;

-- ---------------------------------------------------------------------------
-- 14. Shared helpers
-- ---------------------------------------------------------------------------

-- The application works in epoch milliseconds; the database works in
-- timestamptz. One conversion, used by every writer below.
create or replace function public.ms_to_timestamptz(p_ms bigint)
returns timestamptz
language sql
immutable
as $$
  select case when p_ms is null then null else to_timestamp(p_ms::double precision / 1000.0) end;
$$;

revoke all on function public.ms_to_timestamptz(bigint) from public;

-- The controller's own view of an event: what the audience payload carries, plus
-- the fields an operator owns, the controller username, and the concurrency
-- version. No team, because there is no team.
create or replace function public.controller_event_payload(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', events.version,
    'loginName', event_access.login_name,
    'event', jsonb_build_object(
      'id', events.id,
      'name', events.name,
      'date', events.event_date,
      'status', events.status,
      'viewerToken', events.viewer_token,
      'zoomToken', events.zoom_token,
      'createdAt', (extract(epoch from events.created_at) * 1000)::bigint,
      'agenda', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', agenda_items.id,
            'kind', agenda_items.kind,
            'host', agenda_items.host,
            'soundMuted', agenda_items.sound_muted,
            'durationSeconds', agenda_items.duration_seconds,
            'speakerDefaultSeconds', agenda_items.speaker_default_seconds,
            'speakers', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', speakers.id,
                  'name', speakers.name,
                  'durationSeconds', speakers.duration_seconds,
                  'soundMuted', speakers.sound_muted
                )
                order by speakers.order_index
              )
              from public.speakers
              where speakers.agenda_item_id = agenda_items.id
            ), '[]'::jsonb)
          )
          order by agenda_items.order_index
        )
        from public.agenda_items
        where agenda_items.event_id = events.id
      ), '[]'::jsonb),
      'runtime', jsonb_build_object(
        'status', coalesce(event_runtime.status, 'ready'::public.timer_status),
        'segmentIndex', coalesce(event_runtime.segment_index, 0),
        'remainingSeconds', coalesce(event_runtime.remaining_seconds, 0),
        'endsAt', event_runtime.ends_at,
        'panelStatus', event_runtime.panel_status,
        'panelRemainingSeconds', event_runtime.panel_remaining_seconds,
        'panelEndsAt', event_runtime.panel_ends_at,
        'soundEnabled', coalesce(event_runtime.sound_enabled, true),
        'updatedAt', coalesce(event_runtime.updated_at, events.updated_at)
      )
    )
  )
  from public.events
  join public.event_access on event_access.event_id = events.id
  left join public.event_runtime on event_runtime.event_id = events.id
  where events.id = p_event_id
  limit 1;
$$;

revoke all on function public.controller_event_payload(uuid) from public, anon, authenticated;
grant execute on function public.controller_event_payload(uuid) to service_role;

-- The agenda and its speakers are rewritten wholesale from the submitted
-- document rather than diffed. One statement pair keeps ordering, removal and
-- insertion in a single atomic step, and `on delete cascade` from `agenda_items`
-- removes the speakers of any item that disappeared.
create or replace function public.write_event_children(p_event_id uuid, p_event jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.agenda_items where event_id = p_event_id;

  insert into public.agenda_items (
    id, event_id, kind, duration_seconds, speaker_default_seconds,
    host, sound_muted, order_index
  )
  select
    (item.value->>'id')::uuid,
    p_event_id,
    (item.value->>'kind')::public.agenda_kind,
    (item.value->>'durationSeconds')::integer,
    (item.value->>'speakerDefaultSeconds')::integer,
    nullif(item.value->>'host', ''),
    (item.value->>'soundMuted')::boolean,
    (item.ordinality - 1)::integer
  from jsonb_array_elements(coalesce(p_event->'agenda', '[]'::jsonb))
    with ordinality as item(value, ordinality);

  insert into public.speakers (
    id, agenda_item_id, name, duration_seconds, sound_muted, order_index
  )
  select
    (speaker.value->>'id')::uuid,
    (item.value->>'id')::uuid,
    coalesce(speaker.value->>'name', ''),
    (speaker.value->>'durationSeconds')::integer,
    (speaker.value->>'soundMuted')::boolean,
    (speaker.ordinality - 1)::integer
  from jsonb_array_elements(coalesce(p_event->'agenda', '[]'::jsonb))
      with ordinality as item(value, ordinality),
    jsonb_array_elements(coalesce(item.value->'speakers', '[]'::jsonb))
      with ordinality as speaker(value, ordinality);

  insert into public.event_runtime (
    event_id, status, segment_index, remaining_seconds, ends_at,
    panel_status, panel_remaining_seconds, panel_ends_at, sound_enabled
  )
  values (
    p_event_id,
    coalesce((p_event->'runtime'->>'status')::public.timer_status, 'ready'),
    coalesce((p_event->'runtime'->>'segmentIndex')::integer, 0),
    coalesce((p_event->'runtime'->>'remainingSeconds')::numeric, 0),
    public.ms_to_timestamptz((p_event->'runtime'->>'endsAt')::bigint),
    (p_event->'runtime'->>'panelStatus')::public.timer_status,
    (p_event->'runtime'->>'panelRemainingSeconds')::numeric,
    public.ms_to_timestamptz((p_event->'runtime'->>'panelEndsAt')::bigint),
    coalesce((p_event->'runtime'->>'soundEnabled')::boolean, true)
  )
  on conflict (event_id) do update set
    status = excluded.status,
    segment_index = excluded.segment_index,
    remaining_seconds = excluded.remaining_seconds,
    ends_at = excluded.ends_at,
    panel_status = excluded.panel_status,
    panel_remaining_seconds = excluded.panel_remaining_seconds,
    panel_ends_at = excluded.panel_ends_at,
    sound_enabled = excluded.sound_enabled,
    updated_at = now();
end;
$$;

/*
 * Not granted to `service_role` either. It is a helper the writers below call
 * while running as the function owner, and nothing outside this file has any
 * business invoking it directly.
 */
revoke all on function public.write_event_children(uuid, jsonb) from public, anon, authenticated;

-- Issues a session row. Shared by creation and by every credential mutation, so
-- there is one definition of what a session is. The caller supplies the SHA-256
-- of a token it generated; the raw token never reaches the database.
create or replace function public.issue_event_session(
  p_event_id uuid,
  p_token_hash text,
  p_password_version integer,
  p_ttl_seconds integer
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.event_sessions (event_id, token_hash, password_version, expires_at)
  values (
    p_event_id,
    p_token_hash,
    p_password_version,
    now() + make_interval(secs => p_ttl_seconds)
  );
$$;

-- Also not granted to `service_role`: only the definer functions above call it.
revoke all on function public.issue_event_session(uuid, text, integer, integer)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 15. Transactional event writers
-- ---------------------------------------------------------------------------

-- Creates an event, the credentials that own it, its agenda, its speakers, its
-- runtime and the creating device's session as one commit. No team is created,
-- looked up, or referenced. The caller has already hashed the password and the
-- recovery code; neither secret is ever seen here in the clear.
create or replace function public.create_controller_event(
  p_event jsonb,
  p_login_name text,
  p_password_hash text,
  p_recovery_code_hash text,
  p_token_hash text,
  p_ttl_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  if exists (select 1 from public.event_access where login_name = p_login_name) then
    return jsonb_build_object('status', 'login_taken');
  end if;

  insert into public.events (
    id, name, event_date, status, viewer_token, zoom_token, version
  )
  values (
    coalesce((p_event->>'id')::uuid, gen_random_uuid()),
    p_event->>'name',
    coalesce((p_event->>'date')::date, current_date),
    coalesce((p_event->>'status')::public.event_status, 'draft'),
    coalesce((p_event->>'viewerToken')::uuid, gen_random_uuid()),
    nullif(p_event->>'zoomToken', ''),
    0
  )
  returning id into v_event_id;

  insert into public.event_access (
    event_id, login_name, password_hash, recovery_code_hash, password_version
  )
  values (v_event_id, p_login_name, p_password_hash, p_recovery_code_hash, 1);

  perform public.write_event_children(v_event_id, p_event);
  perform public.issue_event_session(v_event_id, p_token_hash, 1, p_ttl_seconds);

  return jsonb_build_object(
    'status', 'created',
    'payload', public.controller_event_payload(v_event_id)
  );
exception
  when unique_violation then
    /*
     * Two creators racing for the same username: the pre-check passed for both
     * and the constraint caught the loser. Re-check rather than assume — any
     * other unique violation is a genuine fault and must not be reported as a
     * taken username.
     */
    if exists (select 1 from public.event_access where login_name = p_login_name) then
      return jsonb_build_object('status', 'login_taken');
    end if;
    raise;
end;
$$;

revoke all on function public.create_controller_event(jsonb, text, text, text, text, integer)
from public, anon, authenticated;
grant execute on function public.create_controller_event(jsonb, text, text, text, text, integer)
to service_role;

-- Replaces one already-authorized event's editable state. The event id is a
-- parameter the caller has already proved a session for; nothing is chosen from
-- membership or from anything else the browser controls. The version check makes
-- a stale writer fail instead of overwrite.
create or replace function public.replace_controller_event(
  p_event_id uuid,
  p_expected_version bigint,
  p_event jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version bigint;
begin
  -- Serialises concurrent writers for this one event; the second reads the
  -- committed version and reports a conflict.
  select version into v_version
  from public.events
  where id = p_event_id
  for update;

  if v_version is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_version <> p_expected_version then
    return jsonb_build_object(
      'status', 'conflict',
      'payload', public.controller_event_payload(p_event_id)
    );
  end if;

  update public.events set
    name = p_event->>'name',
    event_date = coalesce((p_event->>'date')::date, event_date),
    status = coalesce((p_event->>'status')::public.event_status, status),
    -- A pairing code is minted once and never reassigned, so an existing code
    -- wins over whatever the client submitted.
    zoom_token = coalesce(zoom_token, nullif(p_event->>'zoomToken', '')),
    version = version + 1
  where id = p_event_id;

  perform public.write_event_children(p_event_id, p_event);

  return jsonb_build_object(
    'status', 'updated',
    'payload', public.controller_event_payload(p_event_id)
  );
end;
$$;

revoke all on function public.replace_controller_event(uuid, bigint, jsonb)
from public, anon, authenticated;
grant execute on function public.replace_controller_event(uuid, bigint, jsonb) to service_role;

-- Deletes one event. Agenda, speakers, runtime, credentials and sessions all go
-- with it through `on delete cascade`.
create or replace function public.delete_controller_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.events where id = p_event_id;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('status', case when v_deleted > 0 then 'deleted' else 'not_found' end);
end;
$$;

revoke all on function public.delete_controller_event(uuid) from public, anon, authenticated;
grant execute on function public.delete_controller_event(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 16. Transactional credential mutations
-- ---------------------------------------------------------------------------

-- Changing a password is six writes that must all happen or none: the new hash,
-- the version bump, the old sessions' removal, and the replacement session for
-- the device making the change. Split across separate statements, a failure
-- between them could leave an event with a new password and no way in, or with
-- old sessions still trusted. Each of the three functions below is one commit.
--
-- The password itself is verified in the route handler, because scrypt lives in
-- Node. `p_expected_version` is what makes that check meaningful under
-- concurrency: the row is locked and the version re-read, so two simultaneous
-- changes cannot both think they verified against the current secret.

create or replace function public.change_controller_password(
  p_event_id uuid,
  p_expected_version integer,
  p_password_hash text,
  p_token_hash text,
  p_ttl_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version integer;
begin
  select password_version into v_version
  from public.event_access
  where event_id = p_event_id
  for update;

  if v_version is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_version <> p_expected_version then
    return jsonb_build_object('status', 'version_mismatch');
  end if;

  update public.event_access
  set password_hash = p_password_hash,
      password_version = v_version + 1
  where event_id = p_event_id;

  -- Everything issued against the old password stops being trusted...
  delete from public.event_sessions where event_id = p_event_id;
  -- ...including this device's, which is replaced in the same commit so the
  -- operator who made the change is never signed out by their own request.
  perform public.issue_event_session(p_event_id, p_token_hash, v_version + 1, p_ttl_seconds);

  return jsonb_build_object('status', 'changed', 'passwordVersion', v_version + 1);
end;
$$;

revoke all on function public.change_controller_password(uuid, integer, text, text, integer)
from public, anon, authenticated;
grant execute on function public.change_controller_password(uuid, integer, text, text, integer)
to service_role;

-- Recovery does everything a password change does and rotates the recovery code
-- as well, so the piece of paper that was just used cannot be used again.
create or replace function public.recover_controller_password(
  p_event_id uuid,
  p_expected_version integer,
  p_password_hash text,
  p_recovery_code_hash text,
  p_token_hash text,
  p_ttl_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version integer;
begin
  select password_version into v_version
  from public.event_access
  where event_id = p_event_id
  for update;

  if v_version is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_version <> p_expected_version then
    return jsonb_build_object('status', 'version_mismatch');
  end if;

  update public.event_access
  set password_hash = p_password_hash,
      recovery_code_hash = p_recovery_code_hash,
      password_version = v_version + 1
  where event_id = p_event_id;

  delete from public.event_sessions where event_id = p_event_id;
  perform public.issue_event_session(p_event_id, p_token_hash, v_version + 1, p_ttl_seconds);

  /*
   * The payload is built here, inside the transaction that changed the secrets,
   * rather than fetched again afterwards. A second round trip could fail after
   * this commit, and the caller would then get an error having already had its
   * password replaced — losing the one-time recovery code the response was
   * carrying, with no way to ever see it again.
   */
  return jsonb_build_object(
    'status', 'recovered',
    'passwordVersion', v_version + 1,
    'payload', public.controller_event_payload(p_event_id)
  );
end;
$$;

revoke all on function public.recover_controller_password(uuid, integer, text, text, text, integer)
from public, anon, authenticated;
grant execute on function public.recover_controller_password(uuid, integer, text, text, text, integer)
to service_role;

-- Replacing the stored hash is what invalidates the previous code; there is
-- never more than one live at a time. The password is not changed, so
-- `password_version` does not move and other devices stay signed in.
create or replace function public.rotate_controller_recovery_code(
  p_event_id uuid,
  p_expected_version integer,
  p_recovery_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version integer;
begin
  select password_version into v_version
  from public.event_access
  where event_id = p_event_id
  for update;

  if v_version is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_version <> p_expected_version then
    return jsonb_build_object('status', 'version_mismatch');
  end if;

  update public.event_access
  set recovery_code_hash = p_recovery_code_hash
  where event_id = p_event_id;

  return jsonb_build_object('status', 'rotated', 'passwordVersion', v_version);
end;
$$;

revoke all on function public.rotate_controller_recovery_code(uuid, integer, text)
from public, anon, authenticated;
grant execute on function public.rotate_controller_recovery_code(uuid, integer, text)
to service_role;

-- ---------------------------------------------------------------------------
-- 17. Session and rate-limit maintenance
-- ---------------------------------------------------------------------------

-- Validates a session token hash and, on success, records the use and slides the
-- deadline forward. Expired rows are removed on the way past, so the table stays
-- bounded without a scheduled job.
create or replace function public.touch_event_session(
  p_token_hash text,
  p_ttl_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_session_version integer;
  v_password_version integer;
begin
  delete from public.event_sessions where expires_at < now();

  select s.event_id, s.password_version, a.password_version
  into v_event_id, v_session_version, v_password_version
  from public.event_sessions s
  join public.event_access a on a.event_id = s.event_id
  where s.token_hash = p_token_hash
    and s.expires_at > now();

  if v_event_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  if v_session_version <> v_password_version then
    -- The password changed under this session. Retire it rather than leave a
    -- token that keeps failing.
    delete from public.event_sessions where token_hash = p_token_hash;
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.event_sessions set
    last_used_at = now(),
    expires_at = now() + make_interval(secs => p_ttl_seconds)
  where token_hash = p_token_hash;

  return jsonb_build_object(
    'status', 'valid',
    'eventId', v_event_id,
    'passwordVersion', v_password_version
  );
end;
$$;

revoke all on function public.touch_event_session(text, integer) from public, anon, authenticated;
grant execute on function public.touch_event_session(text, integer) to service_role;

-- One round trip for the whole decision: prune the window, record the attempt,
-- then count what is left for this username and this client address. Counting
-- after the insert means sustained hammering keeps the limit engaged instead of
-- freeing a slot on the window boundary.
create or replace function public.register_event_auth_attempt(
  p_scope text,
  p_identifier_hash text,
  p_address_hash text,
  p_window_seconds integer,
  p_max_attempts integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(secs => p_window_seconds);
  v_identifier_count integer;
  v_address_count integer;
  v_oldest timestamptz;
  v_identifier_key bigint := hashtextextended(p_scope || ':identifier:' || p_identifier_hash, 0);
  v_address_key bigint := hashtextextended(p_scope || ':address:' || p_address_hash, 0);
  v_first bigint := least(v_identifier_key, v_address_key);
  v_second bigint := greatest(v_identifier_key, v_address_key);
begin
  /*
   * Without this, a burst of simultaneous attempts all pass. Each transaction
   * inserts its own row and then counts, but none can see the others' uncommitted
   * inserts, so twenty concurrent guesses each count themselves as the first and
   * every one is allowed through.
   *
   * The locks serialise the two buckets this attempt touches, so the second
   * request waits for the first to commit and then counts a table that includes
   * it. They are transaction-scoped, so they are released on commit or rollback
   * with nothing to clean up.
   *
   * Taken in ascending key order, always. Two attempts that share one bucket and
   * differ in the other would otherwise be able to grab one lock each and wait on
   * one another forever.
   */
  perform pg_advisory_xact_lock(v_first);
  if v_second <> v_first then
    perform pg_advisory_xact_lock(v_second);
  end if;

  -- Two windows of history are kept so a concurrent request in another function
  -- instance cannot lose rows it is still counting.
  delete from public.event_auth_attempts
  where created_at < now() - make_interval(secs => p_window_seconds * 2);

  insert into public.event_auth_attempts (scope, identifier_hash, address_hash)
  values (p_scope, p_identifier_hash, p_address_hash);

  select count(*) into v_identifier_count
  from public.event_auth_attempts
  where scope = p_scope and identifier_hash = p_identifier_hash and created_at >= v_since;

  select count(*) into v_address_count
  from public.event_auth_attempts
  where scope = p_scope and address_hash = p_address_hash and created_at >= v_since;

  if greatest(v_identifier_count, v_address_count) > p_max_attempts then
    select min(created_at) into v_oldest
    from public.event_auth_attempts
    where scope = p_scope
      and created_at >= v_since
      and (identifier_hash = p_identifier_hash or address_hash = p_address_hash);

    return jsonb_build_object(
      'limited', true,
      'retryAfterSeconds',
      greatest(1, ceil(p_window_seconds - extract(epoch from now() - v_oldest))::integer)
    );
  end if;

  return jsonb_build_object('limited', false, 'retryAfterSeconds', 0);
end;
$$;

revoke all on function public.register_event_auth_attempt(text, text, text, integer, integer)
from public, anon, authenticated;
grant execute on function public.register_event_auth_attempt(text, text, text, integer, integer)
to service_role;

-- Called after a successful sign-in or recovery, so an operator who mistyped a
-- few times is not held back by their own earlier attempts.
--
-- Scoped to the exact identifier AND address that just succeeded, never to either
-- one alone. Matching on `or` would mean that signing in successfully to an event
-- you do own wipes the address bucket, clearing the record of your failed guesses
-- against every other event from that same machine — an attacker with one event of
-- their own could reset their own rate limit at will.
create or replace function public.clear_event_auth_attempts(
  p_scope text,
  p_identifier_hash text,
  p_address_hash text
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.event_auth_attempts
  where scope = p_scope
    and identifier_hash = p_identifier_hash
    and address_hash = p_address_hash;
$$;

revoke all on function public.clear_event_auth_attempts(text, text, text)
from public, anon, authenticated;
grant execute on function public.clear_event_auth_attempts(text, text, text) to service_role;

commit;
