-- =============================================================================
-- Os quatro projetos existem para o CRM, e cada formulário sabe de qual é
-- =============================================================================
--
-- MEDIDO EM 2026-07-26, ao mapear os 4 empreendimentos que a operação atende
-- (Spin Mood, Inside Perdizes, Arvo/Kallas e Tiê Aclimação):
--
--   developments   3 linhas   Tiê Aclimação | Arvo Teixeira da Silva | Inside Perdizes
--   crm_projects   0 linhas   ← e é DESTA que as telas leem
--
-- Seletor de projeto na ficha do lead, nome do empreendimento no desempenho de
-- campanha, opções de filtro: tudo consulta crm_projects. Com ela vazia, a
-- operação inteira enxerga "sem projeto" — sem erro, sem log, sem sintoma.
-- É o mesmo padrão que já apareceu cinco vezes nesta sessão: duas tabelas para a
-- mesma coisa, e a tela lendo a que ninguém popula.
--
-- Também faltava o elo formulário → empreendimento. Das 174 leads com projeto,
-- TODAS apontam para Inside Perdizes; Arvo e Tiê estão zeradas, embora Arvo
-- tenha 18 leads nos formulários da Meta. A lead entra sem saber de que projeto
-- é, e aí nenhuma medição por empreendimento fecha.
--
-- O QUE ESTA MIGRATION FAZ
--   1. espelha developments → crm_projects (idempotente, sem apagar nada);
--   2. cadastra Spin Mood, que não existia em lugar nenhum e é o de maior
--      volume nos formulários da Meta (16 leads em dois formulários);
--   3. acrescenta meta_lead_sources.development_id, para cada formulário
--      declarar a que empreendimento pertence.
--
-- O QUE NÃO FAZ
-- Não adivinha o vínculo de nenhum formulário. Casar "Arvo - novo (v5)" com
-- "Arvo Teixeira da Silva" é palpite de nome, e palpite errado atribui lead ao
-- empreendimento errado — o tipo de erro que contamina relatório por meses. O
-- vínculo é decisão humana, feita na tela.
-- =============================================================================

-- 1) Espelho developments → crm_projects. `on conflict do nothing` protege
--    quem já tiver a linha; nada existente é sobrescrito.
insert into public.crm_projects (organization_id, name, developer_name, status, city, neighborhood)
select
  d.organization_id,
  d.name,
  coalesce(d.developer_name, 'Incorporadora não informada'),
  -- Vocabulário divergente entre as duas tabelas: developments grava 'active'
  -- em minúsculo, crm_projects tem CHECK exigindo ACTIVE/PAUSED/SOLD_OUT/
  -- ARCHIVED. Copiar cru quebra a constraint — foi o que aconteceu na primeira
  -- tentativa. É a mesma classe do 'meta_ads' vs 'meta ads' corrigido no SLA:
  -- duas partes do sistema falando do mesmo estado com palavras diferentes.
  case upper(coalesce(d.status, 'ACTIVE'))
    when 'ACTIVE' then 'ACTIVE'
    when 'ATIVO' then 'ACTIVE'
    when 'PAUSED' then 'PAUSED'
    when 'PAUSADO' then 'PAUSED'
    when 'SOLD_OUT' then 'SOLD_OUT'
    when 'VENDIDO' then 'SOLD_OUT'
    when 'ARCHIVED' then 'ARCHIVED'
    when 'ARQUIVADO' then 'ARCHIVED'
    else 'ACTIVE'
  end,
  d.city,
  d.neighborhood
from public.developments d
where not exists (
  select 1 from public.crm_projects c
   where c.organization_id = d.organization_id
     and lower(c.name) = lower(d.name)
);

-- 2) Spin Mood: existe na Meta com 16 leads e não existia no CRM.
insert into public.crm_projects (organization_id, name, developer_name, status)
select o.id, 'Spin Mood', 'Incorporadora não informada', 'ACTIVE'
from public.organizations o
where o.slug is distinct from 'atlas-default'
  and not exists (
    select 1 from public.crm_projects c
     where c.organization_id = o.id and lower(c.name) = 'spin mood'
  );

-- 3) O formulário passa a poder declarar seu empreendimento.
alter table public.meta_lead_sources
  add column if not exists development_id uuid references public.crm_projects(id) on delete set null;

comment on column public.meta_lead_sources.development_id is
  'Empreendimento ao qual este formulário pertence. A lead ingerida herda o vínculo. Nulo = não declarado; o sistema NÃO adivinha por nome.';

create index if not exists meta_lead_sources_development_idx
  on public.meta_lead_sources (organization_id, development_id)
  where development_id is not null;
