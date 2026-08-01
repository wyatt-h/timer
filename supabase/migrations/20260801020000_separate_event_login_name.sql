begin;

-- Event titles are presentation. A controller login name is a stable credential:
-- it is chosen separately at creation, stored canonically in lowercase, and does
-- not change when somebody edits the title shown to the audience.

drop function if exists public.create_controller_event(jsonb, text, text, integer);

create function public.create_controller_event(
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

-- Replacing an event edits only its presentation and run-of-show data. Its
-- credential row is intentionally not touched.
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
