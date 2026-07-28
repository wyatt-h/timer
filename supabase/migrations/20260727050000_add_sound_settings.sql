-- End-of-timer sound. The control room holds a master switch for every
-- audience display, and individual speakers or whole panels can be silenced.

alter table public.event_runtime
add column if not exists sound_enabled boolean not null default true;

alter table public.agenda_items
add column if not exists sound_muted boolean;

alter table public.speakers
add column if not exists sound_muted boolean;

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
  where events.viewer_token = p_token
  limit 1;
$$;
