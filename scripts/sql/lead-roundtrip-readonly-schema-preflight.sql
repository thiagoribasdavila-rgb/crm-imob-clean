with target_tables(table_name) as (
  values
    ('organizations'),
    ('profiles'),
    ('leads'),
    ('lead_identity_registry'),
    ('lead_attribution_touches'),
    ('pipeline_stage_moves'),
    ('activities'),
    ('tasks'),
    ('developments'),
    ('projects')
), relations as (
  select
    target.table_name,
    class.oid as relation_id,
    class.oid is not null as object_exists,
    coalesce(class.relrowsecurity, false) as rls_enabled
  from target_tables target
  left join pg_namespace namespace on namespace.nspname = 'public'
  left join pg_class class
    on class.relnamespace = namespace.oid
   and class.relname = target.table_name
   and class.relkind in ('r', 'p')
), columns_by_table as (
  select
    relation.table_name,
    coalesce(
      jsonb_agg(attribute.attname order by attribute.attnum)
        filter (where attribute.attname is not null),
      '[]'::jsonb
    ) as columns
  from relations relation
  left join pg_attribute attribute
    on attribute.attrelid = relation.relation_id
   and attribute.attnum > 0
   and not attribute.attisdropped
  group by relation.table_name
), policies_by_table as (
  select
    relation.table_name,
    count(policy.policyname)::integer as policy_count
  from relations relation
  left join pg_policies policy
    on policy.schemaname = 'public'
   and policy.tablename = relation.table_name
  group by relation.table_name
)
select jsonb_build_object(
  'schema', 'atlas.lead-roundtrip-schema-snapshot.v1',
  'capturedAt', now(),
  'catalogOnly', true,
  'businessRowsRead', false,
  'objects', jsonb_agg(
    jsonb_build_object(
      'table', relation.table_name,
      'exists', relation.object_exists,
      'rlsEnabled', relation.rls_enabled,
      'columns', column_set.columns,
      'policyCount', policy_set.policy_count
    ) order by relation.table_name
  )
)
from relations relation
join columns_by_table column_set using (table_name)
join policies_by_table policy_set using (table_name);
