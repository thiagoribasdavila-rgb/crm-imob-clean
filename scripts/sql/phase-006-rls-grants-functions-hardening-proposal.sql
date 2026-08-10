-- ATLAS 10X — FASE 6/24
-- PROPOSTA NÃO APLICADA. Não executar em ambiente remoto.
-- O arquivo falha fechado enquanto qualquer tabela estiver sem classificação
-- e termina em ROLLBACK mesmo depois da aprovação das decisões.

begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

create temporary table phase_006_table_decisions (
  table_name text primary key,
  decision text not null check (decision in ('unresolved', 'server_only', 'tenant_read', 'tenant_write')),
  approved_policy_name text,
  approved_by text
) on commit drop;

insert into phase_006_table_decisions (table_name, decision) values
  ('ai_conversations', 'unresolved'),
  ('ai_learning_events', 'unresolved'),
  ('ai_messages', 'unresolved'),
  ('ai_tool_calls', 'unresolved'),
  ('ai_usage', 'unresolved'),
  ('api_rate_limit_buckets', 'unresolved'),
  ('knowledge_chunks', 'unresolved'),
  ('lead_identity_registry', 'unresolved'),
  ('lead_scores', 'unresolved'),
  ('projects', 'unresolved'),
  ('user_provisioning_failures', 'unresolved'),
  ('users', 'unresolved');

do $phase_006_gate$
begin
  if exists (
    select 1
    from phase_006_table_decisions
    where decision = 'unresolved'
  ) then
    raise exception
      'phase_006_blocked: classifique cada tabela, aprove o contrato e ensaie em banco isolado';
  end if;
end
$phase_006_gate$;

-- Gatilhos não são RPCs. Revogar EXECUTE direto não impede sua chamada pelo trigger.
revoke execute on function public.apply_opportunity_commission_sla()
  from public, anon, authenticated;
revoke execute on function public.refresh_commission_status()
  from public, anon, authenticated;
revoke execute on function public.scaffold_project_intelligence()
  from public, anon, authenticated;

grant execute on function public.apply_opportunity_commission_sla()
  to service_role;
grant execute on function public.refresh_commission_status()
  to service_role;
grant execute on function public.scaffold_project_intelligence()
  to service_role;

-- As implementações locais qualificam todas as relações com public.,
-- portanto podem operar com search_path vazio após ensaio isolado.
alter function public.apply_opportunity_commission_sla() set search_path = '';
alter function public.refresh_commission_status() set search_path = '';
alter function public.scaffold_project_intelligence() set search_path = '';

-- O contrato local da distribuição é service-only. A evidência remota diverge.
revoke execute on function public.distribute_project_leads(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.distribute_project_leads(uuid, uuid, uuid, integer)
  to service_role;

-- FUTURO, somente depois de inventário completo dos consumidores:
-- alter default privileges in schema public
--   revoke execute on functions from public, anon, authenticated;
-- Cada migration deverá conceder apenas o privilégio necessário e criar a
-- policy RLS correspondente no mesmo pacote.

-- O ROLLBACK é intencional. Uma migration aplicável será criada somente
-- depois dos testes da fase 7 e de aprovação humana explícita.
rollback;
