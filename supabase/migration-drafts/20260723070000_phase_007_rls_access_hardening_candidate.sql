-- ATLAS 10X - Fase 7/24
-- Candidato de ensaio. NUNCA aplicar diretamente em homologação ou produção.
-- O bloco inteiro termina em ROLLBACK e exige uma cópia isolada identificada.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $phase_007_guard$
begin
  if current_setting('app.atlas_rls_rehearsal_environment', true) is distinct from 'isolated_clone' then
    raise exception 'phase_007_isolated_clone_required';
  end if;
end
$phase_007_guard$;

do $phase_007_schema_guard$
declare
  missing_tables text[];
begin
  select array_agg(required_table order by required_table)
    into missing_tables
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
  ]) required_table
  where to_regclass(format('public.%I', required_table)) is null;

  if coalesce(array_length(missing_tables, 1), 0) > 0 then
    raise exception 'phase_007_schema_drift:%', array_to_string(missing_tables, ',');
  end if;
end
$phase_007_schema_guard$;

-- Data API: tabelas internas e legadas não são caminhos diretos do navegador.
revoke all on table public.ai_conversations from public, anon, authenticated;
revoke all on table public.ai_learning_events from public, anon, authenticated;
revoke all on table public.ai_messages from public, anon, authenticated;
revoke all on table public.ai_tool_calls from public, anon, authenticated;
revoke all on table public.ai_usage from public, anon, authenticated;
revoke all on table public.api_rate_limit_buckets from public, anon, authenticated;
revoke all on table public.knowledge_chunks from public, anon, authenticated;
revoke all on table public.lead_identity_registry from public, anon, authenticated;
revoke all on table public.lead_scores from public, anon, authenticated;
revoke all on table public.projects from public, anon, authenticated;
revoke all on table public.user_provisioning_failures from public, anon, authenticated;
revoke all on table public.users from public, anon, authenticated;

grant all on table public.ai_conversations to service_role;
grant all on table public.ai_learning_events to service_role;
grant all on table public.ai_messages to service_role;
grant all on table public.ai_tool_calls to service_role;
grant all on table public.ai_usage to service_role;
grant all on table public.api_rate_limit_buckets to service_role;
grant all on table public.knowledge_chunks to service_role;
grant all on table public.lead_identity_registry to service_role;
grant all on table public.lead_scores to service_role;
grant all on table public.projects to service_role;
grant all on table public.user_provisioning_failures to service_role;
grant all on table public.users to service_role;

alter table public.ai_conversations enable row level security;
alter table public.ai_learning_events enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_tool_calls enable row level security;
alter table public.ai_usage enable row level security;
alter table public.api_rate_limit_buckets enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.lead_identity_registry enable row level security;
alter table public.lead_scores enable row level security;
alter table public.projects enable row level security;
alter table public.user_provisioning_failures enable row level security;
alter table public.users enable row level security;

-- Policies explícitas mantêm negação por padrão e eliminam ambiguidade operacional.
drop policy if exists ai_conversations_phase007_no_direct_api on public.ai_conversations;
create policy ai_conversations_phase007_no_direct_api on public.ai_conversations
  as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists ai_learning_events_phase007_no_direct_api on public.ai_learning_events;
create policy ai_learning_events_phase007_no_direct_api on public.ai_learning_events
  as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists ai_messages_phase007_no_direct_api on public.ai_messages;
create policy ai_messages_phase007_no_direct_api on public.ai_messages
  as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists ai_tool_calls_phase007_no_direct_api on public.ai_tool_calls;
create policy ai_tool_calls_phase007_no_direct_api on public.ai_tool_calls
  as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists ai_usage_phase007_no_direct_api on public.ai_usage;
create policy ai_usage_phase007_no_direct_api on public.ai_usage
  as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists api_rate_limit_buckets_phase007_no_direct_api on public.api_rate_limit_buckets;
create policy api_rate_limit_buckets_phase007_no_direct_api on public.api_rate_limit_buckets
  as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists knowledge_chunks_phase007_no_direct_api on public.knowledge_chunks;
create policy knowledge_chunks_phase007_no_direct_api on public.knowledge_chunks
  as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists lead_identity_registry_phase007_no_direct_api on public.lead_identity_registry;
create policy lead_identity_registry_phase007_no_direct_api on public.lead_identity_registry
  as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists lead_scores_phase007_no_direct_api on public.lead_scores;
create policy lead_scores_phase007_no_direct_api on public.lead_scores
  as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists projects_phase007_no_direct_api on public.projects;
create policy projects_phase007_no_direct_api on public.projects
  as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists user_provisioning_failures_phase007_no_direct_api on public.user_provisioning_failures;
create policy user_provisioning_failures_phase007_no_direct_api on public.user_provisioning_failures
  as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists users_phase007_no_direct_api on public.users;
create policy users_phase007_no_direct_api on public.users
  as restrictive for all to anon, authenticated using (false) with check (false);

-- Gatilhos são chamados pelo PostgreSQL, não por usuários do Data API.
revoke execute on function public.apply_opportunity_commission_sla() from public, anon, authenticated;
revoke execute on function public.refresh_commission_status() from public, anon, authenticated;
revoke execute on function public.scaffold_project_intelligence() from public, anon, authenticated;
alter function public.apply_opportunity_commission_sla() set search_path = '';
alter function public.refresh_commission_status() set search_path = '';
alter function public.scaffold_project_intelligence() set search_path = '';

-- RPCs confiáveis e helpers recebem somente os papéis explicitamente aprovados.
revoke execute on function public.create_lead_atomic(uuid, uuid, uuid, text, text, text, text, text, numeric, numeric, integer, text[], text, integer, text, jsonb) from public, anon;
grant execute on function public.create_lead_atomic(uuid, uuid, uuid, text, text, text, text, text, numeric, numeric, integer, text[], text, integer, text, jsonb) to authenticated, service_role;

revoke execute on function public.current_organization_id() from public, anon;
grant execute on function public.current_organization_id() to authenticated, service_role;
revoke execute on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated, service_role;

revoke execute on function public.distribute_project_leads(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.distribute_project_leads(uuid, uuid, uuid, integer) to service_role;
revoke execute on function public.effective_distribution_rule(uuid, uuid) from public, anon, authenticated;
grant execute on function public.effective_distribution_rule(uuid, uuid) to service_role;
revoke execute on function public.search_knowledge_chunks(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.search_knowledge_chunks(text, uuid, integer) to service_role;

revoke execute on function public.mutate_crm_project_v1(uuid, text, uuid, jsonb, text, text) from public, anon;
grant execute on function public.mutate_crm_project_v1(uuid, text, uuid, jsonb, text, text) to authenticated, service_role;

-- Novas funções deixam de herdar EXECUTE público por acidente.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Candidato de ensaio: nenhuma alteração sobrevive a esta execução.
rollback;
