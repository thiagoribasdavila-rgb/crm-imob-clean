-- Snapshot somente leitura para o clone isolado da Fase 8.
-- O resultado deve ser salvo fora do banco e revisado sem identificadores de fixtures.
\set ON_ERROR_STOP on

select jsonb_pretty(
  jsonb_build_object(
    'format', 'atlas_phase_008_acl_snapshot_v1',
    'environment', current_setting('app.atlas_rls_rehearsal_environment', true),
    'captured_at', timezone('utc', clock_timestamp()),
    'tables', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'schema', table_schema,
            'table', table_name,
            'grantee', grantee,
            'privilege', privilege_type
          )
          order by table_schema, table_name, grantee, privilege_type
        ),
        '[]'::jsonb
      )
      from information_schema.role_table_grants
      where table_schema in ('public', 'private')
        and grantee in ('anon', 'authenticated', 'service_role')
    ),
    'policies', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'schema', schemaname,
            'table', tablename,
            'policy', policyname,
            'command', cmd,
            'roles', roles,
            'using_present', qual is not null,
            'with_check_present', with_check is not null
          )
          order by schemaname, tablename, policyname
        ),
        '[]'::jsonb
      )
      from pg_policies
      where schemaname in ('public', 'private')
    ),
    'functions', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'schema', routine_schema,
            'function', routine_name,
            'grantee', grantee,
            'privilege', privilege_type
          )
          order by routine_schema, routine_name, grantee, privilege_type
        ),
        '[]'::jsonb
      )
      from information_schema.role_routine_grants
      where routine_schema in ('public', 'private')
        and grantee in ('anon', 'authenticated', 'service_role')
    )
  )
);
