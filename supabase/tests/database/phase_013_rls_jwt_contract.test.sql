begin;

create extension if not exists pgtap with schema extensions;
select plan(31);

select has_table('public', 'profiles', 'profiles existe no ambiente isolado');
select has_table('public', 'leads', 'leads existe no ambiente isolado');
select has_column('public', 'profiles', 'organization_id', 'profiles possui organization_id');
select has_column('public', 'profiles', 'commercial_role', 'profiles possui commercial_role');
select has_column('public', 'profiles', 'reports_to', 'profiles possui reports_to');
select has_column('public', 'leads', 'organization_id', 'leads possui organization_id');
select has_column('public', 'leads', 'assigned_to', 'leads possui assigned_to');
select has_column('public', 'leads', 'score', 'leads possui score canonico');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS esta ativo em profiles'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.leads'::regclass),
  'RLS esta ativo em leads'
);

select ok(exists(
  select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
    and policyname = 'profiles_commercial_scope' and roles @> array['authenticated']::name[]
), 'policy hierarquica de profiles esta ativa');
select ok(exists(
  select 1 from pg_policies where schemaname = 'public' and tablename = 'leads'
    and policyname = 'leads_commercial_select' and cmd = 'SELECT'
), 'policy SELECT de leads esta ativa');
select ok(exists(
  select 1 from pg_policies where schemaname = 'public' and tablename = 'leads'
    and policyname = 'leads_commercial_insert' and cmd = 'INSERT'
), 'policy INSERT de leads esta ativa');
select ok(exists(
  select 1 from pg_policies where schemaname = 'public' and tablename = 'leads'
    and policyname = 'leads_commercial_update' and cmd = 'UPDATE'
), 'policy UPDATE de leads esta ativa');
select ok(exists(
  select 1 from pg_policies where schemaname = 'public' and tablename = 'leads'
    and policyname = 'leads_commercial_delete' and cmd = 'DELETE'
), 'policy DELETE de leads esta ativa');
select ok(exists(
  select 1 from pg_policies where schemaname = 'public' and tablename = 'leads'
    and policyname = 'leads_commercial_update' and qual is not null
), 'UPDATE possui USING');
select ok(exists(
  select 1 from pg_policies where schemaname = 'public' and tablename = 'leads'
    and policyname = 'leads_commercial_update' and with_check is not null
), 'UPDATE possui WITH CHECK');

select has_function('private', 'can_view_commercial_profile', array['uuid'], 'helper de visibilidade de perfil existe');
select has_function('private', 'can_access_commercial_lead', array['uuid', 'uuid'], 'helper de acesso a lead existe');
select ok((
  select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'can_view_commercial_profile'
), 'helper de perfil usa SECURITY DEFINER');
select ok((
  select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'can_access_commercial_lead'
), 'helper de lead usa SECURITY DEFINER');
select ok((
  select coalesce(proconfig, array[]::text[]) @> array['search_path=""']
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'can_view_commercial_profile'
), 'helper de perfil fixa search_path vazio');
select ok((
  select coalesce(proconfig, array[]::text[]) @> array['search_path=""']
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'can_access_commercial_lead'
), 'helper de lead fixa search_path vazio');
select ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname in ('can_view_commercial_profile', 'can_access_commercial_lead')
    and pg_get_functiondef(p.oid) ~* '(raw_user_meta_data|user_metadata)'
), 'autorizacao nao usa metadata editavel pelo usuario');
select ok((
  select bool_and(pg_get_functiondef(p.oid) like '%auth.uid()%')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname in ('can_view_commercial_profile', 'can_access_commercial_lead')
), 'helpers resolvem identidade por auth.uid');

select ok(not has_table_privilege('anon', 'public.leads', 'select'), 'anon nao possui SELECT em leads');
select ok(has_table_privilege('authenticated', 'public.leads', 'select'), 'authenticated possui SELECT explicito');
select ok(has_table_privilege('authenticated', 'public.leads', 'update'), 'authenticated possui UPDATE explicito governado por RLS');
select ok(not has_function_privilege('anon', 'private.can_view_commercial_profile(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.can_access_commercial_lead(uuid,uuid)', 'execute'),
  'anon nao executa helpers privados');
select ok(has_function_privilege('authenticated', 'private.can_view_commercial_profile(uuid)', 'execute')
  and has_function_privilege('authenticated', 'private.can_access_commercial_lead(uuid,uuid)', 'execute'),
  'authenticated executa apenas os helpers necessarios');
select ok(
  to_regclass('public.profiles_reports_to_idx') is not null
  and to_regclass('public.leads_org_assigned_created_idx') is not null,
  'indices de hierarquia e escopo existem'
);

select * from finish();
rollback;
