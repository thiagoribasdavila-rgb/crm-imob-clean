-- ATLAS Meta Signal Intelligence — Fase 9/100
-- Auditoria catalog-only para preparar o plano de hardening RLS.
--
-- SEGURANCA:
--   * esta consulta nao aplica migration, grant, policy ou configuracao Auth;
--   * nao consulta linhas de negocio nem dados pessoais;
--   * execute somente no clone de staging autorizado;
--   * o bloco e explicitamente READ ONLY e termina em ROLLBACK.

begin transaction read only;

select jsonb_build_object(
  'environmentMarker', coalesce(current_setting('atlas.environment', true), '__not_set__'),
  'isExpectedStagingClone', current_setting('atlas.environment', true) = 'staging_clone',
  'transactionReadOnly', current_setting('transaction_read_only'),
  'serverVersionMajor', current_setting('server_version_num')::integer / 10000
) as execution_guard;

select
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
from information_schema.columns c
where (c.table_schema, c.table_name) in (
  ('public', 'profiles'),
  ('public', 'leads')
)
and c.column_name in (
  'organization_id',
  'role',
  'commercial_role',
  'access_role',
  'reports_to',
  'assigned_to',
  'assigned_user_id'
)
order by c.table_schema, c.table_name, c.ordinal_position;

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, ', '), '__not_set__') as function_settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (n.nspname, p.proname) in (
  ('private', 'current_organization_id'),
  ('private', 'can_view_commercial_profile'),
  ('private', 'can_view_lead'),
  ('private', 'can_access_commercial_lead'),
  ('public', 'search_knowledge_chunks')
)
order by n.nspname, p.proname, identity_arguments;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual is not null as has_using_expression,
  with_check is not null as has_with_check_expression
from pg_policies
where schemaname = 'public'
and tablename in ('profiles', 'leads', 'crm_projects', 'marketing_campaigns')
order by tablename, policyname;

select
  grantee,
  table_schema,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
and table_name in ('profiles', 'leads', 'crm_projects', 'marketing_campaigns')
and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

rollback;

-- A aplicacao futura deve ser gerada como NOVA migration pelo Supabase CLI,
-- depois da reconciliacao de drift. Nao reaplicar automaticamente a migration
-- legada que usa public.leads.assigned_to: o snapshot remoto atual registra
-- public.leads.assigned_user_id.
--
-- Ordem revisavel da futura mudanca em staging:
--   1. fingerprint + backup verificavel;
--   2. colunas/hierarquia compativeis com o schema remoto;
--   3. helpers privados com auth.uid() explicito e search_path vazio;
--   4. policies de profiles/leads no mesmo transaction boundary;
--   5. grants minimos, em mudanca separada e reversivel;
--   6. versao exata de search_knowledge_chunks antes de qualquer hardening;
--   7. matriz RLS da Fase 8 e rollback dry-run;
--   8. aprovacao humana antes de preparar producao.
