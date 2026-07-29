-- ── ROLLBACK de 20260729140000_leads_cerca_da_organizacao_e_piso_de_carteira ─
--
-- Devolve `public.leads` EXATAMENTE ao estado de 2026-07-29 antes da migration:
-- cinco policies PERMISSIVE, sendo `leads_org_access` cmd=ALL da organização
-- inteira, e as quatro comerciais lendo só `assigned_to`.
--
-- Escrito a partir das definições REAIS lidas de pg_policy hoje
-- (pg_get_expr sobre polqual/polwithcheck), não de memória. `pg_get_expr`
-- renderiza `public.profiles` como `profiles` porque o schema está no
-- search_path — o texto restaurado sai idêntico ao que estava lá.
--
-- ATENÇÃO ao que ele traz de volta: `leads_org_access` é a policy que ENGOLE as
-- quatro comerciais por OR. Rodar isto REABRE o vazamento medido (corretor de
-- carteira vazia lendo, alterando e apagando lead de qualquer colega da
-- organização). É rollback de emergência, não posição de repouso.
--
-- Nenhum DROP de dado, nenhum TRUNCATE: só policy e a função nova.

begin;

drop policy if exists leads_commercial_select on public.leads;
drop policy if exists leads_commercial_insert on public.leads;
drop policy if exists leads_commercial_update on public.leads;
drop policy if exists leads_commercial_delete on public.leads;
drop policy if exists leads_org_fence        on public.leads;

create policy leads_org_access on public.leads
  for all
  to authenticated
  using (
    organization_id = (
      select profiles.organization_id from public.profiles
      where profiles.id = (select auth.uid())
    )
  )
  with check (
    organization_id = (
      select profiles.organization_id from public.profiles
      where profiles.id = (select auth.uid())
    )
  );

create policy leads_commercial_select on public.leads
  for select
  to authenticated
  using ((select private.can_access_commercial_lead(leads.organization_id, leads.assigned_to)));

create policy leads_commercial_insert on public.leads
  for insert
  to authenticated
  with check ((select private.can_access_commercial_lead(leads.organization_id, leads.assigned_to)));

create policy leads_commercial_update on public.leads
  for update
  to authenticated
  using ((select private.can_access_commercial_lead(leads.organization_id, leads.assigned_to)))
  with check ((select private.can_access_commercial_lead(leads.organization_id, leads.assigned_to)));

create policy leads_commercial_delete on public.leads
  for delete
  to authenticated
  using ((select private.can_access_commercial_lead(leads.organization_id, leads.assigned_to)));

-- A função nova sai por último: enquanto alguma policy a chamasse, o drop
-- falharia por dependência.
drop function if exists private.can_access_lead_row(uuid, uuid, uuid);
-- A regra do apagar (igual à de alcance, menos a cláusula de lead órfã) nasceu
-- junto com esta migration; o rollback tem de levá-la embora também, senão fica
-- uma função órfã no schema `private` que ninguém chama e ninguém explica.
drop function if exists private.pode_apagar_lead(uuid, uuid, uuid);

commit;
