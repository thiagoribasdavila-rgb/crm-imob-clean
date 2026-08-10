with target_tables(table_name) as (
  values ('organizations'), ('profiles'), ('leads')
), catalog as (
  select
    target.table_name,
    to_regclass(format('public.%I', target.table_name)) as relation_id,
    coalesce(class.relrowsecurity, false) as rls_enabled,
    coalesce(class.relforcerowsecurity, false) as force_rls
  from target_tables target
  left join pg_class class
    on class.oid = to_regclass(format('public.%I', target.table_name))
), role_privileges(role_name, privilege_type) as (
  values
    ('anon', 'SELECT'), ('anon', 'INSERT'), ('anon', 'UPDATE'), ('anon', 'DELETE'),
    ('authenticated', 'SELECT'), ('authenticated', 'INSERT'),
    ('authenticated', 'UPDATE'), ('authenticated', 'DELETE'),
    ('service_role', 'SELECT'), ('service_role', 'INSERT'),
    ('service_role', 'UPDATE'), ('service_role', 'DELETE')
), effective_table_privileges as (
  select
    catalog.table_name,
    role_privileges.role_name,
    role_privileges.privilege_type,
    case
      when catalog.relation_id is null then false
      else has_table_privilege(
        role_privileges.role_name,
        catalog.relation_id,
        role_privileges.privilege_type
      )
    end as granted
  from catalog
  cross join role_privileges
), required_columns(table_name, privilege_type, column_name) as (
  values
    ('organizations', 'SELECT', 'id'),
    ('organizations', 'SELECT', 'name'),
    ('organizations', 'SELECT', 'slug'),
    ('organizations', 'SELECT', 'plan'),
    ('organizations', 'SELECT', 'active'),
    ('organizations', 'UPDATE', 'name'),
    ('organizations', 'UPDATE', 'slug'),
    ('profiles', 'SELECT', 'id'),
    ('profiles', 'SELECT', 'organization_id'),
    ('profiles', 'SELECT', 'name'),
    ('profiles', 'SELECT', 'role'),
    ('profiles', 'SELECT', 'commercial_role'),
    ('profiles', 'SELECT', 'reports_to'),
    ('profiles', 'SELECT', 'access_role'),
    ('profiles', 'SELECT', 'active'),
    ('profiles', 'SELECT', 'availability_status'),
    ('profiles', 'UPDATE', 'name')
), required_column_status as (
  select
    required.table_name,
    required.privilege_type,
    required.column_name,
    (attribute.attname is not null) as column_exists,
    case
      when catalog.relation_id is null or attribute.attname is null then false
      else has_column_privilege(
        'authenticated',
        catalog.relation_id,
        required.column_name,
        required.privilege_type
      )
    end as granted
  from required_columns required
  join catalog using (table_name)
  left join pg_attribute attribute
    on attribute.attrelid = catalog.relation_id
   and attribute.attname = required.column_name
   and attribute.attnum > 0
   and not attribute.attisdropped
), anon_column_exposure as (
  select
    catalog.table_name,
    coalesce(bool_or(
      has_column_privilege('anon', catalog.relation_id, attribute.attname, 'SELECT')
      or has_column_privilege('anon', catalog.relation_id, attribute.attname, 'INSERT')
      or has_column_privilege('anon', catalog.relation_id, attribute.attname, 'UPDATE')
    ), false) as any_column_privilege
  from catalog
  left join pg_attribute attribute
    on attribute.attrelid = catalog.relation_id
   and attribute.attnum > 0
   and not attribute.attisdropped
  group by catalog.table_name
), policy_contract as (
  select
    target.table_name,
    command.command,
    coalesce(bool_or(
      'authenticated' = any(policy.roles)
      and policy.cmd = command.command
    ), false) as exists_for_authenticated,
    coalesce(bool_or(
      'authenticated' = any(policy.roles)
      and policy.cmd = command.command
      and policy.qual is not null
    ), false) as has_using,
    coalesce(bool_or(
      'authenticated' = any(policy.roles)
      and policy.cmd = command.command
      and policy.with_check is not null
    ), false) as has_with_check
  from target_tables target
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE')) as command(command)
  left join pg_policies policy
    on policy.schemaname = 'public'
   and policy.tablename = target.table_name
   and policy.cmd = command.command
  group by target.table_name, command.command
), table_evidence as (
  select
    catalog.table_name,
    jsonb_build_object(
      'exists', catalog.relation_id is not null,
      'rlsEnabled', catalog.rls_enabled,
      'forceRls', catalog.force_rls,
      'effectiveTablePrivileges', (
        select jsonb_object_agg(
          role_name,
          privileges
        )
        from (
          select
            role_name,
            coalesce(jsonb_agg(privilege_type order by privilege_type)
              filter (where granted), '[]'::jsonb) as privileges
          from effective_table_privileges privilege
          where privilege.table_name = catalog.table_name
          group by role_name
        ) grouped
      ),
      'requiredAuthenticatedColumnPrivileges', coalesce((
        select jsonb_agg(jsonb_build_object(
          'column', column_name,
          'privilege', privilege_type,
          'columnExists', column_exists,
          'granted', granted
        ) order by privilege_type, column_name)
        from required_column_status required
        where required.table_name = catalog.table_name
      ), '[]'::jsonb),
      'anonymousColumnPrivilegeDetected', exposure.any_column_privilege,
      'policies', (
        select jsonb_object_agg(lower(command), jsonb_build_object(
          'existsForAuthenticated', exists_for_authenticated,
          'hasUsing', has_using,
          'hasWithCheck', has_with_check
        ))
        from policy_contract policy
        where policy.table_name = catalog.table_name
      )
    ) as evidence
  from catalog
  join anon_column_exposure exposure using (table_name)
), controls as (
  select jsonb_build_object(
    'allTablesExist', not exists (
      select 1 from catalog where relation_id is null
    ),
    'rlsEnabledOnAllTables', not exists (
      select 1 from catalog where not rls_enabled
    ),
    'anonymousPrivilegesRevoked',
      not exists (
        select 1 from effective_table_privileges
        where role_name = 'anon' and granted
      )
      and not exists (
        select 1 from anon_column_exposure where any_column_privilege
      ),
    'requiredAuthenticatedColumnPrivilegesGranted', not exists (
      select 1 from required_column_status where not column_exists or not granted
    ),
    'leadAuthenticatedTablePrivilegesComplete',
      (select bool_and(granted) from effective_table_privileges
       where table_name = 'leads'
         and role_name = 'authenticated'
         and privilege_type in ('SELECT', 'INSERT', 'UPDATE')),
    'leadDeleteNotGranted', not coalesce((
      select granted from effective_table_privileges
      where table_name = 'leads'
        and role_name = 'authenticated'
        and privilege_type = 'DELETE'
    ), false),
    'serviceRoleEffectivePrivilegesComplete', not exists (
      select 1 from effective_table_privileges
      where role_name = 'service_role' and not granted
    ),
    'requiredAuthenticatedPoliciesPresent',
      not exists (
        select 1 from policy_contract
        where
          (table_name in ('organizations', 'profiles') and command in ('SELECT', 'UPDATE') and not exists_for_authenticated)
          or (table_name = 'leads' and command in ('SELECT', 'INSERT', 'UPDATE') and not exists_for_authenticated)
      ),
    'selectPoliciesHaveUsing', not exists (
      select 1 from policy_contract
      where table_name in ('organizations', 'profiles', 'leads')
        and command = 'SELECT'
        and not has_using
    ),
    'insertPoliciesHaveWithCheck', not exists (
      select 1 from policy_contract
      where table_name = 'leads'
        and command = 'INSERT'
        and not has_with_check
    ),
    'updatePoliciesHaveUsingAndWithCheck', not exists (
      select 1 from policy_contract
      where table_name in ('organizations', 'profiles', 'leads')
        and command = 'UPDATE'
        and (not has_using or not has_with_check)
    )
  ) as value
)
select jsonb_build_object(
  'format', 'atlas_meta_data_api_catalog_evidence_v1',
  'phase', 17,
  'environment', 'staging_clone',
  'generatedAt', now(),
  'passed', (
    select bool_and((entry.value)::boolean)
    from controls, jsonb_each(controls.value) entry
  ),
  'sanitized', true,
  'containsSecrets', false,
  'containsPersonalData', false,
  'projectIdentifiersPersisted', false,
  'rawLogsPersisted', false,
  'remoteExecutionPerformed', true,
  'queryReadOnly', true,
  'tables', (select jsonb_object_agg(table_name, evidence) from table_evidence),
  'controls', (select value from controls),
  'releaseGates', jsonb_build_object(
    'productionAllowed', false,
    'metaEventDeliveryAllowed', false,
    'deploymentAllowed', false
  )
);
