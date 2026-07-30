-- =============================================================================
-- 6.3 GRAFO DE OPORTUNIDADE DE RECEITA — em PostgreSQL puro, custo R$ 0
-- =============================================================================
--
-- ── O PEDIDO, NAS PALAVRAS DO DONO ──────────────────────────────────────────
--
-- Um grafo operacional ligando leads · clientes · interesses · imóveis ·
-- unidades · bairros · campanhas · anúncios · corretores · interações · visitas
-- · propostas · vendas. E, no mesmo documento, a fronteira:
--
--   "Começar com relações no PostgreSQL. Adotar banco de grafos separado somente
--    quando houver necessidade comprovada de escala ou complexidade."
--
-- Por isso aqui não há tabela nova, não há cópia de dados e não há serviço novo.
-- Grafo, nesta migration, é a LEITURA das arestas que o schema já tem: as FKs,
-- `leads.development_id`, `leads.campaign_id`, `leads.assigned_to`,
-- `lead_attribution_touches.*`. Desligar é `drop view` / `drop function`.
--
-- ── O ACHADO QUE VALE MAIS QUE AS CONSULTAS (medido 2026-07-30, org viva) ────
--
-- O grafo existe. Ele é MAGRO, e em pontos específicos ele é VAZIO:
--
--   ARESTA                                    LINHAS      COBERTURA
--   lead → corretor .......................... 469/482      97,3%
--   lead → empreendimento (development_id) ... 192/482      39,8%
--   lead → toque de atribuição ............... 1152 (483 leads)
--   lead → interação (lead_events) ........... 310
--   lead → etapa (pipeline_stage_moves) ...... 137 (115 leads)
--   lead → campanha (TEXTO) .................. 212/482  (8 textos)
--   lead → campanha (FK campaign_id) ......... 24/482   (1 campanha)
--   lead → quartos desejados ................. 12/482       2,5%
--   lead → orçamento ......................... 9/482        1,9%
--   lead → bairro desejado ................... 6/482        1,2%
--   lead → visita ............................ 1
--   lead → proposta (opportunities) .......... 0
--   lead → cliente (customers) ............... 0
--   empreendimento → preço ................... 0/4          0%
--   tipologia → preço ........................ 0/6          0%
--   unidade (units+inventory_units+properties) 0            0%
--   venda com valor apurado .................. 0
--
--   Desfechos rotulados: 88 — sendo 84 `lost`, 2 `won`, 2 `external_purchase`.
--   Os 88 pendurados em 2 corretores. 87 dos 88 vindos de UMA fonte (meta_ads).
--
-- Duas consequências que mandam no desenho inteiro:
--
-- 1. O EIXO PREÇO ESTÁ MORTO NOS DOIS LADOS. Não é que falte preço na oferta:
--    falta na oferta (0 de 4) E na demanda (9 de 482). Nenhuma consulta deste
--    arquivo casa por preço, porque casar por preço aqui seria inventar.
--
-- 2. RANQUEAR É O RISCO, NÃO CONSULTAR. Com 2 vitórias, um "corretor mais
--    adequado" ordenado por taxa de conversão elege quem teve 1 desfecho e
--    acertou. Por isso **nenhuma função deste arquivo devolve `suficiente`**:
--    todas devolvem `desfechos_na_base` — o DENOMINADOR — e quem julga é
--    `lib/crm/grafo-de-receita.ts`, uma vez, para todo mundo.
--
-- ── A FRONTEIRA COM `lib/crm/compatibilidade-imovel.ts` ─────────────────────
--
-- Aquele módulo já responde "este cliente combina com este imóvel?" por ATRIBUTO
-- DECLARADO, com 14 critérios e peso. Este arquivo NÃO reimplementa critério,
-- peso nem normalização de bairro — ele ENUMERA CANDIDATOS pela aresta e entrega.
--
--   atributo declarado (um par por vez) ...... compatibilidade-imovel.ts
--   aresta (quem se ligou a quem) ............ aqui, em SQL
--
-- E é por isso que as duas coisas precisam existir: por atributo declarado o
-- alcance é 13 de 482 leads; pela aresta `development_id`, 192 de 482.
--
-- ── A CERCA: DOIS CAMINHOS, PORQUE O TRÁFEGO REAL USA service_role ──────────
--
-- As VIEWS levam `security_invoker = true` — sem isso a view roda com os
-- privilégios do DONO e ATRAVESSA a RLS de quem consulta, que é o vazamento com
-- nome bonito. Não havia precedente: este é o primeiro objeto view do banco (0
-- views em `information_schema.views`, medido hoje), então o default do Postgres
-- (`security_invoker = false`) valeria por omissão.
--
-- Só que `security_invoker` não protege o caminho que a operação realmente usa:
-- service_role tem BYPASSRLS. Por isso as FUNÇÕES exigem `p_ator_id` e aplicam a
-- cerca EXPLICITAMENTE, via `private.ator_alcanca_lead` — o gêmeo de
-- `private.can_access_lead_row` com ator explícito em vez de `auth.uid()`.
--
-- Três implementações da MESMA régua passam a existir (a de TypeScript em
-- `lib/crm/escopo-de-leitura.ts`, a de RLS `can_access_lead_row`, e a de ator
-- explícito). Nenhuma pode divergir, e é
-- `tests/contracts/grafo-de-receita.test.mjs` quem cobra caso a caso — a mesma
-- técnica que este repositório já usa para `filtroDaMinhaCarteira` vs
-- `estaNaMinhaCarteira`.
-- =============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) A CERCA COM ATOR EXPLÍCITO
-- ─────────────────────────────────────────────────────────────────────────────
-- Cópia fiel da régua de `private.can_access_lead_row`, com uma diferença só: o
-- ator vem por parâmetro. `can_access_lead_row` lê `auth.uid()` e devolve false
-- quando não há JWT — ou seja, é INÚTIL no caminho service_role, que é 124 dos
-- 130 arquivos que falam com o banco neste repositório.
--
-- Ator nulo NÃO é "vê tudo": é `false`. A direção do erro importa — cerca que se
-- abre quando o ator falta é a classe de bug que já vazou dados entre empresas
-- aqui (claim de JWT com precedência).
create or replace function private.ator_alcanca_lead(
  p_ator_id uuid,
  p_lead_organization_id uuid,
  p_lead_assigned_to uuid,
  p_lead_assigned_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- `recursive` por causa de `equipe`: a cadeia tem mais de um nível
  -- (diretor → gerente → corretor) e sem a palavra o Postgres recusa o CTE.
  with recursive ator as (
    select id, organization_id,
      coalesce(
        commercial_role,
        case role when 'admin' then 'director' when 'manager' then 'manager' when 'broker' then 'broker' end
      ) as commercial_role,
      role as papel_bruto
    from public.profiles
    where id = p_ator_id and active = true
  ),
  -- A hierarquia: o ator e todos que reportam a ele, direta ou indiretamente.
  -- É a mesma noção de `idsDaEquipe` (reports_to, NÃO profiles.team — `team`
  -- está vazio em 27 de 27 perfis ativos) e a mesma de
  -- private.can_view_commercial_profile.
  equipe as (
    select p.id from public.profiles p join ator a on p.id = a.id
    union all
    select p.id
    from public.profiles p
    join equipe e on p.reports_to = e.id
    where p.active = true
  )
  select exists (
    select 1 from ator a
    where p_ator_id is not null
      and a.organization_id = p_lead_organization_id
      and (
        a.commercial_role in ('director', 'superintendent', 'manager', 'admin')
        or a.papel_bruto = 'admin'
        or p_lead_assigned_to = a.id
        or p_lead_assigned_user_id = a.id
        -- Lead sem dono nenhum entra DE PROPÓSITO: escondê-la a deixaria parada
        -- para sempre e ninguém a adotaria. Mesma cláusula órfã de
        -- `filtroDaMinhaCarteira`, pelo mesmo motivo.
        or (p_lead_assigned_to is null and p_lead_assigned_user_id is null)
        or p_lead_assigned_to in (select id from equipe)
        or p_lead_assigned_user_id in (select id from equipe)
      )
  );
$$;

comment on function private.ator_alcanca_lead(uuid, uuid, uuid, uuid) is
  'Cerca de leitura de lead com ATOR EXPLÍCITO — gêmeo de private.can_access_lead_row para o caminho service_role, que tem BYPASSRLS e por isso nunca é protegido por RLS. Ator nulo devolve false. Régua idêntica à de lib/crm/escopo-de-leitura.ts; a igualdade é cobrada por tests/contracts/grafo-de-receita.test.mjs.';

revoke all on function private.ator_alcanca_lead(uuid, uuid, uuid, uuid) from public;
revoke all on function private.ator_alcanca_lead(uuid, uuid, uuid, uuid) from anon;
revoke all on function private.ator_alcanca_lead(uuid, uuid, uuid, uuid) from authenticated;
grant execute on function private.ator_alcanca_lead(uuid, uuid, uuid, uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) OS NÓS — demanda e oferta, com a completude à mostra
-- ─────────────────────────────────────────────────────────────────────────────
-- `security_invoker = true` em todas: a view respeita a RLS de QUEM CONSULTA.
-- Sem isso ela roda como o dono e vira porta lateral por cima de
-- `leads_org_fence`.

-- O nó de DEMANDA. Uma linha por lead, com as arestas que ela tem e as chaves de
-- casamento que ela possui. `chaves_declaradas` é o que separa "não combina" de
-- "não sabemos" — a distinção que `compatibilidade-imovel.ts` chama de
-- falta_cliente.
create or replace view public.vw_grafo_demanda
with (security_invoker = true) as
select
  l.id as lead_id,
  l.organization_id,
  l.name as nome,
  l.status,
  coalesce(l.assigned_to, l.assigned_user_id) as corretor_id,
  l.development_id,
  l.campaign_id,
  nullif(btrim(coalesce(l.campaign, '')), '') as campanha_texto,
  coalesce(l.source_normalized, l.source) as fonte,
  l.budget_min,
  l.budget_max,
  l.preferred_bedrooms,
  l.preferred_neighborhoods,
  l.first_contacted_at,
  l.last_interaction_at,
  l.created_at,
  l.sale_value_brl,
  -- Interesse REVELADO: pendurada no empreendimento, ou tocada por um anúncio
  -- daquele empreendimento. É proxy, e viaja rotulado como proxy.
  (l.development_id is not null
    or exists (
      select 1 from public.lead_attribution_touches t
      where t.lead_id = l.id and t.development_id is not null
    )) as tem_interesse_revelado,
  -- Quantas das 3 chaves declaradas de casamento a pessoa nos deu.
  (case when l.budget_min is not null or l.budget_max is not null then 1 else 0 end
   + case when l.preferred_bedrooms is not null then 1 else 0 end
   + case when coalesce(array_length(l.preferred_neighborhoods, 1), 0) > 0 then 1 else 0 end
  )::smallint as chaves_declaradas,
  (select count(*) from public.lead_events e where e.lead_id = l.id) as interacoes,
  (select count(*) from public.lead_visits v where v.lead_id = l.id) as visitas,
  (select count(*) from public.opportunities o where o.lead_id = l.id) as propostas,
  (select c.outcome from public.conversion_outcome_labels c where c.lead_id = l.id
    order by c.created_at desc nulls last limit 1) as desfecho
from public.leads l;

comment on view public.vw_grafo_demanda is
  'Nó de DEMANDA do grafo de receita: uma linha por lead com suas arestas e a contagem de chaves declaradas. security_invoker=true — respeita a RLS de quem consulta. Não pontua nada: pontuação é de lib/crm/compatibilidade-imovel.ts.';

-- O nó de OFERTA. Uma linha por empreendimento. `unidades_disponiveis` vem de
-- `development_typologies.units_available` e hoje é NULO nas 6 linhas — soma de
-- nulos é 0, e 0 aqui significaria "esgotado". Por isso a soma preserva o nulo.
create or replace view public.vw_grafo_oferta
with (security_invoker = true) as
select
  d.id as development_id,
  d.organization_id,
  d.name as nome,
  d.neighborhood as bairro,
  d.city as cidade,
  d.price_min,
  d.price_max,
  d.bedrooms_min,
  d.bedrooms_max,
  d.sales_cycle_status,
  d.status,
  (select count(*) from public.development_typologies t where t.development_id = d.id) as tipologias,
  (select sum(t.units_available) from public.development_typologies t where t.development_id = d.id) as unidades_disponiveis,
  (select count(*) from public.leads l where l.development_id = d.id) as leads_vinculadas,
  (select count(distinct t.lead_id) from public.lead_attribution_touches t where t.development_id = d.id) as leads_tocadas,
  -- Quantas das 3 chaves de casamento o CADASTRO nos deu. Espelha
  -- `chaves_declaradas` do outro lado: a lacuna tem dono, e este é o da operação.
  (case when d.price_min is not null or d.price_max is not null then 1 else 0 end
   + case when d.bedrooms_min is not null or d.bedrooms_max is not null then 1 else 0 end
   + case when d.neighborhood is not null then 1 else 0 end
  )::smallint as chaves_cadastradas
from public.developments d;

comment on view public.vw_grafo_oferta is
  'Nó de OFERTA do grafo de receita: uma linha por empreendimento com estoque e completude de cadastro. unidades_disponiveis preserva NULL de propósito — 0 significaria esgotado, e o que existe hoje é ausência de cadastro.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) O CENSO DAS ARESTAS — a medição que se refaz sozinha
-- ─────────────────────────────────────────────────────────────────────────────
-- Existe porque um número copiado para dentro de um documento envelhece em
-- silêncio. Aqui a topologia do grafo é uma CONSULTA: o dono reexecuta e vê o
-- estado de hoje, não o de 30/07.
--
-- `cobertura` = arestas / nós de origem possíveis. Fica NULA quando não há nó de
-- origem — 0/0 não é 0%.
-- `drop view` antes de recriar: o censo mudou de FORMA (ganhou `cardinalidade`
-- entre `destino` e `arestas`), e `create or replace view` recusa mudança de
-- posição/nome de coluna com "cannot change name of view column".
drop view if exists public.vw_grafo_censo_de_arestas;

create view public.vw_grafo_censo_de_arestas
with (security_invoker = true) as
with m as (
  select
    o.id as organization_id,
    (select count(*) from public.leads l where l.organization_id = o.id) as leads,
    (select count(*) from public.developments d where d.organization_id = o.id) as devs,
    (select count(*) from public.development_typologies t where t.organization_id = o.id) as tipologias,
    (select count(*) from public.leads l where l.organization_id = o.id and l.development_id is not null) as lead_dev,
    (select count(*) from public.leads l where l.organization_id = o.id
       and coalesce(l.assigned_to, l.assigned_user_id) is not null) as lead_corretor,
    (select count(*) from public.leads l where l.organization_id = o.id and l.campaign_id is not null) as lead_campanha_fk,
    (select count(*) from public.leads l where l.organization_id = o.id
       and nullif(btrim(coalesce(l.campaign, '')), '') is not null) as lead_campanha_txt,
    (select count(*) from public.leads l where l.organization_id = o.id
       and coalesce(array_length(l.preferred_neighborhoods, 1), 0) > 0) as lead_bairro,
    (select count(*) from public.leads l where l.organization_id = o.id
       and (l.budget_min is not null or l.budget_max is not null)) as lead_orcamento,
    (select count(*) from public.leads l where l.organization_id = o.id and l.preferred_bedrooms is not null) as lead_quartos,
    (select count(*) from public.leads l where l.organization_id = o.id and l.sale_value_brl is not null) as lead_venda_valor,
    -- DISTINCT lead, não toques: `lead_para_anuncio` é cobertura de LEAD. Contar
    -- toques aqui daria 47 "arestas" sobre 482 leads misturando as duas unidades.
    (select count(distinct t.lead_id) from public.lead_attribution_touches t
       where t.organization_id = o.id and t.ad_external_id is not null) as lead_anuncio,
    (select count(*) from public.developments d where d.organization_id = o.id and d.neighborhood is not null) as dev_bairro,
    (select count(*) from public.developments d where d.organization_id = o.id
       and (d.price_min is not null or d.price_max is not null)) as dev_preco,
    (select count(*) from public.development_typologies t where t.organization_id = o.id and t.price_from is not null) as tip_preco,
    (select count(*) from public.lead_attribution_touches t where t.organization_id = o.id) as toques,
    (select count(*) from public.lead_attribution_touches t where t.organization_id = o.id and t.development_id is not null) as toque_dev,
    (select count(*) from public.lead_events e where e.organization_id = o.id) as interacoes,
    (select count(*) from public.pipeline_stage_moves s where s.organization_id = o.id) as etapas,
    (select count(*) from public.lead_visits v where v.organization_id = o.id) as visitas,
    (select count(*) from public.opportunities p where p.organization_id = o.id) as propostas,
    (select count(*) from public.customers c where c.organization_id = o.id) as clientes,
    (select count(*) from public.conversion_outcome_labels c where c.organization_id = o.id) as desfechos,
    (select count(*) from public.conversion_outcome_labels c where c.organization_id = o.id and c.outcome = 'won') as ganhos,
    (select count(*) from public.external_sales_records x where x.organization_id = o.id) as vendas_externas,
    (select count(*) from public.inventory_units u where u.organization_id = o.id)
      + (select count(*) from public.units u where u.organization_id = o.id)
      + (select count(*) from public.properties p where p.organization_id = o.id) as unidades
  from public.organizations o
)
select m.organization_id, e.aresta, e.origem, e.destino, e.cardinalidade, e.arestas, e.nos_de_origem,
  round(e.arestas::numeric / nullif(e.nos_de_origem, 0), 4) as arestas_por_no,
  -- ⚠ `cobertura` SÓ para aresta de cardinalidade `uma_por_no`.
  --
  -- A primeira versão desta view calculava cobertura para todas e devolvia
  -- `empreendimento_para_toque = 140,25` — 561 toques sobre 4 empreendimentos.
  -- Lido como cobertura, "14025%" é absurdo visível; lido rápido num painel,
  -- "140%" passa por "ótimo". Razão de multigrafo não é fração de nós cobertos,
  -- e as duas coisas em uma coluna só é como se inventa saúde de dado.
  case when e.cardinalidade = 'uma_por_no' and e.nos_de_origem > 0
       then round(e.arestas::numeric / e.nos_de_origem, 4) end as cobertura
from m
cross join lateral (values
  -- No máximo UMA aresta por nó de origem: aqui cobertura é fração de nós.
  ('lead_para_empreendimento', 'lead', 'imovel', 'uma_por_no', m.lead_dev, m.leads),
  ('lead_para_corretor', 'lead', 'corretor', 'uma_por_no', m.lead_corretor, m.leads),
  ('lead_para_campanha_fk', 'lead', 'campanha', 'uma_por_no', m.lead_campanha_fk, m.leads),
  ('lead_para_campanha_texto', 'lead', 'campanha', 'uma_por_no', m.lead_campanha_txt, m.leads),
  ('lead_para_anuncio', 'lead', 'anuncio', 'uma_por_no', m.lead_anuncio, m.leads),
  ('lead_para_bairro', 'lead', 'bairro', 'uma_por_no', m.lead_bairro, m.leads),
  ('lead_para_orcamento', 'lead', 'interesse', 'uma_por_no', m.lead_orcamento, m.leads),
  ('lead_para_quartos', 'lead', 'interesse', 'uma_por_no', m.lead_quartos, m.leads),
  ('lead_para_valor_apurado', 'lead', 'venda', 'uma_por_no', m.lead_venda_valor, m.leads),
  ('empreendimento_para_bairro', 'imovel', 'bairro', 'uma_por_no', m.dev_bairro, m.devs),
  ('empreendimento_para_preco', 'imovel', 'interesse', 'uma_por_no', m.dev_preco, m.devs),
  ('tipologia_para_preco', 'imovel', 'interesse', 'uma_por_no', m.tip_preco, m.tipologias),
  -- MUITAS arestas por nó: só `arestas_por_no`, nunca cobertura.
  ('lead_para_toque', 'lead', 'interacao', 'muitas_por_no', m.toques, m.leads),
  ('lead_para_interacao', 'lead', 'interacao', 'muitas_por_no', m.interacoes, m.leads),
  ('lead_para_etapa', 'lead', 'interacao', 'muitas_por_no', m.etapas, m.leads),
  ('lead_para_visita', 'lead', 'visita', 'muitas_por_no', m.visitas, m.leads),
  ('lead_para_proposta', 'lead', 'proposta', 'muitas_por_no', m.propostas, m.leads),
  ('lead_para_cliente', 'lead', 'cliente', 'muitas_por_no', m.clientes, m.leads),
  ('lead_para_desfecho', 'lead', 'venda', 'muitas_por_no', m.desfechos, m.leads),
  ('lead_para_venda_ganha', 'lead', 'venda', 'muitas_por_no', m.ganhos, m.leads),
  ('lead_para_venda_externa', 'lead', 'venda', 'muitas_por_no', m.vendas_externas, m.leads),
  ('empreendimento_para_tipologia', 'imovel', 'imovel', 'muitas_por_no', m.tipologias, m.devs),
  ('empreendimento_para_toque', 'imovel', 'interacao', 'muitas_por_no', m.toque_dev, m.devs),
  ('empreendimento_para_unidade', 'imovel', 'unidade', 'muitas_por_no', m.unidades, m.devs)
) as e(aresta, origem, destino, cardinalidade, arestas, nos_de_origem);

comment on view public.vw_grafo_censo_de_arestas is
  'CENSO do grafo de receita: 24 arestas com contagem, por organização. Existe para a topologia ser uma consulta reexecutável em vez de um número copiado num documento. `cobertura` só é preenchida para aresta de cardinalidade uma_por_no — em muitas_por_no ela passaria de 100%. NULA quando não há nó de origem: 0/0 não é 0%.';

revoke all on public.vw_grafo_demanda from anon;
revoke all on public.vw_grafo_oferta from anon;
revoke all on public.vw_grafo_censo_de_arestas from anon;
grant select on public.vw_grafo_demanda to authenticated, service_role;
grant select on public.vw_grafo_oferta to authenticated, service_role;
grant select on public.vw_grafo_censo_de_arestas to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) AS PERGUNTAS DO DONO, UMA FUNÇÃO CADA
-- ─────────────────────────────────────────────────────────────────────────────
-- "traverse the graph" não é entregável. Cada função abaixo responde uma
-- pergunta que o dono escreveu, devolve a BASE DA EVIDÊNCIA de cada linha, e
-- devolve o DENOMINADOR (`leads_na_base` / `desfechos_na_base`) para o chamador
-- nunca receber um número sem saber de quantos ele saiu.

-- ── 4.1 "encontrar clientes compatíveis com novo estoque" ───────────────────
--
-- Pelo interesse REVELADO, que é onde há dado: leads penduradas neste
-- empreendimento, em empreendimento do MESMO BAIRRO, ou (recorte grosso, e
-- rotulado como grosso) da mesma cidade.
--
-- `ja_vinculado` entra na lista de propósito. Excluir quem já está no
-- empreendimento devolveria lista vazia para empreendimento estabelecido, sem
-- erro nenhum — o defeito "dono da conta viu zero leads e nada avisou" que já
-- aconteceu neste repositório. Lista vazia tem de significar ausência, não
-- filtro.
create or replace function public.grafo_clientes_para_empreendimento(
  p_development_id uuid,
  p_ator_id uuid,
  p_limite integer default 50
) returns table (
  lead_id uuid,
  nome text,
  status text,
  corretor_id uuid,
  base_da_evidencia text,
  forca smallint,
  chaves_declaradas smallint,
  leads_na_base bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with alvo as (
    select d.id, d.organization_id, d.neighborhood, d.city
    from public.developments d where d.id = p_development_id
  ),
  -- Empreendimentos comparáveis. BAIRRO, e só bairro.
  --
  -- ⚠ `mesma_cidade` foi REMOVIDO daqui depois que o contrato o pegou. A versão
  -- anterior tinha um terceiro braço com força 1 casando por cidade — e o teste
  -- sintético mostrou uma lead interessada em OUTRO BAIRRO voltando como
  -- "compatível". Medido na base real: os 4 empreendimentos estão todos em São
  -- Paulo, logo `mesma_cidade` devolveria as 482 leads da organização como
  -- candidatas a qualquer lançamento. Isso não é compatibilidade, é a lista de
  -- todo mundo com um rótulo bonito — o mesmo defeito que
  -- `compatibilidade-imovel.ts` chama de "ignorância bem apresentada".
  --
  -- A consequência é aceita de propósito: para bairro sem par comparável a
  -- função devolve pouco ou nada. Vazio por AUSÊNCIA é resposta (e
  -- `leads_na_base = 0` a torna visível); cheio por recorte grosso seria mentira.
  -- `mesma_cidade` continua existindo em `grafo_empreendimentos_substitutos`,
  -- onde o universo são 4 imóveis e o rótulo diz que o corte é grosso.
  comparaveis as (
    select d.id, 'mesmo_bairro'::text as base, 2::smallint as forca
    from public.developments d join alvo a on d.organization_id = a.organization_id
    where d.id <> a.id and a.neighborhood is not null
      and lower(btrim(d.neighborhood)) = lower(btrim(a.neighborhood))
  ),
  candidatas as (
    -- (a) já pendurada no próprio empreendimento
    select l.id, l.name, l.status, coalesce(l.assigned_to, l.assigned_user_id) as corretor,
           l.assigned_to, l.assigned_user_id, l.organization_id,
           'ja_vinculado'::text as base, 3::smallint as forca,
           (case when l.budget_min is not null or l.budget_max is not null then 1 else 0 end
            + case when l.preferred_bedrooms is not null then 1 else 0 end
            + case when coalesce(array_length(l.preferred_neighborhoods, 1), 0) > 0 then 1 else 0 end)::smallint as chaves
    from public.leads l join alvo a on l.organization_id = a.organization_id
    where l.development_id = a.id
    union all
    -- (b) declarou o bairro deste empreendimento — a evidência mais forte que
    --     existe, e a mais rara: 6 leads em 482.
    select l.id, l.name, l.status, coalesce(l.assigned_to, l.assigned_user_id),
           l.assigned_to, l.assigned_user_id, l.organization_id,
           'atributo_declarado'::text, 3::smallint,
           (case when l.budget_min is not null or l.budget_max is not null then 1 else 0 end
            + case when l.preferred_bedrooms is not null then 1 else 0 end
            + case when coalesce(array_length(l.preferred_neighborhoods, 1), 0) > 0 then 1 else 0 end)::smallint
    from public.leads l join alvo a on l.organization_id = a.organization_id
    where a.neighborhood is not null
      and exists (
        select 1 from unnest(l.preferred_neighborhoods) as b(nome)
        where lower(btrim(b.nome)) = lower(btrim(a.neighborhood))
      )
    union all
    -- (c) interesse revelado em empreendimento comparável (vínculo ou toque)
    select l.id, l.name, l.status, coalesce(l.assigned_to, l.assigned_user_id),
           l.assigned_to, l.assigned_user_id, l.organization_id,
           c.base, c.forca,
           (case when l.budget_min is not null or l.budget_max is not null then 1 else 0 end
            + case when l.preferred_bedrooms is not null then 1 else 0 end
            + case when coalesce(array_length(l.preferred_neighborhoods, 1), 0) > 0 then 1 else 0 end)::smallint
    from public.leads l
    join comparaveis c on c.id = l.development_id
    union all
    select l.id, l.name, l.status, coalesce(l.assigned_to, l.assigned_user_id),
           l.assigned_to, l.assigned_user_id, l.organization_id,
           c.base, c.forca,
           (case when l.budget_min is not null or l.budget_max is not null then 1 else 0 end
            + case when l.preferred_bedrooms is not null then 1 else 0 end
            + case when coalesce(array_length(l.preferred_neighborhoods, 1), 0) > 0 then 1 else 0 end)::smallint
    from public.leads l
    join public.lead_attribution_touches t on t.lead_id = l.id
    join comparaveis c on c.id = t.development_id
    where l.development_id is distinct from t.development_id
  ),
  -- A cerca, e a única vez que ela é aplicada: uma lead pode ter entrado por
  -- mais de um caminho acima, e todos os caminhos passam por aqui.
  permitidas as (
    select distinct on (id) id, name, status, corretor, base, forca, chaves
    from candidatas
    where private.ator_alcanca_lead(p_ator_id, organization_id, assigned_to, assigned_user_id)
      -- Etapa terminal não é candidata a estoque novo: quem já comprou, ou
      -- comprou fora, não é oportunidade — é histórico.
      and coalesce(status, '') not in ('ganho', 'comprou_outro')
    order by id, forca desc, base
  )
  select p.id, p.name, p.status, p.corretor, p.base, p.forca, p.chaves,
    (select count(*) from permitidas) as leads_na_base
  from permitidas p
  order by p.forca desc, p.chaves desc, p.name nulls last
  limit greatest(coalesce(p_limite, 50), 1);
$$;

comment on function public.grafo_clientes_para_empreendimento(uuid, uuid, integer) is
  'Pergunta do dono "encontrar clientes compatíveis com novo estoque" — por ARESTA, não por preço (0 de 4 empreendimentos tem preço). SEM recorte mesma_cidade de propósito: os 4 empreendimentos estão todos em São Paulo, então mesma_cidade devolveria as 482 leads como compatíveis. base_da_evidencia distingue atributo declarado de interesse revelado (proxy). Cerca por ator aplicada uma vez, depois da união dos caminhos.';

-- ── 4.2 "imóveis substitutos" ───────────────────────────────────────────────
--
-- Substituto por CO-INTERESSE (a mesma pessoa se interessou pelos dois) é a
-- única definição que não exige preço. Medido: 1 lead da base tem toque em 2+
-- empreendimentos — a aresta existe e é quase vazia, e a função diz isso pelo
-- `leads_em_co_interesse` em vez de devolver lista bonita.
create or replace function public.grafo_empreendimentos_substitutos(
  p_development_id uuid
) returns table (
  development_id uuid,
  nome text,
  base_da_evidencia text,
  forca smallint,
  leads_em_co_interesse bigint,
  pares_na_base bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with alvo as (
    -- Sem `bedrooms_min/max`: a primeira versão os selecionava e NUNCA os usava.
    -- Coluna morta num CTE não custa consulta, custa leitura — quem vier depois
    -- procura onde o dormitório entra no casamento, e ele não entra (2 de 4
    -- empreendimentos têm faixa; casar por isso seria falar da metade do acervo).
    select d.id, d.organization_id, d.neighborhood, d.city
    from public.developments d where d.id = p_development_id
  ),
  -- Quem tocou o alvo tocou o quê mais?
  co as (
    select t2.development_id as id, count(distinct t1.lead_id) as leads
    from public.lead_attribution_touches t1
    join public.lead_attribution_touches t2 on t2.lead_id = t1.lead_id
    join alvo a on t1.development_id = a.id
    where t2.development_id is not null and t2.development_id <> a.id
    group by t2.development_id
  ),
  pares as (
    select d.id, d.name, 'co_interesse'::text as base, 2::smallint as forca, co.leads
    from co join public.developments d on d.id = co.id
    union all
    select d.id, d.name, 'mesmo_bairro'::text, 2::smallint, 0::bigint
    from public.developments d join alvo a on d.organization_id = a.organization_id
    where d.id <> a.id and a.neighborhood is not null
      and lower(btrim(d.neighborhood)) = lower(btrim(a.neighborhood))
    union all
    select d.id, d.name, 'mesma_cidade'::text, 1::smallint, 0::bigint
    from public.developments d join alvo a on d.organization_id = a.organization_id
    where d.id <> a.id and a.city is not null
      and lower(btrim(d.city)) = lower(btrim(a.city))
  ),
  melhores as (
    select distinct on (id) id, name, base, forca, leads
    from pares order by id, forca desc, leads desc, base
  )
  select m.id, m.name, m.base, m.forca, m.leads,
    (select count(*) from melhores) as pares_na_base
  from melhores m
  order by m.forca desc, m.leads desc, m.name nulls last;
$$;

comment on function public.grafo_empreendimentos_substitutos(uuid) is
  'Pergunta do dono "imóveis substitutos". Sem preço nos dois lados, a única definição honesta é co-interesse (a mesma pessoa tocou os dois) e vizinhança de bairro. pares_na_base expõe quando a resposta é vazia por ausência de acervo comparável.';

-- ── 4.3 "leads semelhantes" ─────────────────────────────────────────────────
--
-- Semelhança por ARESTA COMPARTILHADA — empreendimento, fonte, campanha, bairro
-- declarado. É a pergunta com mais dado desta frente: 192 leads penduradas em
-- empreendimento e 8 fontes distintas.
create or replace function public.grafo_leads_semelhantes(
  p_lead_id uuid,
  p_ator_id uuid,
  p_limite integer default 20
) returns table (
  lead_id uuid,
  nome text,
  status text,
  corretor_id uuid,
  arestas_em_comum smallint,
  bases text[],
  desfecho text,
  leads_na_base bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with semente as (
    select l.* from public.leads l
    where l.id = p_lead_id
      and private.ator_alcanca_lead(p_ator_id, l.organization_id, l.assigned_to, l.assigned_user_id)
  ),
  vizinhas as (
    select l.id, l.name, l.status, coalesce(l.assigned_to, l.assigned_user_id) as corretor,
      (case when s.development_id is not null and l.development_id = s.development_id then 1 else 0 end
       + case when coalesce(s.source_normalized, s.source) is not null
                   and coalesce(l.source_normalized, l.source) = coalesce(s.source_normalized, s.source)
              then 1 else 0 end
       + case when nullif(btrim(coalesce(s.campaign, '')), '') is not null
                   and lower(btrim(coalesce(l.campaign, ''))) = lower(btrim(coalesce(s.campaign, '')))
              then 1 else 0 end
       + case when coalesce(array_length(s.preferred_neighborhoods, 1), 0) > 0
                   and l.preferred_neighborhoods && s.preferred_neighborhoods
              then 1 else 0 end
      )::smallint as arestas,
      array_remove(array[
        case when s.development_id is not null and l.development_id = s.development_id then 'mesmo_empreendimento' end,
        case when coalesce(s.source_normalized, s.source) is not null
                  and coalesce(l.source_normalized, l.source) = coalesce(s.source_normalized, s.source)
             then 'mesma_fonte' end,
        case when nullif(btrim(coalesce(s.campaign, '')), '') is not null
                  and lower(btrim(coalesce(l.campaign, ''))) = lower(btrim(coalesce(s.campaign, '')))
             then 'mesma_campanha' end,
        case when coalesce(array_length(s.preferred_neighborhoods, 1), 0) > 0
                  and l.preferred_neighborhoods && s.preferred_neighborhoods
             then 'mesmo_bairro' end
      ], null) as bases,
      (select c.outcome from public.conversion_outcome_labels c where c.lead_id = l.id
        order by c.created_at desc nulls last limit 1) as desfecho
    from public.leads l
    cross join semente s
    where l.id <> s.id
      and l.organization_id = s.organization_id
      and private.ator_alcanca_lead(p_ator_id, l.organization_id, l.assigned_to, l.assigned_user_id)
  ),
  comuns as (select * from vizinhas where arestas > 0)
  select c.id, c.name, c.status, c.corretor, c.arestas, c.bases, c.desfecho,
    (select count(*) from comuns) as leads_na_base
  from comuns c
  order by c.arestas desc, c.name nulls last
  limit greatest(coalesce(p_limite, 20), 1);
$$;

comment on function public.grafo_leads_semelhantes(uuid, uuid, integer) is
  'Pergunta do dono "leads semelhantes" — por aresta compartilhada (empreendimento, fonte, campanha, bairro). Semente inalcançável pelo ator devolve ZERO linhas: a cerca vale para os dois lados do par.';

-- ── 4.4 "corretor mais adequado" ────────────────────────────────────────────
--
-- ⚠ A FUNÇÃO MAIS PERIGOSA DESTE ARQUIVO, e a ordenação é o motivo.
--
-- Ordenar por taxa de conversão elegeria o corretor com 1 desfecho e 1 acerto —
-- 100%. Medido: há 2 vitórias rotuladas em toda a base, e os 88 rótulos estão em
-- 2 corretores. Por isso a ordem é `desfechos_na_base desc` PRIMEIRO: quem tem
-- mais base aparece antes, e `taxa_de_ganho` é NULA (não 0) quando não há
-- desfecho — 0% leria como incompetência onde houve ausência de rótulo.
create or replace function public.grafo_aptidao_do_corretor(
  p_organization_id uuid,
  p_development_id uuid default null
) returns table (
  corretor_id uuid,
  nome text,
  leads_na_carteira bigint,
  desfechos_na_base bigint,
  ganhos bigint,
  perdas bigint,
  taxa_de_ganho numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    coalesce(p.full_name, p.name),
    count(l.id) as leads_na_carteira,
    count(c.id) as desfechos_na_base,
    count(*) filter (where c.outcome = 'won') as ganhos,
    count(*) filter (where c.outcome in ('lost', 'external_purchase')) as perdas,
    -- nullif: sem desfecho a taxa é DESCONHECIDA, não zero.
    round(count(*) filter (where c.outcome = 'won')::numeric / nullif(count(c.id), 0), 4) as taxa_de_ganho
  from public.profiles p
  left join public.leads l
    on coalesce(l.assigned_to, l.assigned_user_id) = p.id
   and l.organization_id = p_organization_id
   and (p_development_id is null or l.development_id = p_development_id)
  left join public.conversion_outcome_labels c on c.lead_id = l.id
  where p.organization_id = p_organization_id and p.active = true
  group by p.id, coalesce(p.full_name, p.name)
  order by desfechos_na_base desc, ganhos desc, leads_na_carteira desc, 2 nulls last;
$$;

comment on function public.grafo_aptidao_do_corretor(uuid, uuid) is
  'Pergunta do dono "corretor mais adequado". Ordena por desfechos_na_base ANTES de qualquer taxa, de propósito: com 2 vitórias na base inteira, ordenar por taxa elegeria quem teve 1 desfecho e acertou. taxa_de_ganho é NULA sem desfecho — 0% seria acusação.';

-- ── 4.5 "campanha com melhor desempenho por perfil" ─────────────────────────
--
-- Agrupa por campanha E por fonte, porque `campaign_id` alcança 24 leads em 482
-- enquanto o TEXTO `campaign` alcança 212. A FK é a chave certa e a menos
-- preenchida; devolver as duas mostra o tamanho do buraco.
create or replace function public.grafo_desempenho_de_campanha(
  p_organization_id uuid
) returns table (
  campanha_id uuid,
  campanha text,
  fonte text,
  leads bigint,
  desfechos_na_base bigint,
  ganhos bigint,
  perdas bigint,
  taxa_de_ganho numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.campaign_id,
    nullif(btrim(coalesce(l.campaign, '')), ''),
    coalesce(l.source_normalized, l.source),
    count(distinct l.id) as leads,
    count(c.id) as desfechos_na_base,
    count(*) filter (where c.outcome = 'won') as ganhos,
    count(*) filter (where c.outcome in ('lost', 'external_purchase')) as perdas,
    round(count(*) filter (where c.outcome = 'won')::numeric / nullif(count(c.id), 0), 4) as taxa_de_ganho
  from public.leads l
  left join public.conversion_outcome_labels c on c.lead_id = l.id
  where l.organization_id = p_organization_id
  group by l.campaign_id, nullif(btrim(coalesce(l.campaign, '')), ''), coalesce(l.source_normalized, l.source)
  order by desfechos_na_base desc, leads desc, 3 nulls last;
$$;

comment on function public.grafo_desempenho_de_campanha(uuid) is
  'Pergunta do dono "campanha com melhor desempenho por perfil". Mesma disciplina de ordenação da aptidão do corretor: base antes de taxa. Devolve campaign_id E o texto porque a FK cobre 24 leads e o texto 212.';

-- ── 4.6 "oportunidades de recuperação" ──────────────────────────────────────
--
-- ⚠ CONSENTIMENTO: esta função NÃO decide se pode contatar. Ela devolve as duas
-- coisas que existem, sem misturá-las:
--
--   `base_legal_da_fonte`  — `meta_lead_sources.consent_basis`, o consentimento
--                            do FORMULÁRIO por onde a lead entrou;
--   `preferencia_da_pessoa` — `lead_contact_preferences.consent_status`, o que a
--                            PESSOA disse. Medido: 0 linhas na base inteira.
--
-- Somar as duas numa coluna "pode_contatar" seria inventar consentimento de
-- pessoa a partir de consentimento de formulário. A régua de reativação
-- consentida é de quem já a tem; aqui só se ENTREGA o insumo.
create or replace function public.grafo_oportunidades_de_recuperacao(
  p_organization_id uuid,
  p_ator_id uuid,
  p_limite integer default 50
) returns table (
  lead_id uuid,
  nome text,
  status text,
  corretor_id uuid,
  motivo text,
  dias_parada integer,
  desfecho text,
  base_legal_da_fonte text,
  preferencia_da_pessoa text,
  leads_na_base bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with recuperaveis as (
    select
      l.id, l.name, l.status, coalesce(l.assigned_to, l.assigned_user_id) as corretor,
      case
        when coalesce(l.status, '') in ('perdido', 'comprou_outro') then 'etapa_terminal'
        when l.first_contacted_at is null then 'nunca_contatada'
        else 'parada'
      end as motivo,
      (extract(day from now() - coalesce(l.last_interaction_at, l.updated_at, l.created_at)))::integer as dias,
      (select c.outcome from public.conversion_outcome_labels c where c.lead_id = l.id
        order by c.created_at desc nulls last limit 1) as desfecho,
      -- O caminho REAL até a base legal, e ele é uma aresta do grafo:
      -- lead → toque de atribuição → formulário → fonte cadastrada.
      -- `meta_lead_sources` não tem coluna de nome de formulário (só `name`,
      -- `form_id`, `page_id`), então casar por texto do `campaign` seria
      -- adivinhação. Casa-se por `form_id`, que é a chave que a Meta manda.
      (select s.consent_basis
        from public.lead_attribution_touches t
        join public.meta_lead_sources s
          on s.organization_id = l.organization_id
         and s.form_id = t.form_external_id
        where t.lead_id = l.id and t.form_external_id is not null
        order by t.occurred_at desc nulls last
        limit 1) as base_fonte,
      (select pr.consent_status from public.lead_contact_preferences pr where pr.lead_id = l.id limit 1) as pref
    from public.leads l
    where l.organization_id = p_organization_id
      and coalesce(l.status, '') <> 'ganho'
      and private.ator_alcanca_lead(p_ator_id, l.organization_id, l.assigned_to, l.assigned_user_id)
      and (
        coalesce(l.status, '') in ('perdido', 'comprou_outro')
        or l.first_contacted_at is null
      )
  )
  select r.id, r.name, r.status, r.corretor, r.motivo, r.dias, r.desfecho, r.base_fonte, r.pref,
    (select count(*) from recuperaveis) as leads_na_base
  from recuperaveis r
  order by r.dias desc nulls last, r.name nulls last
  limit greatest(coalesce(p_limite, 50), 1);
$$;

comment on function public.grafo_oportunidades_de_recuperacao(uuid, uuid, integer) is
  'Pergunta do dono "oportunidades de recuperação". Devolve base_legal_da_fonte e preferencia_da_pessoa em colunas SEPARADAS e nunca uma coluna pode_contatar: consentimento de formulário não é consentimento de pessoa. lead_contact_preferences tem 0 linhas hoje.';

-- ── 4.7 "relações entre demanda e oferta" ───────────────────────────────────
--
-- Por bairro, os dois lados. `demanda_declarada` é quem DISSE o bairro (6 leads
-- em 482); `demanda_revelada` é quem se pendurou num empreendimento daquele
-- bairro (192). A diferença entre as duas colunas É o diagnóstico.
create or replace function public.grafo_demanda_x_oferta(
  p_organization_id uuid
) returns table (
  bairro text,
  demanda_declarada bigint,
  demanda_revelada bigint,
  empreendimentos bigint,
  tipologias bigint,
  unidades_disponiveis bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with declarada as (
    select lower(btrim(b.nome)) as bairro, count(distinct l.id) as leads
    from public.leads l
    cross join lateral unnest(coalesce(l.preferred_neighborhoods, array[]::text[])) as b(nome)
    where l.organization_id = p_organization_id and nullif(btrim(b.nome), '') is not null
    group by 1
  ),
  revelada as (
    select lower(btrim(d.neighborhood)) as bairro, count(distinct l.id) as leads
    from public.leads l
    join public.developments d on d.id = l.development_id
    where l.organization_id = p_organization_id and d.neighborhood is not null
    group by 1
  ),
  -- Agregado por JOIN, não por subconsulta correlacionada: a primeira versão
  -- tentava `(select ... where lower(btrim(d2.neighborhood)) = lower(btrim(
  -- d.neighborhood)))` e o Postgres recusou com "subquery uses ungrouped column
  -- d.neighborhood" — o grupo é a EXPRESSÃO normalizada, não a coluna crua.
  -- `sum(t.units_available)` preserva NULL quando nenhuma tipologia declarou
  -- estoque, que é o estado de hoje nas 6 linhas.
  oferta as (
    select lower(btrim(d.neighborhood)) as bairro,
      count(distinct d.id) as devs,
      count(t.id) as tips,
      sum(t.units_available) as unid
    from public.developments d
    left join public.development_typologies t on t.development_id = d.id
    where d.organization_id = p_organization_id and d.neighborhood is not null
    group by 1
  ),
  bairros as (
    select bairro from declarada union select bairro from revelada union select bairro from oferta
  )
  -- Alias `ofr`, não `of`: `OF` é palavra reservada do Postgres (`for update of`).
  select b.bairro,
    coalesce(dc.leads, 0), coalesce(rv.leads, 0),
    coalesce(ofr.devs, 0), coalesce(ofr.tips, 0),
    ofr.unid
  from bairros b
  left join declarada dc on dc.bairro = b.bairro
  left join revelada rv on rv.bairro = b.bairro
  left join oferta ofr on ofr.bairro = b.bairro
  order by coalesce(rv.leads, 0) + coalesce(dc.leads, 0) desc, b.bairro;
$$;

comment on function public.grafo_demanda_x_oferta(uuid) is
  'Pergunta do dono "relações entre demanda e oferta", por bairro. demanda_declarada (quem disse) e demanda_revelada (quem se pendurou) ficam em colunas separadas — somá-las esconderia que a declarada cobre 6 leads em 482. unidades_disponiveis preserva NULL.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) O CENSO DE PRONTIDÃO — quantas das 7 perguntas têm dado HOJE
-- ─────────────────────────────────────────────────────────────────────────────
-- Devolve MEDIDAS, nunca veredicto. Os nomes das medidas são os mesmos de
-- `exige.medida` em `lib/crm/grafo-de-receita.ts`, e é `avaliarProntidao` lá quem
-- compara com os limiares — uma vez, para todo mundo.
create or replace function public.grafo_censo_de_prontidao(
  p_organization_id uuid
) returns table (medida text, valor numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with l as (select * from public.leads where organization_id = p_organization_id),
  d as (select * from public.developments where organization_id = p_organization_id),
  c as (select cl.* from public.conversion_outcome_labels cl
        where cl.lead_id in (select l.id from l)),
  totais as (select (select count(*) from l) as leads),
  -- A DISTRIBUIÇÃO de desfechos por grupo, não a contagem de grupos que passam de
  -- um limiar. É de propósito: assim o limiar mora SÓ no TypeScript e o SQL fica
  -- sem cópia da regra.
  por_corretor as (
    select count(*) as n from c join l on l.id = c.lead_id
    where coalesce(l.assigned_to, l.assigned_user_id) is not null
    group by coalesce(l.assigned_to, l.assigned_user_id)
  ),
  por_campanha as (
    select count(*) as n from c join l on l.id = c.lead_id
    where l.campaign_id is not null or nullif(btrim(coalesce(l.campaign, '')), '') is not null
    group by coalesce(l.campaign_id::text, nullif(btrim(coalesce(l.campaign, '')), ''))
  )
  select * from (values
    ('leads_na_organizacao', (select leads from totais)::numeric),
    -- Fração de 0 a 1, como o limiar de cobertura espera. NULA sem lead: 0/0
    -- não é 0%.
    ('lead_interesse_revelado',
      case when (select leads from totais) > 0 then
        (select count(*) from l where l.development_id is not null
           or exists (select 1 from public.lead_attribution_touches t
                      where t.lead_id = l.id and t.development_id is not null))::numeric
        / (select leads from totais)
      end),
    ('lead_bairro_declarado',
      case when (select leads from totais) > 0 then
        (select count(*) from l where coalesce(array_length(l.preferred_neighborhoods, 1), 0) > 0)::numeric
        / (select leads from totais)
      end),
    ('pares_de_oferta_comparaveis',
      (select count(*) from d a join d b on a.id < b.id
        where (a.neighborhood is not null
               and lower(btrim(a.neighborhood)) = lower(btrim(b.neighborhood)))
           or (a.price_min is not null and b.price_min is not null))::numeric),
    ('leads_com_co_interesse',
      (select count(*) from (
        select t.lead_id from public.lead_attribution_touches t
        where t.development_id is not null and t.lead_id in (select l.id from l)
        group by t.lead_id having count(distinct t.development_id) > 1
      ) x)::numeric),
    ('desfechos_por_corretor_maximo', coalesce((select max(n) from por_corretor), 0)::numeric),
    -- ⚠ O SEGUNDO maior é a medida que importa para RANQUEAR, e existe porque o
    -- máximo sozinho engana: 87 desfechos parecem base sólida até se ver que são
    -- todos de um corretor e o segundo tem 1. Comparar dois grupos exige que o
    -- segundo também tenha base.
    ('desfechos_por_corretor_2o_maior',
      coalesce((select n from por_corretor order by n desc offset 1 limit 1), 0)::numeric),
    ('corretores_com_desfecho', (select count(*) from por_corretor)::numeric),
    ('desfechos_por_campanha_2o_maior',
      coalesce((select n from por_campanha order by n desc offset 1 limit 1), 0)::numeric),
    ('campanhas_com_desfecho', (select count(*) from por_campanha)::numeric),
    ('ganhos_rotulados', (select count(*) from c where c.outcome = 'won')::numeric),
    ('leads_recuperaveis',
      (select count(*) from l
        where coalesce(l.status, '') <> 'ganho'
          and (coalesce(l.status, '') in ('perdido', 'comprou_outro') or l.first_contacted_at is null))::numeric),
    -- As três tabelas de unidade MAIS o estoque declarado nas tipologias. Medido:
    -- units 0, inventory_units 0, properties 0, units_available nulo nas 6 —
    -- não existe oferta contável para confrontar com demanda.
    ('unidades_no_acervo',
      ((select count(*) from public.inventory_units u where u.organization_id = p_organization_id)
       + (select count(*) from public.units u where u.organization_id = p_organization_id)
       + (select count(*) from public.properties p where p.organization_id = p_organization_id)
       + coalesce((select sum(t.units_available) from public.development_typologies t
                   where t.organization_id = p_organization_id), 0))::numeric)
  ) as v(medida, valor);
$$;

comment on function public.grafo_censo_de_prontidao(uuid) is
  'MEDE, não julga. Devolve `_2o_maior` em vez de "quantos grupos passam do limiar" DE PROPÓSITO: assim o limiar mora só em lib/crm/grafo-de-receita.ts e o SQL fica sem cópia da regra. Nenhuma coluna `suficiente` aqui — o juiz é um só, e é o TypeScript.';

-- Sem grant a anon/authenticated: o caminho de leitura autenticado são as VIEWS,
-- que passam por RLS. As funções são security definer e atravessam a cerca com
-- ator explícito — dá-las a authenticated permitiria consultar passando o
-- p_ator_id de outra pessoa.
do $do$
declare f text;
begin
  foreach f in array array[
    'public.grafo_clientes_para_empreendimento(uuid, uuid, integer)',
    'public.grafo_empreendimentos_substitutos(uuid)',
    'public.grafo_leads_semelhantes(uuid, uuid, integer)',
    'public.grafo_aptidao_do_corretor(uuid, uuid)',
    'public.grafo_desempenho_de_campanha(uuid)',
    'public.grafo_oportunidades_de_recuperacao(uuid, uuid, integer)',
    'public.grafo_demanda_x_oferta(uuid)',
    'public.grafo_censo_de_prontidao(uuid)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('revoke all on function %s from authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $do$;

commit;
