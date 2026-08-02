begin;

-- New event credentials use a predictable slug that is easy to type and share.
-- NOT VALID deliberately preserves older login names containing spaces: the
-- constraint still applies to every row inserted or updated after this migration,
-- while existing event controllers remain able to sign in with their old names.
alter table public.event_access
  drop constraint if exists event_access_login_name_slug_check;

alter table public.event_access
  add constraint event_access_login_name_slug_check
  check (login_name ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
  not valid;

commit;
