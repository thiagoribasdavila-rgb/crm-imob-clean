begin;

-- Fase 17: a organização é a primeira fronteira; carteira/equipe/função refinam
-- o acesso aos registros comerciais. As políticas são recriadas de forma
-- compatível com o schema já existente no projeto remoto.

alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.opportunities enable row level security;
alter table public.activities enable row level security;
alter table public.tasks enable row level security;
alter table public.campaigns enable row level security;
alter table public.ai_insights enable row level security;

create or replace function private.is_commercial_leadership()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.active = true
      and coalesce(
        p.commercial_role,
        case when p.role = 'admin' then 'director' else p.role end
      ) in ('director', 'superintendent', 'manager')
  );
$$;

revoke all on function private.is_commercial_leadership() from public;
grant execute on function private.is_commercial_leadership() to authenticated, service_role;

-- Tarefas: vinculadas a uma lead seguem a carteira; tarefas pessoais ficam
-- restritas ao responsável. Lideranças enxergam apenas a própria cadeia.
drop policy if exists tasks_org_access on public.tasks;
drop policy if exists tasks_commercial_select on public.tasks;
drop policy if exists tasks_commercial_insert on public.tasks;
drop policy if exists tasks_commercial_update on public.tasks;
drop policy if exists tasks_commercial_delete on public.tasks;

do $$
declare
  owner_column text;
  lead_clause text;
  scope_clause text;
begin
  select column_name into owner_column
  from information_schema.columns
  where table_schema = 'public' and table_name = 'tasks'
    and column_name in ('assigned_to', 'user_id', 'owner_id', 'created_by')
  order by array_position(array['assigned_to','user_id','owner_id','created_by'], column_name)
  limit 1;

  lead_clause := case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'lead_id'
  ) then '(lead_id is not null and exists (select 1 from public.leads l where l.id = lead_id and (select private.can_access_commercial_lead(l.organization_id, l.assigned_to))))'
    else 'false' end;

  scope_clause := lead_clause;
  if owner_column is not null then
    scope_clause := format('(%s or (%I is not null and (select private.can_view_commercial_profile(%I))))', scope_clause, owner_column, owner_column);
  end if;
  scope_clause := format('organization_id = (select public.current_organization_id()) and %s', scope_clause);

  execute format('create policy tasks_commercial_select on public.tasks for select to authenticated using (%s)', scope_clause);
  execute format('create policy tasks_commercial_insert on public.tasks for insert to authenticated with check (%s)', scope_clause);
  execute format('create policy tasks_commercial_update on public.tasks for update to authenticated using (%s) with check (%s)', scope_clause, scope_clause);
  execute format('create policy tasks_commercial_delete on public.tasks for delete to authenticated using (%s)', scope_clause);
end $$;

-- Campanhas são conhecimento compartilhado da empresa, mas somente liderança
-- comercial pode alterar orçamento, configuração e resultados.
drop policy if exists campaigns_org_access on public.campaigns;
drop policy if exists campaigns_org_select on public.campaigns;
drop policy if exists campaigns_leadership_insert on public.campaigns;
drop policy if exists campaigns_leadership_update on public.campaigns;
drop policy if exists campaigns_leadership_delete on public.campaigns;
create policy campaigns_org_select on public.campaigns for select to authenticated
  using (organization_id = (select public.current_organization_id()));
create policy campaigns_leadership_insert on public.campaigns for insert to authenticated
  with check (organization_id = (select public.current_organization_id()) and (select private.is_commercial_leadership()));
create policy campaigns_leadership_update on public.campaigns for update to authenticated
  using (organization_id = (select public.current_organization_id()) and (select private.is_commercial_leadership()))
  with check (organization_id = (select public.current_organization_id()) and (select private.is_commercial_leadership()));
create policy campaigns_leadership_delete on public.campaigns for delete to authenticated
  using (organization_id = (select public.current_organization_id()) and (select private.is_commercial_leadership()));

-- Insights preditivos são somente leitura no cliente. Geração e mutação ficam
-- no backend (service role), evitando que um usuário forje recomendações.
drop policy if exists ai_insights_org_access on public.ai_insights;
drop policy if exists ai_insights_org_select on public.ai_insights;
create policy ai_insights_org_select on public.ai_insights for select to authenticated
  using (organization_id = (select public.current_organization_id()));

-- As tabelas de infraestrutura não são APIs de usuário. RLS permanece como
-- defesa em profundidade e os privilégios diretos são removidos.
revoke all on table public.idempotency_keys from anon, authenticated;
revoke all on table public.integration_outbox from anon, authenticated;
revoke all on table public.dead_letter_events from anon, authenticated;
revoke all on table public.user_provisioning_failures from anon, authenticated;

-- Índices das expressões usadas pelas políticas críticas.
create index if not exists idx_profiles_org_hierarchy_active
  on public.profiles (organization_id, manager_id, commercial_role) where active = true;
create index if not exists idx_leads_org_assigned_rls
  on public.leads (organization_id, assigned_to);
create index if not exists idx_tasks_org_lead_rls
  on public.tasks (organization_id, lead_id);
create index if not exists idx_campaigns_org_rls
  on public.campaigns (organization_id);
create index if not exists idx_ai_insights_org_rls
  on public.ai_insights (organization_id);

commit;
