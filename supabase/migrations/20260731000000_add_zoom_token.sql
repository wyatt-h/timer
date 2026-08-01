-- Pairing code for the Zoom App. Zoom's meeting webview does not necessarily
-- carry the operator's browser session, so the control room mints a short code
-- per event that the operator pastes into the app. It grants exactly what the
-- audience display already grants: read-only access to one event.
--
-- Nullable with no default: a code exists only once an operator asks for one.

alter table public.events
add column if not exists zoom_token text unique
check (zoom_token is null or char_length(zoom_token) between 8 and 64);

-- The audience payload was duplicated in every migration that touched the
-- schema. It moves into one function so the viewer-token and Zoom-code lookups
-- cannot drift apart.
create or replace function public.public_event_payload(p_event_id uuid)
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
  join public.teams on teams.id = events.team_id
  left join public.event_runtime on event_runtime.event_id = events.id
  where events.id = p_event_id
  limit 1;
$$;

-- Callable only by the two security-definer wrappers below, which run as the
-- function owner.
revoke all on function public.public_event_payload(uuid) from public;

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

-- Same payload, addressed by the Zoom pairing code.
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
