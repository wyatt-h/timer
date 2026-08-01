begin;

-- One-time bearer invitations let another device join an event without exposing
-- the event password. Only a SHA-256 digest is stored; the raw token exists in
-- the copied URL and the recipient's browser until redemption.
create table public.event_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at)
);

create index event_invites_event_id_idx on public.event_invites(event_id);
create index event_invites_expires_at_idx on public.event_invites(expires_at);

alter table public.event_invites enable row level security;
revoke all on table public.event_invites from anon, authenticated;
grant select, insert, update, delete on table public.event_invites to service_role;

-- There is at most one outstanding invitation per event. Creating another one
-- revokes the previous link, which is also a simple recovery path if a link was
-- pasted into the wrong conversation.
create function public.create_event_invite(
  p_event_id uuid,
  p_token_hash text,
  p_ttl_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_id uuid;
  v_expires_at timestamptz;
begin
  if p_ttl_seconds < 1 or p_ttl_seconds > 604800 then
    raise exception 'invalid invite ttl';
  end if;

  if not exists (select 1 from public.event_access where event_id = p_event_id) then
    return jsonb_build_object('status', 'not_found');
  end if;

  delete from public.event_invites
  where expires_at <= now() or event_id = p_event_id;

  insert into public.event_invites (event_id, token_hash, expires_at)
  values (
    p_event_id,
    p_token_hash,
    now() + make_interval(secs => p_ttl_seconds)
  )
  returning id, expires_at into v_invite_id, v_expires_at;

  return jsonb_build_object(
    'status', 'created',
    'inviteId', v_invite_id,
    'expiresAt', v_expires_at
  );
end;
$$;

revoke all on function public.create_event_invite(uuid, text, integer)
from public, anon, authenticated;
grant execute on function public.create_event_invite(uuid, text, integer) to service_role;

-- Redemption consumes the invitation and issues the recipient's event session in
-- the same transaction. A failure can therefore never burn the link without also
-- creating the session it promised.
create function public.redeem_event_invite(
  p_token_hash text,
  p_session_token_hash text,
  p_session_ttl_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_password_version integer;
begin
  delete from public.event_invites
  where expires_at <= now();

  delete from public.event_invites
  where token_hash = p_token_hash and expires_at > now()
  returning event_id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select password_version into v_password_version
  from public.event_access
  where event_id = v_event_id;

  if v_password_version is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  perform public.issue_event_session(
    v_event_id,
    p_session_token_hash,
    v_password_version,
    p_session_ttl_seconds
  );

  return jsonb_build_object(
    'status', 'redeemed',
    'eventId', v_event_id,
    'payload', public.controller_event_payload(v_event_id)
  );
end;
$$;

revoke all on function public.redeem_event_invite(text, text, integer)
from public, anon, authenticated;
grant execute on function public.redeem_event_invite(text, text, integer) to service_role;

create function public.revoke_event_invite(p_event_id uuid, p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.event_invites
  where id = p_invite_id and event_id = p_event_id;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object(
    'status', case when v_deleted > 0 then 'revoked' else 'not_found' end
  );
end;
$$;

revoke all on function public.revoke_event_invite(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.revoke_event_invite(uuid, uuid) to service_role;

-- A password change is commonly used to remove access. Outstanding invitations
-- must disappear in the same transaction as the old sessions, or an old link
-- could immediately create a fresh session against the new password version.
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

  delete from public.event_sessions where event_id = p_event_id;
  delete from public.event_invites where event_id = p_event_id;
  perform public.issue_event_session(p_event_id, p_token_hash, v_version + 1, p_ttl_seconds);

  return jsonb_build_object('status', 'changed', 'passwordVersion', v_version + 1);
end;
$$;

-- Invitation redemption is public but the token is unguessable. A separate
-- rate-limit scope still prevents an address from using the endpoint as an
-- unbounded database-work primitive.
alter table public.event_auth_attempts
  drop constraint event_auth_attempts_scope_check;
alter table public.event_auth_attempts
  add constraint event_auth_attempts_scope_check
  check (scope in ('login', 'create', 'invite'));

commit;
