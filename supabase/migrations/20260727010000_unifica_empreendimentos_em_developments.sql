-- UNIFICA O CADASTRO DE EMPREENDIMENTOS EM `developments`.
--
-- ── O PROBLEMA MEDIDO ───────────────────────────────────────────────────────
--
-- `crm_projects` e `developments` guardam os MESMOS empreendimentos com
-- identificadores DIFERENTES:
--
--   Arvo Teixeira da Silva   c22ddbcb…  vs  390894d2…
--   Inside Perdizes          f66bb86e…  vs  0df32360…
--   Tiê Aclimação            2881028e…  vs  cb7461af…
--   Spin Mood                019152dd…  vs  (não existe)
--
-- A tela de Projetos lê `crm_projects`; as 174 leads apontam para
-- `developments`. Nenhuma junção fecha — os quatro projetos aparecem com ZERO
-- leads, sendo que Inside Perdizes tem 174.
--
-- ── POR QUE `developments` VENCE ────────────────────────────────────────────
--
--   33 tabelas referenciam `developments`
--    6 tabelas referenciam `crm_projects` — e NENHUMA delas tem uma linha
--      sequer apontando para lá:
--
--        crm_project_events                0 linhas
--        inventory_units                   0 linhas
--        knowledge_chunks                  0 linhas
--        knowledge_documents               0 linhas
--        leads.project_id            217 linhas,  0 preenchidas
--        marketing_campaigns.project_id 1 linha,   0 preenchida
--        meta_lead_sources.development_id 27 linhas, 0 preenchidas
--
-- `crm_projects` é uma tabela de 4 linhas para a qual nada aponta. Foi criada
-- por um espelhamento anterior que gerou identificadores novos em vez de reusar
-- os existentes.
--
-- ── O QUE ESTA MIGRATION FAZ ────────────────────────────────────────────────
--
-- Uma coisa só: garante que todo empreendimento de `crm_projects` exista também
-- em `developments`. Na prática, hoje, é UMA linha — o Spin Mood.
--
-- ── O QUE ELA NÃO FAZ, DE PROPÓSITO ─────────────────────────────────────────
--
-- Não apaga `crm_projects`, não remove coluna, não repõe chave estrangeira e
-- não move dado de lugar. Nada aponta para a tabela antiga, então não há o que
-- repontar; e derrubá-la seria destrutivo sem necessidade — o ganho é zero e o
-- risco não. Ela fica onde está, vazia de referências, e o código deixa de
-- lê-la.
--
-- Idempotente: rodar de novo não duplica nada.

insert into public.developments (organization_id, name, developer_name, status)
select
  cp.organization_id,
  cp.name,
  -- `developer_name` é NOT NULL em developments; crm_projects trazia o texto
  -- "Incorporadora nao informada" para o Spin Mood, e preservá-lo é melhor que
  -- inventar um nome ou deixar a linha de fora.
  coalesce(nullif(trim(cp.developer_name), ''), 'Incorporadora não informada'),
  -- O status de crm_projects vem em caixa alta (ACTIVE); developments usa
  -- minúscula. Normalizar aqui evita uma quinta grafia no vocabulário.
  lower(coalesce(nullif(trim(cp.status), ''), 'active'))
from public.crm_projects cp
where not exists (
  select 1 from public.developments d
  where d.organization_id = cp.organization_id
    and lower(trim(d.name)) = lower(trim(cp.name))
);

-- Confere o resultado no log da aplicação da migration: todo projeto do cadastro
-- antigo tem correspondente no novo.
do $$
declare
  faltando integer;
begin
  select count(*) into faltando
  from public.crm_projects cp
  where not exists (
    select 1 from public.developments d
    where d.organization_id = cp.organization_id
      and lower(trim(d.name)) = lower(trim(cp.name))
  );
  if faltando > 0 then
    raise exception 'Unificacao incompleta: % projeto(s) de crm_projects sem correspondente em developments', faltando;
  end if;
  raise notice 'Empreendimentos unificados: todo crm_projects tem correspondente em developments.';
end $$;
