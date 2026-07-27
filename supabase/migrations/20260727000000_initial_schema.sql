create extension if not exists "pgcrypto";

create type public.team_role as enum ('owner', 'admin');
create type public.event_status as enum ('draft', 'live', 'completed');
create type public.agenda_kind as enum ('single', 'panel');
create type public.timer_status as enum ('ready', 'running', 'paused', 'ended');

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z]{2,32}$'),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.team_role not null default 'admin',
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  event_date date not null default current_date,
  location text not null default '',
  status public.event_status not null default 'draft',
  viewer_token uuid not null unique default gen_random_uuid(),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_team_id_idx on public.events(team_id);
create index events_viewer_token_idx on public.events(viewer_token);

create table public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  kind public.agenda_kind not null default 'single',
  title text not null check (char_length(title) between 1 and 160),
  duration_seconds integer not null check (duration_seconds between 1 and 86400),
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create index agenda_items_event_id_idx on public.agenda_items(event_id, order_index);

create table public.speakers (
  id uuid primary key default gen_random_uuid(),
  agenda_item_id uuid not null references public.agenda_items(id) on delete cascade,
  name text not null default '',
  duration_seconds integer not null check (duration_seconds between 1 and 86400),
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create index speakers_agenda_item_id_idx on public.speakers(agenda_item_id, order_index);

create table public.event_runtime (
  event_id uuid primary key references public.events(id) on delete cascade,
  status public.timer_status not null default 'ready',
  segment_index integer not null default 0 check (segment_index >= 0),
  remaining_seconds numeric not null default 0 check (remaining_seconds >= 0),
  ends_at timestamptz,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger teams_set_updated_at
before update on public.teams
for each row execute procedure public.set_updated_at();

create trigger events_set_updated_at
before update on public.events
for each row execute procedure public.set_updated_at();

create trigger runtime_set_updated_at
before update on public.event_runtime
for each row execute procedure public.set_updated_at();

create or replace function public.add_team_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.team_members (team_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger add_team_owner_after_insert
after insert on public.teams
for each row execute procedure public.add_team_owner();

create or replace function public.is_team_member(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = target_team_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_team_owner(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = target_team_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.events enable row level security;
alter table public.agenda_items enable row level security;
alter table public.speakers enable row level security;
alter table public.event_runtime enable row level security;

create policy "members can read teams"
on public.teams for select
using (public.is_team_member(id));

create policy "authenticated users can create teams"
on public.teams for insert
to authenticated
with check (created_by = auth.uid());

create policy "owners can update teams"
on public.teams for update
using (public.is_team_member(id))
with check (public.is_team_member(id));

create policy "members can read memberships"
on public.team_members for select
using (public.is_team_member(team_id));

create policy "owners can manage memberships"
on public.team_members for all
using (public.is_team_owner(team_id))
with check (public.is_team_owner(team_id));

create policy "members can read events"
on public.events for select
using (public.is_team_member(team_id));

create policy "members can create events"
on public.events for insert
with check (public.is_team_member(team_id) and created_by = auth.uid());

create policy "members can update events"
on public.events for update
using (public.is_team_member(team_id))
with check (public.is_team_member(team_id));

create policy "members can delete events"
on public.events for delete
using (public.is_team_member(team_id));

create policy "members can manage agenda"
on public.agenda_items for all
using (
  exists (
    select 1 from public.events
    where events.id = agenda_items.event_id
      and public.is_team_member(events.team_id)
  )
)
with check (
  exists (
    select 1 from public.events
    where events.id = agenda_items.event_id
      and public.is_team_member(events.team_id)
  )
);

create policy "members can manage speakers"
on public.speakers for all
using (
  exists (
    select 1
    from public.agenda_items
    join public.events on events.id = agenda_items.event_id
    where agenda_items.id = speakers.agenda_item_id
      and public.is_team_member(events.team_id)
  )
)
with check (
  exists (
    select 1
    from public.agenda_items
    join public.events on events.id = agenda_items.event_id
    where agenda_items.id = speakers.agenda_item_id
      and public.is_team_member(events.team_id)
  )
);

create policy "members can manage runtime"
on public.event_runtime for all
using (
  exists (
    select 1 from public.events
    where events.id = event_runtime.event_id
      and public.is_team_member(events.team_id)
  )
)
with check (
  exists (
    select 1 from public.events
    where events.id = event_runtime.event_id
      and public.is_team_member(events.team_id)
  )
);

create or replace function public.get_public_event(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'team', teams.slug,
    'event', jsonb_build_object(
      'id', events.id,
      'name', events.name,
      'date', events.event_date,
      'location', events.location,
      'status', events.status,
      'viewerToken', events.viewer_token,
      'createdAt', (extract(epoch from events.created_at) * 1000)::bigint,
      'agenda', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', agenda_items.id,
            'kind', agenda_items.kind,
            'title', agenda_items.title,
            'durationSeconds', agenda_items.duration_seconds,
            'speakers', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', speakers.id,
                  'name', speakers.name,
                  'durationSeconds', speakers.duration_seconds
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
        'updatedAt', coalesce(event_runtime.updated_at, events.updated_at)
      )
    )
  )
  from public.events
  join public.teams on teams.id = events.team_id
  left join public.event_runtime on event_runtime.event_id = events.id
  where events.viewer_token = p_token
  limit 1;
$$;

revoke all on function public.get_public_event(uuid) from public;
grant execute on function public.get_public_event(uuid) to anon, authenticated;

alter publication supabase_realtime add table public.event_runtime;
