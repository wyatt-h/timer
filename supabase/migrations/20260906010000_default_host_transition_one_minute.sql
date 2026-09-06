begin;

-- One minute reflects the ordinary host handoff between agenda items. This
-- changes only the default; an event whose controller deliberately chose zero
-- keeps zero.
alter table public.events
  alter column host_transition_seconds set default 60;

-- Older clients may omit the setting. Keep their newly created events aligned
-- with the database and current application default too.
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
    coalesce((p_event->>'hostTransitionSeconds')::integer, 60),
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

commit;
