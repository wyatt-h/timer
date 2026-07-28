-- Panels can name a host, who runs the session without taking a timed slot.

alter table public.agenda_items
add column if not exists host text
check (host is null or char_length(host) <= 120);

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
            'durationSeconds', agenda_items.duration_seconds,
            'speakerDefaultSeconds', agenda_items.speaker_default_seconds,
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
        'panelStatus', event_runtime.panel_status,
        'panelRemainingSeconds', event_runtime.panel_remaining_seconds,
        'panelEndsAt', event_runtime.panel_ends_at,
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
