begin;

-- An event is opened with its display name and password. Keep one canonical key
-- internally so capitalization and repeated whitespace do not create names that
-- look identical in the UI.
create or replace function public.event_access_key(p_name text)
returns text
language sql
immutable
strict
as $$
  select lower(regexp_replace(btrim(p_name), '[[:space:]]+', ' ', 'g'));
$$;

revoke all on function public.event_access_key(text) from public, anon, authenticated;

-- Recovery credentials and their public functions are intentionally removed.
drop function if exists public.recover_controller_password(uuid, integer, text, text, text, integer);
drop function if exists public.rotate_controller_recovery_code(uuid, integer, text);

alter table public.event_access
  drop column if exists recovery_code_hash;

alter table public.event_access
  drop constraint if exists event_access_login_name_check;

-- The database was reset before this migration, but canonicalize any rows when
-- applying the full history to a non-empty development database as well.
update public.event_access access
set login_name = public.event_access_key(events.name)
from public.events events
where events.id = access.event_id;

alter table public.event_access
  add constraint event_access_login_name_check
  check (
    char_length(login_name) between 1 and 120
    and login_name = public.event_access_key(login_name)
  );

delete from public.event_auth_attempts where scope in ('recover', 'rotate');
alter table public.event_auth_attempts
  drop constraint if exists event_auth_attempts_scope_check;
alter table public.event_auth_attempts
  add constraint event_auth_attempts_scope_check
  check (scope in ('login', 'create'));

-- Replace the old six-argument creator with one that derives the access key from
-- the event document and stores only a password hash.
drop function if exists public.create_controller_event(jsonb, text, text, text, text, integer);

create function public.create_controller_event(
  p_event jsonb,
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
  v_login_name text := public.event_access_key(p_event->>'name');
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

revoke all on function public.create_controller_event(jsonb, text, text, integer)
from public, anon, authenticated;
grant execute on function public.create_controller_event(jsonb, text, text, integer)
to service_role;

-- Renaming an event renames its sign-in identifier in the same transaction. A
-- duplicate name is reported without changing either the event or its access row.
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
  v_login_name text := public.event_access_key(p_event->>'name');
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

  if exists (
    select 1 from public.event_access
    where login_name = v_login_name and event_id <> p_event_id
  ) then
    return jsonb_build_object('status', 'login_taken');
  end if;

  update public.event_access
  set login_name = v_login_name
  where event_id = p_event_id;

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
exception
  when unique_violation then
    if exists (
      select 1 from public.event_access
      where login_name = v_login_name and event_id <> p_event_id
    ) then
      return jsonb_build_object('status', 'login_taken');
    end if;
    raise;
end;
$$;

revoke all on function public.replace_controller_event(uuid, bigint, jsonb)
from public, anon, authenticated;
grant execute on function public.replace_controller_event(uuid, bigint, jsonb)
to service_role;

commit;
