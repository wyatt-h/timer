begin;

-- Invitation tokens remain valid for their full 24-hour lifetime. Each opening
-- issues an independent event session, so the same link can onboard several
-- controller devices without exposing the event password. The raw token is
-- still never stored; owners can revoke it, replace it, or invalidate it by
-- changing the event password.
create or replace function public.redeem_event_invite(
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

  select event_id into v_event_id
  from public.event_invites
  where token_hash = p_token_hash
    and expires_at > now();

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

commit;
