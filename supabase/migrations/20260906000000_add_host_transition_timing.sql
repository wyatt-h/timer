begin;

-- A planning allowance for the host's handoff between agenda items. It belongs
-- to the event rather than an agenda row because one value applies uniformly to
-- every remaining boundary. Existing events keep their current projection.
alter table public.events
  add column if not exists host_transition_seconds integer not null default 0
  constraint events_host_transition_seconds_check
  check (host_transition_seconds between 0 and 3600);

-- Return the allowance to authenticated controllers. It is intentionally absent
-- from the public speaker and Zoom payloads because neither display calculates a
-- projected programme finish.
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
      'hostTransitionSeconds', events.host_transition_seconds,
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

-- Preserve the setting if event creation starts carrying it in the future; the
-- current create screen sends zero.
create or replace function public.create_controller_event(
  p_event jsonb,
  p_login_name text,
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
  v_event_id uuid;
  v_login_name text := public.event_access_key(p_login_name);
begin
  if exists (select 1 from public.event_access where login_name = v_login_name) then
    return jsonb_build_object('status', 'login_taken');
  end if;

  insert into public.events (
    id, name, event_date, status, viewer_token, zoom_token,
    host_transition_seconds, version
  )
  values (
    coalesce((p_event->>'id')::uuid, gen_random_uuid()),
    p_event->>'name',
    coalesce((p_event->>'date')::date, current_date),
    coalesce((p_event->>'status')::public.event_status, 'draft'),
    coalesce((p_event->>'viewerToken')::uuid, gen_random_uuid()),
    nullif(p_event->>'zoomToken', ''),
    coalesce((p_event->>'hostTransitionSeconds')::integer, 0),
    0
  )
  returning id into v_event_id;

  insert into public.event_access (
    event_id, login_name, password_hash, password_version
  )
  values (v_event_id, v_login_name, p_password_hash, 1);

  perform public.write_event_children(v_event_id, p_event);
  perform public.issue_event_session(v_event_id, p_token_hash, 1, p_ttl_seconds);

  return jsonb_build_object(
    'status', 'created',
    'payload', public.controller_event_payload(v_event_id)
  );
exception
  when unique_violation then
    if exists (select 1 from public.event_access where login_name = v_login_name) then
      return jsonb_build_object('status', 'login_taken');
    end if;
    raise;
end;
$$;

revoke all on function public.create_controller_event(jsonb, text, text, text, integer)
from public, anon, authenticated;
grant execute on function public.create_controller_event(jsonb, text, text, text, integer)
to service_role;

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
    zoom_token = coalesce(zoom_token, nullif(p_event->>'zoomToken', '')),
    host_transition_seconds = coalesce(
      (p_event->>'hostTransitionSeconds')::integer,
      host_transition_seconds
    ),
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
grant execute on function public.replace_controller_event(uuid, bigint, jsonb)
to service_role;

commit;
