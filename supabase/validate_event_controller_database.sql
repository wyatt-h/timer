/*
 * Timer database validator
 *
 * Run this entire file in Supabase Dashboard -> SQL Editor after applying
 * 20260731010000_event_controller_auth.sql.
 *
 * READ-ONLY: this script creates, changes, and deletes nothing. It returns one
 * result table. The SUMMARY row must be PASS and every other row should be PASS.
 * WARN is non-blocking housekeeping or suspicious data worth reviewing.
 */

with
expected_tables(table_name) as (
  values
    ('agenda_items'),
    ('event_access'),
    ('event_auth_attempts'),
    ('event_runtime'),
    ('event_sessions'),
    ('events'),
    ('speakers')
),
actual_tables(table_name) as (
  select t.table_name
  from information_schema.tables t
  where t.table_schema = 'public'
    and t.table_type = 'BASE TABLE'
),
table_differences(kind, object_name) as (
  select 'missing', e.table_name
  from expected_tables e
  left join actual_tables a using (table_name)
  where a.table_name is null
  union all
  select 'unexpected', a.table_name
  from actual_tables a
  left join expected_tables e using (table_name)
  where e.table_name is null
),

expected_columns(table_name, column_name, data_type, udt_name, is_nullable) as (
  values
    ('events', 'id', 'uuid', 'uuid', 'NO'),
    ('events', 'name', 'text', 'text', 'NO'),
    ('events', 'event_date', 'date', 'date', 'NO'),
    ('events', 'status', 'USER-DEFINED', 'event_status', 'NO'),
    ('events', 'viewer_token', 'uuid', 'uuid', 'NO'),
    ('events', 'created_at', 'timestamp with time zone', 'timestamptz', 'NO'),
    ('events', 'updated_at', 'timestamp with time zone', 'timestamptz', 'NO'),
    ('events', 'zoom_token', 'text', 'text', 'YES'),
    ('events', 'version', 'bigint', 'int8', 'NO'),

    ('agenda_items', 'id', 'uuid', 'uuid', 'NO'),
    ('agenda_items', 'event_id', 'uuid', 'uuid', 'NO'),
    ('agenda_items', 'kind', 'USER-DEFINED', 'agenda_kind', 'NO'),
    ('agenda_items', 'duration_seconds', 'integer', 'int4', 'NO'),
    ('agenda_items', 'order_index', 'integer', 'int4', 'NO'),
    ('agenda_items', 'created_at', 'timestamp with time zone', 'timestamptz', 'NO'),
    ('agenda_items', 'speaker_default_seconds', 'integer', 'int4', 'YES'),
    ('agenda_items', 'host', 'text', 'text', 'YES'),
    ('agenda_items', 'sound_muted', 'boolean', 'bool', 'YES'),

    ('speakers', 'id', 'uuid', 'uuid', 'NO'),
    ('speakers', 'agenda_item_id', 'uuid', 'uuid', 'NO'),
    ('speakers', 'name', 'text', 'text', 'NO'),
    ('speakers', 'duration_seconds', 'integer', 'int4', 'NO'),
    ('speakers', 'order_index', 'integer', 'int4', 'NO'),
    ('speakers', 'created_at', 'timestamp with time zone', 'timestamptz', 'NO'),
    ('speakers', 'sound_muted', 'boolean', 'bool', 'YES'),

    ('event_runtime', 'event_id', 'uuid', 'uuid', 'NO'),
    ('event_runtime', 'status', 'USER-DEFINED', 'timer_status', 'NO'),
    ('event_runtime', 'segment_index', 'integer', 'int4', 'NO'),
    ('event_runtime', 'remaining_seconds', 'numeric', 'numeric', 'NO'),
    ('event_runtime', 'ends_at', 'timestamp with time zone', 'timestamptz', 'YES'),
    ('event_runtime', 'updated_at', 'timestamp with time zone', 'timestamptz', 'NO'),
    ('event_runtime', 'panel_status', 'USER-DEFINED', 'timer_status', 'YES'),
    ('event_runtime', 'panel_remaining_seconds', 'numeric', 'numeric', 'YES'),
    ('event_runtime', 'panel_ends_at', 'timestamp with time zone', 'timestamptz', 'YES'),
    ('event_runtime', 'sound_enabled', 'boolean', 'bool', 'NO'),

    ('event_access', 'event_id', 'uuid', 'uuid', 'NO'),
    ('event_access', 'login_name', 'text', 'text', 'NO'),
    ('event_access', 'password_hash', 'text', 'text', 'NO'),
    ('event_access', 'recovery_code_hash', 'text', 'text', 'NO'),
    ('event_access', 'password_version', 'integer', 'int4', 'NO'),
    ('event_access', 'created_at', 'timestamp with time zone', 'timestamptz', 'NO'),
    ('event_access', 'updated_at', 'timestamp with time zone', 'timestamptz', 'NO'),

    ('event_sessions', 'id', 'uuid', 'uuid', 'NO'),
    ('event_sessions', 'event_id', 'uuid', 'uuid', 'NO'),
    ('event_sessions', 'token_hash', 'text', 'text', 'NO'),
    ('event_sessions', 'password_version', 'integer', 'int4', 'NO'),
    ('event_sessions', 'created_at', 'timestamp with time zone', 'timestamptz', 'NO'),
    ('event_sessions', 'last_used_at', 'timestamp with time zone', 'timestamptz', 'NO'),
    ('event_sessions', 'expires_at', 'timestamp with time zone', 'timestamptz', 'NO'),

    ('event_auth_attempts', 'id', 'uuid', 'uuid', 'NO'),
    ('event_auth_attempts', 'scope', 'text', 'text', 'NO'),
    ('event_auth_attempts', 'identifier_hash', 'text', 'text', 'NO'),
    ('event_auth_attempts', 'address_hash', 'text', 'text', 'NO'),
    ('event_auth_attempts', 'created_at', 'timestamp with time zone', 'timestamptz', 'NO')
),
actual_columns as (
  select c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name in (select table_name from expected_tables)
),
column_differences as (
  select
    coalesce(e.table_name, a.table_name) as table_name,
    coalesce(e.column_name, a.column_name) as column_name,
    case
      when e.column_name is null then 'unexpected column'
      when a.column_name is null then 'missing column'
      else format(
        'expected %s/%s nullable=%s; found %s/%s nullable=%s',
        e.data_type, e.udt_name, e.is_nullable,
        a.data_type, a.udt_name, a.is_nullable
      )
    end as problem
  from expected_columns e
  full join actual_columns a
    on a.table_name = e.table_name and a.column_name = e.column_name
  where e.column_name is null
     or a.column_name is null
     or e.data_type <> a.data_type
     or e.udt_name <> a.udt_name
     or e.is_nullable <> a.is_nullable
),

expected_enums(type_name, enum_value) as (
  values
    ('agenda_kind', 'single'),
    ('agenda_kind', 'panel'),
    ('event_status', 'draft'),
    ('event_status', 'live'),
    ('event_status', 'completed'),
    ('timer_status', 'ready'),
    ('timer_status', 'running'),
    ('timer_status', 'paused'),
    ('timer_status', 'ended')
),
actual_enums(type_name, enum_value) as (
  select t.typname, e.enumlabel
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  join pg_enum e on e.enumtypid = t.oid
  where n.nspname = 'public'
),
enum_differences(kind, object_name) as (
  select 'missing', e.type_name || '.' || e.enum_value
  from expected_enums e
  left join actual_enums a using (type_name, enum_value)
  where a.enum_value is null
  union all
  select 'unexpected', a.type_name || '.' || a.enum_value
  from actual_enums a
  left join expected_enums e using (type_name, enum_value)
  where e.enum_value is null
),

expected_functions(signature) as (
  values
    ('public.set_updated_at()'),
    ('public.public_event_payload(uuid)'),
    ('public.get_public_event(uuid)'),
    ('public.get_zoom_event(text)'),
    ('public.ms_to_timestamptz(bigint)'),
    ('public.controller_event_payload(uuid)'),
    ('public.write_event_children(uuid,jsonb)'),
    ('public.issue_event_session(uuid,text,integer,integer)'),
    ('public.create_controller_event(jsonb,text,text,text,text,integer)'),
    ('public.replace_controller_event(uuid,bigint,jsonb)'),
    ('public.delete_controller_event(uuid)'),
    ('public.change_controller_password(uuid,integer,text,text,integer)'),
    ('public.recover_controller_password(uuid,integer,text,text,text,integer)'),
    ('public.rotate_controller_recovery_code(uuid,integer,text)'),
    ('public.touch_event_session(text,integer)'),
    ('public.register_event_auth_attempt(text,text,text,integer,integer)'),
    ('public.clear_event_auth_attempts(text,text,text)')
),
security_definer_functions(signature) as (
  values
    ('public.public_event_payload(uuid)'),
    ('public.get_public_event(uuid)'),
    ('public.get_zoom_event(text)'),
    ('public.controller_event_payload(uuid)'),
    ('public.write_event_children(uuid,jsonb)'),
    ('public.issue_event_session(uuid,text,integer,integer)'),
    ('public.create_controller_event(jsonb,text,text,text,text,integer)'),
    ('public.replace_controller_event(uuid,bigint,jsonb)'),
    ('public.delete_controller_event(uuid)'),
    ('public.change_controller_password(uuid,integer,text,text,integer)'),
    ('public.recover_controller_password(uuid,integer,text,text,text,integer)'),
    ('public.rotate_controller_recovery_code(uuid,integer,text)'),
    ('public.touch_event_session(text,integer)'),
    ('public.register_event_auth_attempt(text,text,text,integer,integer)'),
    ('public.clear_event_auth_attempts(text,text,text)')
),
service_functions(signature) as (
  values
    ('public.controller_event_payload(uuid)'),
    ('public.create_controller_event(jsonb,text,text,text,text,integer)'),
    ('public.replace_controller_event(uuid,bigint,jsonb)'),
    ('public.delete_controller_event(uuid)'),
    ('public.change_controller_password(uuid,integer,text,text,integer)'),
    ('public.recover_controller_password(uuid,integer,text,text,text,integer)'),
    ('public.rotate_controller_recovery_code(uuid,integer,text)'),
    ('public.touch_event_session(text,integer)'),
    ('public.register_event_auth_attempt(text,text,text,integer,integer)'),
    ('public.clear_event_auth_attempts(text,text,text)')
),
private_functions(signature) as (
  values
    ('public.public_event_payload(uuid)'),
    ('public.ms_to_timestamptz(bigint)'),
    ('public.write_event_children(uuid,jsonb)'),
    ('public.issue_event_session(uuid,text,integer,integer)')
),

expected_indexes(index_name) as (
  values
    ('events_viewer_token_idx'),
    ('agenda_items_event_id_idx'),
    ('speakers_agenda_item_id_idx'),
    ('event_sessions_event_id_idx'),
    ('event_sessions_expires_at_idx'),
    ('event_auth_attempts_identifier_idx'),
    ('event_auth_attempts_address_idx'),
    ('event_auth_attempts_created_at_idx')
),

checks(sort_key, area, check_name, ok, failure_status, details) as (
  select
    10, 'migration', 'final migration is recorded',
    exists (
      select 1
      from supabase_migrations.schema_migrations
      where version = '20260731010000'
    ),
    'FAIL',
    'Expected version 20260731010000 in supabase_migrations.schema_migrations'

  union all
  select
    20, 'schema', 'exact application table set',
    not exists (select 1 from table_differences),
    'FAIL',
    coalesce((select string_agg(kind || ': ' || object_name, '; ' order by kind, object_name)
              from table_differences), 'Found exactly the seven expected tables')

  union all
  select
    30, 'schema', 'all columns, types, and nullability match',
    not exists (select 1 from column_differences),
    'FAIL',
    coalesce((select string_agg(table_name || '.' || column_name || ': ' || problem,
                                '; ' order by table_name, column_name)
              from column_differences), 'All 57 column definitions match')

  union all
  select
    40, 'schema', 'legacy team model is completely absent',
    to_regclass('public.teams') is null
      and to_regclass('public.team_members') is null
      and not exists (
        select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public' and t.typname = 'team_role'
      )
      and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and (table_name, column_name) in (
            ('events', 'team_id'), ('events', 'created_by'), ('event_runtime', 'updated_by')
          )
      )
      and not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('add_team_owner', 'is_team_member', 'is_team_owner')
      ),
    'FAIL',
    'teams, team_members, team_role, ownership columns, and membership functions must all be absent'

  union all
  select
    50, 'schema', 'enum types and values match',
    not exists (select 1 from enum_differences),
    'FAIL',
    coalesce((select string_agg(kind || ': ' || object_name, '; ' order by kind, object_name)
              from enum_differences), 'agenda_kind, event_status, and timer_status match')

  union all
  select
    60, 'schema', 'pgcrypto extension exists',
    exists (select 1 from pg_extension where extname = 'pgcrypto'),
    'FAIL',
    'pgcrypto supplies gen_random_uuid()'

  union all
  select
    70, 'schema', 'every application table has a primary key',
    (select count(distinct c.conrelid) = 7
     from pg_constraint c
     where c.contype = 'p'
       and c.conrelid in (
         'public.events'::regclass,
         'public.agenda_items'::regclass,
         'public.speakers'::regclass,
         'public.event_runtime'::regclass,
         'public.event_access'::regclass,
         'public.event_sessions'::regclass,
         'public.event_auth_attempts'::regclass
       )),
    'FAIL',
    'Expected a primary key on all seven tables'

  union all
  select
    80, 'schema', 'foreign-key ownership chain is exact and cascading',
    (select count(*) = 5
     from pg_constraint c
     join pg_class child on child.oid = c.conrelid
     join pg_namespace n on n.oid = child.relnamespace
     where n.nspname = 'public' and c.contype = 'f')
      and exists (select 1 from pg_constraint where conname = 'agenda_items_event_id_fkey' and confdeltype = 'c')
      and exists (select 1 from pg_constraint where conname = 'speakers_agenda_item_id_fkey' and confdeltype = 'c')
      and exists (select 1 from pg_constraint where conname = 'event_runtime_event_id_fkey' and confdeltype = 'c')
      and exists (select 1 from pg_constraint where conname = 'event_access_event_id_fkey' and confdeltype = 'c')
      and exists (select 1 from pg_constraint where conname = 'event_sessions_event_id_fkey' and confdeltype = 'c'),
    'FAIL',
    'Expected five ON DELETE CASCADE foreign keys and no others in public'

  union all
  select
    90, 'schema', 'required unique constraints exist',
    to_regclass('public.events_viewer_token_key') is not null
      and to_regclass('public.events_zoom_token_key') is not null
      and to_regclass('public.event_access_login_name_key') is not null
      and to_regclass('public.event_sessions_token_hash_key') is not null,
    'FAIL',
    'viewer_token, zoom_token, login_name, and session token_hash must be unique'

  union all
  select
    100, 'schema', 'required supporting indexes exist',
    not exists (
      select 1 from expected_indexes e
      where to_regclass('public.' || e.index_name) is null
    ),
    'FAIL',
    coalesce((select string_agg(index_name, ', ' order by index_name)
              from expected_indexes e
              where to_regclass('public.' || e.index_name) is null),
             'All required lookup and cleanup indexes exist')

  union all
  select
    110, 'schema', 'updated_at triggers are exact',
    (select coalesce(array_agg(t.tgname order by t.tgname), array[]::name[]) =
                   array['event_access_set_updated_at', 'events_set_updated_at',
                         'runtime_set_updated_at']::name[]
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal),
    'FAIL',
    'Expected only event_access_set_updated_at, events_set_updated_at, and runtime_set_updated_at'

  union all
  select
    120, 'constraints', 'event version and credential rules exist',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'events' and column_name = 'version'
        and is_nullable = 'NO' and column_default = '0'
    )
      and exists (
        select 1 from pg_constraint
        where conrelid = 'public.event_access'::regclass and contype = 'c'
          and pg_get_constraintdef(oid) like '%login_name%lower%'
      )
      and exists (
        select 1 from pg_constraint
        where conrelid = 'public.event_access'::regclass and contype = 'c'
          and pg_get_constraintdef(oid) like '%password_version%'
      ),
    'FAIL',
    'events.version must default to 0; login names and password versions must be constrained'

  union all
  select
    130, 'constraints', 'overtime and timer bounds exist',
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.event_runtime'::regclass
        and conname = 'event_runtime_remaining_seconds_check'
        and pg_get_constraintdef(oid) like '%-86400%86400%'
    )
      and exists (
        select 1 from pg_constraint
        where conrelid = 'public.event_runtime'::regclass
          and conname = 'event_runtime_panel_remaining_seconds_check'
          and pg_get_constraintdef(oid) like '%-86400%86400%'
      ),
    'FAIL',
    'Both timer checks must allow overtime down to -86400 and cap at 86400'

  union all
  select
    140, 'constraints', 'hash and rate-limit checks exist',
    (select count(*) >= 1 from pg_constraint
     where conrelid = 'public.event_sessions'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%token_hash%64%')
      and (select count(*) >= 2 from pg_constraint
           where conrelid = 'public.event_auth_attempts'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%64%')
      and exists (
        select 1 from pg_constraint
        where conrelid = 'public.event_auth_attempts'::regclass and contype = 'c'
          and pg_get_constraintdef(oid) like '%login%recover%create%rotate%'
      ),
    'FAIL',
    'Session/auth hashes must be 64 characters and rate-limit scope must be restricted'

  union all
  select
    200, 'security', 'RLS is enabled on every application table',
    (select count(*) = 7 and bool_and(c.relrowsecurity)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname in (select table_name from expected_tables)),
    'FAIL',
    'All seven application tables must have row-level security enabled'

  union all
  select
    210, 'security', 'no direct RLS policies exist',
    not exists (select 1 from pg_policies where schemaname = 'public'),
    'FAIL',
    coalesce((select string_agg(tablename || ': ' || policyname, '; ')
              from pg_policies where schemaname = 'public'),
             'No policies: clients read only through approved functions')

  union all
  select
    220, 'security', 'sensitive tables have no client grants',
    not exists (
      select 1
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in ('event_access', 'event_sessions', 'event_auth_attempts')
        and grantee in ('anon', 'authenticated', 'PUBLIC')
    ),
    'FAIL',
    'anon, authenticated, and PUBLIC must have no privileges on credentials, sessions, or auth attempts'

  union all
  select
    230, 'security', 'service_role can manage sensitive tables',
    not exists (
      select 1
      from (values
        ('event_access', 'SELECT'), ('event_access', 'INSERT'),
        ('event_access', 'UPDATE'), ('event_access', 'DELETE'),
        ('event_sessions', 'SELECT'), ('event_sessions', 'INSERT'),
        ('event_sessions', 'UPDATE'), ('event_sessions', 'DELETE'),
        ('event_auth_attempts', 'SELECT'), ('event_auth_attempts', 'INSERT'),
        ('event_auth_attempts', 'UPDATE'), ('event_auth_attempts', 'DELETE')
      ) required(table_name, privilege_type)
      where not exists (
        select 1 from information_schema.role_table_grants g
        where g.table_schema = 'public'
          and g.grantee = 'service_role'
          and g.table_name = required.table_name
          and g.privilege_type = required.privilege_type
      )
    ),
    'FAIL',
    'service_role needs SELECT, INSERT, UPDATE, and DELETE on all three sensitive tables'

  union all
  select
    300, 'functions', 'every required function signature exists',
    not exists (
      select 1 from expected_functions e where to_regprocedure(e.signature) is null
    ),
    'FAIL',
    coalesce((select string_agg(signature, '; ' order by signature)
              from expected_functions e where to_regprocedure(e.signature) is null),
             'All 17 required function signatures exist')

  union all
  select
    310, 'functions', 'security-definer functions pin search_path',
    not exists (
      select 1
      from security_definer_functions e
      left join pg_proc p on p.oid = to_regprocedure(e.signature)
      where p.oid is null
         or not p.prosecdef
         or not coalesce(p.proconfig @> array['search_path=public']::text[], false)
    ),
    'FAIL',
    coalesce((select string_agg(e.signature, '; ' order by e.signature)
              from security_definer_functions e
              left join pg_proc p on p.oid = to_regprocedure(e.signature)
              where p.oid is null
                 or not p.prosecdef
                 or not coalesce(p.proconfig @> array['search_path=public']::text[], false)),
             'Every privileged function is SECURITY DEFINER with search_path=public')

  union all
  select
    320, 'functions', 'controller functions are service-role only',
    not exists (
      select 1 from service_functions e
      where not coalesce(has_function_privilege('service_role', to_regprocedure(e.signature), 'execute'), false)
         or coalesce(has_function_privilege('anon', to_regprocedure(e.signature), 'execute'), true)
         or coalesce(has_function_privilege('authenticated', to_regprocedure(e.signature), 'execute'), true)
    ),
    'FAIL',
    'Every controller/session/rate function must allow service_role and deny anon/authenticated'

  union all
  select
    330, 'functions', 'internal helper functions are private',
    not exists (
      select 1 from private_functions e
      where coalesce(has_function_privilege('service_role', to_regprocedure(e.signature), 'execute'), true)
         or coalesce(has_function_privilege('anon', to_regprocedure(e.signature), 'execute'), true)
         or coalesce(has_function_privilege('authenticated', to_regprocedure(e.signature), 'execute'), true)
    ),
    'FAIL',
    'Payload/write/session/time helpers must not be directly executable by API roles'

  union all
  select
    340, 'functions', 'public reader permissions are correct',
    coalesce(has_function_privilege('anon', 'public.get_public_event(uuid)', 'execute'), false)
      and coalesce(has_function_privilege('authenticated', 'public.get_public_event(uuid)', 'execute'), false)
      and coalesce(has_function_privilege('anon', 'public.get_zoom_event(text)', 'execute'), false)
      and coalesce(has_function_privilege('authenticated', 'public.get_zoom_event(text)', 'execute'), false)
      and not coalesce(has_function_privilege('anon', 'public.public_event_payload(uuid)', 'execute'), true)
      and not coalesce(has_function_privilege('authenticated', 'public.public_event_payload(uuid)', 'execute'), true),
    'FAIL',
    'Only get_public_event and get_zoom_event are callable by anon/authenticated'

  union all
  select
    350, 'functions', 'reader functions contain no team dependency',
    not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('public_event_payload', 'controller_event_payload',
                          'get_public_event', 'get_zoom_event')
        and p.prosrc ilike '%team%'
    ),
    'FAIL',
    'No payload or reader function may mention a team'

  union all
  select
    400, 'data', 'row counts',
    true,
    'FAIL',
    format(
      'events=%s, agenda_items=%s, speakers=%s, runtime=%s, access=%s, sessions=%s, auth_attempts=%s',
      (select count(*) from public.events),
      (select count(*) from public.agenda_items),
      (select count(*) from public.speakers),
      (select count(*) from public.event_runtime),
      (select count(*) from public.event_access),
      (select count(*) from public.event_sessions),
      (select count(*) from public.event_auth_attempts)
    )

  union all
  select
    410, 'data', 'every event has credentials and runtime',
    not exists (
      select 1 from public.events e
      left join public.event_access a on a.event_id = e.id
      left join public.event_runtime r on r.event_id = e.id
      where a.event_id is null or r.event_id is null
    ),
    'FAIL',
    coalesce((select string_agg(e.id::text, ', ' order by e.id::text)
              from public.events e
              left join public.event_access a on a.event_id = e.id
              left join public.event_runtime r on r.event_id = e.id
              where a.event_id is null or r.event_id is null),
             'Every event has exactly one credential row and one runtime row')

  union all
  select
    420, 'data', 'event and credential values are valid',
    not exists (
      select 1 from public.events e
      join public.event_access a on a.event_id = e.id
      where e.version < 0
         or (e.zoom_token is not null and e.zoom_token <> upper(e.zoom_token))
         or a.login_name <> lower(a.login_name)
         or a.login_name !~ '^[a-z0-9][a-z0-9-]{2,47}$'
         or a.password_version < 1
         or a.password_hash not like 'scrypt$%'
         or a.recovery_code_hash not like 'scrypt$%'
    ),
    'FAIL',
    'Versions must be nonnegative; Zoom codes uppercase; credentials must match their required formats'

  union all
  select
    430, 'data', 'session rows are internally consistent',
    not exists (
      select 1 from public.event_sessions s
      join public.event_access a on a.event_id = s.event_id
      where s.token_hash !~ '^[0-9a-f]{64}$'
         or s.password_version <> a.password_version
         or s.last_used_at < s.created_at
         or s.expires_at <= s.last_used_at
    ),
    'FAIL',
    'Session hashes, password versions, and timestamps must be consistent'

  union all
  select
    440, 'data', 'expired sessions awaiting cleanup',
    not exists (select 1 from public.event_sessions where expires_at <= now()),
    'WARN',
    format('%s expired session(s); harmless, and touch_event_session will prune them',
           (select count(*) from public.event_sessions where expires_at <= now()))

  union all
  select
    450, 'data', 'rate-limit rows contain hashes only',
    not exists (
      select 1 from public.event_auth_attempts
      where scope not in ('login', 'recover', 'create', 'rotate')
         or identifier_hash !~ '^[0-9a-f]{64}$'
         or address_hash !~ '^[0-9a-f]{64}$'
    ),
    'FAIL',
    'Rate-limit identifiers and addresses must be lowercase 64-character hex hashes'

  union all
  select
    460, 'data', 'runtime values are valid',
    not exists (
      select 1 from public.event_runtime
      where segment_index < 0
         or remaining_seconds < -86400 or remaining_seconds > 86400
         or (panel_remaining_seconds is not null
             and (panel_remaining_seconds < -86400 or panel_remaining_seconds > 86400))
    ),
    'FAIL',
    'Runtime indices and timer values must remain inside database bounds'

  union all
  select
    470, 'data', 'agenda and speaker ordering has no duplicates',
    not exists (
      select 1 from public.agenda_items group by event_id, order_index having count(*) > 1
    )
      and not exists (
        select 1 from public.speakers group by agenda_item_id, order_index having count(*) > 1
      ),
    'WARN',
    'Duplicate order_index values are legal but indicate a malformed event document'

  union all
  select
    480, 'data', 'database payload readers cover every event',
    not exists (
      select 1 from public.events e
      where public.controller_event_payload(e.id) is null
         or public.get_public_event(e.viewer_token) is null
         or (e.zoom_token is not null and public.get_zoom_event(e.zoom_token) is null)
    ),
    'FAIL',
    'Controller and audience payload readers must return every event; Zoom reader must return paired events'
),
results as (
  select
    sort_key,
    area,
    check_name,
    case when ok then 'PASS' else failure_status end as status,
    details
  from checks
),
report as (
  select
    0 as sort_key,
    'SUMMARY'::text as area,
    'database validation'::text as check_name,
    case
      when count(*) filter (where status = 'FAIL') > 0 then 'FAIL'
      when count(*) filter (where status = 'WARN') > 0 then 'WARN'
      else 'PASS'
    end as status,
    format(
      '%s passed, %s failed, %s warning(s)',
      count(*) filter (where status = 'PASS'),
      count(*) filter (where status = 'FAIL'),
      count(*) filter (where status = 'WARN')
    ) as details
  from results

  union all

  select sort_key, area, check_name, status, details
  from results
)
select area, check_name, status, details
from report
order by sort_key, area, check_name;
