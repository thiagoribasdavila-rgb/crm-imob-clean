\set ON_ERROR_STOP on
begin;
set transaction read only;

with
relation_acl as (
  select
    c.oid as object_oid,
    coalesce(r.rolname, 'public') as grantee,
    a.privilege_type
  from pg_class c
  cross join lateral aclexplode(
    coalesce(c.relacl, acldefault('r', c.relowner))
  ) a
  left join pg_roles r on r.oid = a.grantee
  where c.relnamespace = 'public'::regnamespace
),
function_acl as (
  select
    p.oid as object_oid,
    coalesce(r.rolname, 'public') as grantee,
    a.privilege_type
  from pg_proc p
  cross join lateral aclexplode(
    coalesce(p.proacl, acldefault('f', p.proowner))
  ) a
  left join pg_roles r on r.oid = a.grantee
  where p.pronamespace = 'public'::regnamespace
),
tables_json as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'schema', 'public',
      'name', c.relname,
      'rls_enabled', c.relrowsecurity,
      'rls_forced', c.relforcerowsecurity,
      'grants', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'grantee', ra.grantee,
            'privileges', ra.privileges
          )
          order by ra.grantee
        )
        from (
          select grantee, array_agg(privilege_type order by privilege_type) as privileges
          from relation_acl
          where object_oid = c.oid
          group by grantee
        ) ra
      ), '[]'::jsonb)
    )
    order by c.relname
  ), '[]'::jsonb) as value
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p')
),
views_json as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'schema', 'public',
      'name', c.relname,
      'kind', case when c.relkind = 'm' then 'materialized_view' else 'view' end,
      'security_invoker', coalesce((
        select bool_or(option_value = 'true')
        from pg_options_to_table(c.reloptions)
        where option_name = 'security_invoker'
      ), false),
      'grants', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'grantee', ra.grantee,
            'privileges', ra.privileges
          )
          order by ra.grantee
        )
        from (
          select grantee, array_agg(privilege_type order by privilege_type) as privileges
          from relation_acl
          where object_oid = c.oid
          group by grantee
        ) ra
      ), '[]'::jsonb)
    )
    order by c.relname
  ), '[]'::jsonb) as value
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('v', 'm')
),
functions_json as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'schema', 'public',
      'name', p.proname,
      'identity_arguments', pg_get_function_identity_arguments(p.oid),
      'security_definer', p.prosecdef,
      'search_path_mode', case
        when not p.prosecdef then 'not_applicable'
        when exists (
          select 1
          from unnest(coalesce(p.proconfig, array[]::text[])) setting
          where setting in ('search_path=', 'search_path=""')
        ) then 'empty'
        when exists (
          select 1
          from unnest(coalesce(p.proconfig, array[]::text[])) setting
          where setting like 'search_path=%'
        ) then 'fixed'
        else 'unsafe'
      end,
      'execute_grantees', coalesce((
        select jsonb_agg(fa.grantee order by fa.grantee)
        from function_acl fa
        where fa.object_oid = p.oid
          and fa.privilege_type = 'EXECUTE'
      ), '[]'::jsonb)
    )
    order by p.proname, pg_get_function_identity_arguments(p.oid)
  ), '[]'::jsonb) as value
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
),
policies_json as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'schema', 'public',
      'table', c.relname,
      'name', p.polname,
      'command', case p.polcmd
        when 'r' then 'SELECT'
        when 'a' then 'INSERT'
        when 'w' then 'UPDATE'
        when 'd' then 'DELETE'
        when '*' then 'ALL'
      end,
      'roles', (
        select jsonb_agg(
          case when role_oid = 0 then 'public' else pg_get_userbyid(role_oid) end
          order by role_oid
        )
        from unnest(p.polroles) role_oid
      ),
      'has_using', p.polqual is not null,
      'has_with_check', p.polwithcheck is not null,
      'uses_auth_uid', lower(
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
        coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
      ) like '%auth.uid(%',
      'uses_auth_role', lower(
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
        coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
      ) like '%auth.role(%',
      'uses_user_metadata', lower(
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
        coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
      ) like '%user_metadata%'
    )
    order by c.relname, p.polname
  ), '[]'::jsonb) as value
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  where c.relnamespace = 'public'::regnamespace
),
default_privileges_json as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'owner', pg_get_userbyid(d.defaclrole),
      'schema', coalesce(n.nspname, '*'),
      'object_type', case d.defaclobjtype
        when 'r' then 'tables'
        when 'S' then 'sequences'
        when 'f' then 'functions'
        when 'T' then 'types'
        when 'n' then 'schemas'
      end,
      'grantee', coalesce(r.rolname, 'public'),
      'privilege', a.privilege_type
    )
    order by pg_get_userbyid(d.defaclrole), coalesce(n.nspname, '*'), r.rolname, a.privilege_type
  ), '[]'::jsonb) as value
  from pg_default_acl d
  left join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  left join pg_roles r on r.oid = a.grantee
  where d.defaclnamespace = 0
     or n.nspname = 'public'
)
select jsonb_build_object(
  'schema_version', 'atlas.access_surface_snapshot.v1',
  'source', jsonb_build_object(
    'kind', 'isolated_loopback_pg17',
    'postgres_major', current_setting('server_version_num')::integer / 10000,
    'transaction_read_only', current_setting('transaction_read_only')::boolean,
    'table_rows_read', false
  ),
  'tables', tables_json.value,
  'views', views_json.value,
  'functions', functions_json.value,
  'policies', policies_json.value,
  'default_privileges', default_privileges_json.value
)
from tables_json, views_json, functions_json, policies_json, default_privileges_json;

rollback;
