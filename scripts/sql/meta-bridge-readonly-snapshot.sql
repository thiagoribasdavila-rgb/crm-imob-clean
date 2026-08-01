-- ATLAS Meta Signal Intelligence - Fase 7/100
-- Coleta exclusivamente metadados estruturais. Nao consulta linhas de negocio.
-- Executar somente por um canal read-only autorizado (Supabase MCP/Management API).

with wanted(schema_name, object_name) as (
  values
    ('public','crm_projects'),
    ('public','marketing_campaigns'),
    ('public','leads'),
    ('public','profiles'),
    ('public','developments_compat'),
    ('public','campaigns_compat'),
    ('public','integration_connections'),
    ('private','integration_credentials'),
    ('private','integration_outbox'),
    ('private','dead_letter_events'),
    ('public','meta_lead_sources'),
    ('public','meta_lead_events'),
    ('public','meta_conversion_configs'),
    ('public','meta_conversion_events')
),
relations as (
  select
    n.nspname as schema_name,
    c.relname as object_name,
    c.oid,
    case c.relkind
      when 'r' then 'table'
      when 'p' then 'table'
      when 'v' then 'view'
      when 'm' then 'view'
      else 'other'
    end as kind,
    c.relrowsecurity as rls_enabled,
    coalesce('security_invoker=on' = any(c.reloptions), false) as security_invoker
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join wanted w on w.schema_name = n.nspname and w.object_name = c.relname
  where c.relkind in ('r','p','v','m')
),
relation_sources as (
  select
    r.oid,
    case
      when r.kind <> 'view' then null
      else coalesce(bool_and(source.relrowsecurity), false)
    end as source_rls_enabled
  from relations r
  left join pg_rewrite rewrite on rewrite.ev_class = r.oid
  left join pg_depend dependency
    on dependency.classid = 'pg_rewrite'::regclass
   and dependency.objid = rewrite.oid
   and dependency.refclassid = 'pg_class'::regclass
  left join pg_class source
    on source.oid = dependency.refobjid
   and source.oid <> r.oid
   and source.relkind in ('r','p')
  group by r.oid, r.kind
),
relation_indexes as (
  select
    r.oid,
    coalesce(jsonb_agg(token order by token) filter (where token is not null), '[]'::jsonb) as indexes
  from relations r
  left join lateral (
    select distinct token
    from pg_index i
    cross join lateral (
      select
        lower(pg_get_indexdef(i.indexrelid)) as definition,
        lower(coalesce(pg_get_expr(i.indpred, i.indrelid), '')) as predicate
    ) d
    cross join lateral (
      values
        (case when d.definition like '%organization_id%' and d.definition like '%created_at%' then 'organization_id_created_at' end),
        (case when d.definition like '%lead_id%' then 'lead_id' end),
        (case when i.indisunique and d.definition like '%organization_id%' and d.definition like '%external_event_id%' then 'organization_external_event_unique' end),
        (case when i.indisunique and d.definition like '%organization_id%' and d.definition like '%meta_event_id%' then 'organization_meta_event_unique' end),
        (case when d.definition like '%available_at%' and d.predicate like '%pending%' then 'pending_available_at_partial' end)
    ) tokens(token)
    where i.indrelid = r.oid and token is not null
  ) normalized on true
  group by r.oid
),
relation_policies as (
  select
    r.oid,
    coalesce(jsonb_agg(jsonb_build_object(
      'command', p.cmd,
      'roles', to_jsonb(p.roles),
      'hasUsing', p.qual is not null,
      'hasWithCheck', p.with_check is not null,
      'tenantGuard', lower(coalesce(p.qual,'') || ' ' || coalesce(p.with_check,'')) like '%organization_id%',
      'authUidCheck', lower(coalesce(p.qual,'') || ' ' || coalesce(p.with_check,'')) like '%auth.uid%'
    ) order by p.policyname) filter (where p.policyname is not null), '[]'::jsonb) as policies
  from relations r
  left join pg_policies p on p.schemaname = r.schema_name and p.tablename = r.object_name
  group by r.oid
),
object_json as (
  select jsonb_agg(jsonb_build_object(
    'name', r.schema_name || '.' || r.object_name,
    'kind', r.kind,
    'dataApiExposed', r.schema_name = 'public',
    'rlsEnabled', r.rls_enabled,
    'sourceRlsEnabled', sources.source_rls_enabled,
    'securityInvoker', r.security_invoker,
    'grants', jsonb_build_object(
      'anon', (
        select coalesce(jsonb_agg(privilege order by privilege), '[]'::jsonb)
        from unnest(array['select','insert','update','delete']) privilege
        where has_table_privilege('anon', r.oid, privilege)
      ),
      'authenticated', (
        select coalesce(jsonb_agg(privilege order by privilege), '[]'::jsonb)
        from unnest(array['select','insert','update','delete']) privilege
        where has_table_privilege('authenticated', r.oid, privilege)
      ),
      'service_role', (
        select coalesce(jsonb_agg(privilege order by privilege), '[]'::jsonb)
        from unnest(array['select','insert','update','delete']) privilege
        where has_table_privilege('service_role', r.oid, privilege)
      )
    ),
    'indexes', coalesce(indexes.indexes, '[]'::jsonb),
    'policies', coalesce(policies.policies, '[]'::jsonb)
  ) order by r.schema_name, r.object_name) as objects
  from relations r
  left join relation_sources sources on sources.oid = r.oid
  left join relation_indexes indexes on indexes.oid = r.oid
  left join relation_policies policies on policies.oid = r.oid
),
wanted_functions(schema_name, function_name) as (
  values ('private','current_organization_id'), ('private','can_view_lead')
),
function_rows as (
  select distinct on (n.nspname, p.proname)
    n.nspname as schema_name,
    p.proname as function_name,
    p.oid,
    p.prosecdef as security_definer,
    coalesce((
      select replace(setting, 'search_path=', '')
      from unnest(coalesce(p.proconfig, array[]::text[])) setting
      where setting like 'search_path=%'
      limit 1
    ), '__not_set__') as search_path,
    pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join wanted_functions w on w.schema_name = n.nspname and w.function_name = p.proname
  order by n.nspname, p.proname, p.oid
),
function_json as (
  select jsonb_agg(jsonb_build_object(
    'name', f.schema_name || '.' || f.function_name,
    'securityDefiner', f.security_definer,
    'searchPath', f.search_path,
    'publicExecute', exists (
      select 1
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ),
    'anonExecute', has_function_privilege('anon', f.oid, 'EXECUTE'),
    'authenticatedExecute', has_function_privilege('authenticated', f.oid, 'EXECUTE'),
    'authUidCheck', lower(f.definition) like '%auth.uid%'
  ) order by f.schema_name, f.function_name) as functions
  from function_rows f
  join pg_proc p on p.oid = f.oid
)
select jsonb_build_object(
  'format', 'atlas_meta_schema_snapshot_v1',
  'environment', 'remote_read_only_snapshot',
  'postgresMajor', current_setting('server_version_num')::int / 10000,
  'exposure', jsonb_build_object(
    'schemas', jsonb_build_array('public'),
    'verifiedFromDataApiSettings', false,
    'source', 'default_public_assumption'
  ),
  'objects', coalesce((select objects from object_json), '[]'::jsonb),
  'functions', coalesce((select functions from function_json), '[]'::jsonb),
  'isolationScenarios', '[]'::jsonb,
  'collection', jsonb_build_object(
    'catalogOnly', true,
    'businessRowsRead', false,
    'personalDataRead', false,
    'secretsRead', false
  )
) as snapshot;
