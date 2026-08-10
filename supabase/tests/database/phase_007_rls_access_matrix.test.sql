begin;

do $phase_007_test_guard$
begin
  if current_setting('app.atlas_rls_rehearsal_environment', true) is distinct from 'isolated_clone' then
    raise exception 'phase_007_isolated_clone_required';
  end if;
end
$phase_007_test_guard$;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', table_name, format('%s existe no clone isolado', table_name))
from unnest(array[
  'ai_conversations',
  'ai_learning_events',
  'ai_messages',
  'ai_tool_calls',
  'ai_usage',
  'api_rate_limit_buckets',
  'knowledge_chunks',
  'lead_identity_registry',
  'lead_scores',
  'projects',
  'user_provisioning_failures',
  'users'
]) table_name;

select ok(
  (select relrowsecurity from pg_class where oid = format('public.%I', table_name)::regclass),
  format('RLS está ativo em %s', table_name)
)
from unnest(array[
  'ai_conversations',
  'ai_learning_events',
  'ai_messages',
  'ai_tool_calls',
  'ai_usage',
  'api_rate_limit_buckets',
  'knowledge_chunks',
  'lead_identity_registry',
  'lead_scores',
  'projects',
  'user_provisioning_failures',
  'users'
]) table_name;

select ok(
  not has_table_privilege('anon', format('public.%I', table_name), 'select'),
  format('anon não possui SELECT em %s', table_name)
)
from unnest(array[
  'ai_conversations',
  'ai_learning_events',
  'ai_messages',
  'ai_tool_calls',
  'ai_usage',
  'api_rate_limit_buckets',
  'knowledge_chunks',
  'lead_identity_registry',
  'lead_scores',
  'projects',
  'user_provisioning_failures',
  'users'
]) table_name;

select ok(
  not has_table_privilege('authenticated', format('public.%I', table_name), 'select')
  and not has_table_privilege('authenticated', format('public.%I', table_name), 'insert')
  and not has_table_privilege('authenticated', format('public.%I', table_name), 'update')
  and not has_table_privilege('authenticated', format('public.%I', table_name), 'delete'),
  format('authenticated não acessa diretamente %s', table_name)
)
from unnest(array[
  'ai_conversations',
  'ai_learning_events',
  'ai_messages',
  'ai_tool_calls',
  'ai_usage',
  'api_rate_limit_buckets',
  'knowledge_chunks',
  'lead_identity_registry',
  'lead_scores',
  'projects',
  'user_provisioning_failures',
  'users'
]) table_name;

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = table_name
      and policyname = table_name || '_phase007_no_direct_api'
      and permissive = 'RESTRICTIVE'
      and roles @> array['anon', 'authenticated']::name[]
  ),
  format('%s possui policy explícita de negação direta', table_name)
)
from unnest(array[
  'ai_conversations',
  'ai_learning_events',
  'ai_messages',
  'ai_tool_calls',
  'ai_usage',
  'api_rate_limit_buckets',
  'knowledge_chunks',
  'lead_identity_registry',
  'lead_scores',
  'projects',
  'user_provisioning_failures',
  'users'
]) table_name;

select ok(
  not has_function_privilege('anon', 'public.apply_opportunity_commission_sla()', 'execute')
  and not has_function_privilege('authenticated', 'public.apply_opportunity_commission_sla()', 'execute'),
  'gatilho de SLA não é executável pelo Data API'
);
select ok(
  not has_function_privilege('anon', 'public.refresh_commission_status()', 'execute')
  and not has_function_privilege('authenticated', 'public.refresh_commission_status()', 'execute'),
  'gatilho de comissão não é executável pelo Data API'
);
select ok(
  not has_function_privilege('anon', 'public.scaffold_project_intelligence()', 'execute')
  and not has_function_privilege('authenticated', 'public.scaffold_project_intelligence()', 'execute'),
  'gatilho de projeto não é executável pelo Data API'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_lead_atomic(uuid,uuid,uuid,text,text,text,text,text,numeric,numeric,integer,text[],text,integer,text,jsonb)',
    'execute'
  ),
  'authenticated mantém o RPC atômico governado'
);
select ok(
  has_function_privilege('authenticated', 'public.current_organization_id()', 'execute')
  and has_function_privilege('authenticated', 'public.current_user_role()', 'execute'),
  'authenticated mantém helpers exigidos pelas policies existentes'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.mutate_crm_project_v1(uuid,text,uuid,jsonb,text,text)',
    'execute'
  ),
  'authenticated mantém mutação de projeto governada'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.distribute_project_leads(uuid,uuid,uuid,integer)',
    'execute'
  ),
  'distribuição privilegiada fica somente no servidor'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.effective_distribution_rule(uuid,uuid)',
    'execute'
  ),
  'regra efetiva fica somente no servidor até prova de tenant'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.search_knowledge_chunks(text,uuid,integer)',
    'execute'
  ),
  'busca de conhecimento fica somente no servidor até prova de tenant'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'apply_opportunity_commission_sla',
        'refresh_commission_status',
        'scaffold_project_intelligence'
      )
      and not (
        coalesce(p.proconfig, array[]::text[]) @> array['search_path=""']
      )
  ),
  'gatilhos SECURITY DEFINER fixam search_path vazio'
);

-- As provas dinâmicas abaixo são obrigatórias na fase 8, depois de restaurar
-- um clone e criar dois tenants com broker, manager e director. Nenhum fixture
-- real é criado nesta fase estática.

select * from finish();
rollback;
