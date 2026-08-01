-- ORÇAMENTO, AUTONOMIA E MODO SOMBRA DA IA
--
-- ── O que esta migration NÃO faz ─────────────────────────────────────────────
--
-- Não cria tabela de consumo. Ela já existe e já funciona: `ai_usage_events`
-- tinha 43 linhas reais no banco canônico em 2026-07-30, gravadas por
-- `recordUsage()` em lib/ai/provider-router.ts. Criar uma segunda seria a doença
-- de "duas verdades" que este repositório já pagou caro (RPC e fallback que
-- divergiram na chave, mapa de leads que copiou a lista e divergiu).
--
-- ── O que faltava para o teto sair do papel ──────────────────────────────────
--
-- 1. A COLUNA DO AGENTE. `ai_usage_events` tinha `feature`, não `agent`. Sem ela
--    "limite por agente" era incalculável. As 43 linhas existentes recebem o
--    agente derivado de `feature` — "creative-studio.briefing" → "creative-studio".
--
-- 2. A LEITURA DO CONSUMO EM UMA IDA. O limitador roda ANTES de cada chamada de
--    IA; fazer 4 consultas para montar o teto acrescentaria latência no caminho
--    que o corretor está esperando. `public.consumo_de_ia_do_dia` devolve tudo
--    numa chamada.
--
-- 3. O REGISTRO DA SOMBRA. `ai_shadow_decisions` guarda o que a IA FARIA, a
--    decisão humana e o resultado — as três colunas que a comparação de 4.8 exige.
--
-- ── Sobre custo em dólar ─────────────────────────────────────────────────────
--
-- A função soma `estimated_cost_usd` IGNORANDO os nulos e devolve à parte quantas
-- linhas eram cobráveis sem custo medido. Em 2026-07-30 isso eram 6 de 21 (28,6%).
-- Somar nulo como zero faria o teto de dinheiro passar por cima de 28,6% do
-- consumo cobrável afirmando "gastou zero". Preço ausente é preço a confirmar,
-- nunca zero.
--
-- ROLLBACK: supabase/rollbacks/20260730050000_orcamento_e_autonomia_da_ia.down.sql
-- (NUNCA .down.sql dentro de migrations/ — cria versão duplicada e o db push
--  aborta no último arquivo depois de já ter aplicado os anteriores. Medido.)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A DIMENSÃO DO AGENTE
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.ai_usage_events
  add column if not exists agent text;

-- Histórico preenchido a partir de `feature`: o agente é o pedaço antes do
-- primeiro ponto. Sem isto o teto por agente começaria cego para os 4 dias já
-- medidos, e a primeira leitura diria "nenhum consumo" com 43 linhas na mesa.
update public.ai_usage_events
   set agent = split_part(feature, '.', 1)
 where agent is null
   and feature is not null
   and btrim(feature) <> '';

-- Índice pelo que o limitador de fato pergunta: consumo de HOJE, por org, por
-- agente. Sem ele a leitura do teto varre a tabela inteira a cada chamada de IA.
create index if not exists ai_usage_events_org_dia_agente_idx
  on public.ai_usage_events (organization_id, created_at desc, agent);

create index if not exists ai_usage_events_org_dia_usuario_idx
  on public.ai_usage_events (organization_id, created_at desc, user_id);

comment on column public.ai_usage_events.agent is
  'Agente que originou a chamada (catálogo em config/orcamento-e-autonomia-da-ia.json). Sem esta coluna o teto por agente é incalculável. Histórico preenchido de split_part(feature, ''.'', 1).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A LEITURA DO CONSUMO
-- ─────────────────────────────────────────────────────────────────────────────

-- ── POR QUE EM `public`, E NÃO EM `private` ─────────────────────────────────
--
-- A primeira versão desta função nasceu em `private`, seguindo o padrão de
-- `private.can_access_lead_row` e `private.apply_canonical_lead_contract`. Ao
-- EXECUTAR a prova, veio PGRST202 (HTTP 404): PostgREST não expõe o schema
-- `private`, então `.rpc("consumo_de_ia_do_dia")` nunca encontrava a função — e
-- o limitador caía no ramo "consumo não medido" EM SILÊNCIO. O teto existiria,
-- responderia, e sempre veria zero consumo: decorativo.
--
-- A distinção real do repositório não é público/privado por gosto: é QUEM chama.
-- `private.*` é chamado de dentro do SQL (política de RLS, gatilho).
-- O que o APP chama por .rpc() vive em `public` — como `public.move_pipeline_lead`.
-- A proteção vem dos revokes + grant só a service_role, logo abaixo, não do schema.
--
-- Achado por leitura não é achado. Este ficou de pé só porque a prova rodou.
create or replace function public.consumo_de_ia_do_dia(
  p_organization_id uuid,
  p_user_id uuid default null,
  p_agent text default null
)
returns table (
  chamadas_do_dia integer,
  tokens_do_dia bigint,
  usd_do_dia numeric,
  cobraveis_sem_custo_medido integer,
  chamadas_do_usuario integer,
  tokens_do_usuario bigint,
  chamadas_do_agente integer,
  tokens_do_agente bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with dia as (
    select *
      from public.ai_usage_events
     where organization_id = p_organization_id
       -- Dia civil em America/Sao_Paulo: teto DIÁRIO num fuso que não é o do
       -- corretor viraria à meia-noite errada e a operação da tarde acharia que
       -- o dia já tinha reiniciado.
       and (created_at at time zone 'America/Sao_Paulo')::date
         = (now() at time zone 'America/Sao_Paulo')::date
  )
  select
    (select count(*) from dia)::integer,
    (select coalesce(sum(total_tokens), 0) from dia)::bigint,
    -- Soma só o que TEM custo medido. Pode ser NULL, e NULL aqui significa
    -- "não medido" — o limitador trata isso e não afirma zero.
    (select sum(estimated_cost_usd) from dia where estimated_cost_usd is not null),
    (select count(*) from dia where provider <> 'local' and estimated_cost_usd is null)::integer,
    -- Chamada sem usuário cai no balde compartilhado: 35% do tráfego medido não
    -- tem user_id, e um teto por usuário que os ignorasse deixaria um terço da
    -- operação sem teto algum.
    (select count(*) from dia
      where (p_user_id is not null and user_id = p_user_id)
         or (p_user_id is null and user_id is null))::integer,
    (select coalesce(sum(total_tokens), 0) from dia
      where (p_user_id is not null and user_id = p_user_id)
         or (p_user_id is null and user_id is null))::bigint,
    (select count(*) from dia where p_agent is not null and agent = p_agent)::integer,
    (select coalesce(sum(total_tokens), 0) from dia where p_agent is not null and agent = p_agent)::bigint;
$$;

revoke all on function public.consumo_de_ia_do_dia(uuid, uuid, text) from public;
revoke all on function public.consumo_de_ia_do_dia(uuid, uuid, text) from anon;
revoke all on function public.consumo_de_ia_do_dia(uuid, uuid, text) from authenticated;
grant execute on function public.consumo_de_ia_do_dia(uuid, uuid, text) to service_role;

comment on function public.consumo_de_ia_do_dia(uuid, uuid, text) is
  'Consumo de IA do dia civil (America/Sao_Paulo) numa ida: organização, usuário (ou balde sem atribuição) e agente. usd_do_dia é NULL quando nenhuma chamada tinha tarifa — nunca zero. Vive em public porque o app a chama via .rpc(); PostgREST não expõe private.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O REGISTRO DA SOMBRA (4.8)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.ai_shadow_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agent text not null,
  acao text not null,
  autonomy_level smallint not null,
  -- Nível 5 é a classe do proibido: nenhuma linha pode declará-lo. A trava do
  -- código (`validarCatalogo`) protege o catálogo; esta protege o BANCO, para o
  -- caso de alguém inserir direto por SQL.
  constraint ai_shadow_decisions_nivel_declaravel check (autonomy_level between 0 and 4),

  -- O que a IA FARIA, pronto para um humano conferir e executar.
  preparado jsonb not null default '{}'::jsonb,
  recomendacao text not null,
  -- Confiança NUNCA é inventada: nulo significa "não medida".
  confianca numeric,
  entidade_tipo text,
  entidade_id text,

  retido boolean not null default true,
  -- Em sombra, `executado` é falso por definição. O check impede a combinação
  -- impossível "retido e executado", que é como um registro de sombra mentiria.
  executado boolean not null default false,
  constraint ai_shadow_decisions_retido_nao_executa check (not (retido and executado)),

  -- A comparação de 4.8: recomendação × decisão humana × resultado.
  decisao_humana text,
  decidido_por uuid,
  decidido_em timestamptz,
  resultado text,
  resultado_em timestamptz,

  aprovado_por text,
  aprovado_em timestamptz,
  aprovacao_motivo text,

  motivo text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_shadow_decisions_org_agente_idx
  on public.ai_shadow_decisions (organization_id, agent, created_at desc);

-- Índice para a comparação: os casos que JÁ têm decisão humana são o único
-- conjunto comparável, e é o que o relatório de 4.8 lê.
create index if not exists ai_shadow_decisions_comparaveis_idx
  on public.ai_shadow_decisions (organization_id, agent)
  where decisao_humana is not null;

alter table public.ai_shadow_decisions enable row level security;

-- RLS ativa, como o dono exigiu. A cerca é a organização.
-- Nota honesta: 124 arquivos deste produto usam service_role, que ignora RLS —
-- então esta política protege o acesso via chave anônima/autenticada, não o
-- caminho principal do servidor. Ela existe porque a alternativa (tabela sem
-- RLS) é pior, e porque o dia em que uma tela ler isto direto do cliente ela já
-- está protegida.
drop policy if exists ai_shadow_decisions_org_fence on public.ai_shadow_decisions;
create policy ai_shadow_decisions_org_fence
  on public.ai_shadow_decisions
  as restrictive
  for all
  to authenticated
  using (
    organization_id = (
      select p.organization_id from public.profiles p where p.id = auth.uid()
    )
  );

revoke all on table public.ai_shadow_decisions from public;
revoke all on table public.ai_shadow_decisions from anon;
grant select on table public.ai_shadow_decisions to authenticated;
grant all on table public.ai_shadow_decisions to service_role;

comment on table public.ai_shadow_decisions is
  'Modo sombra (4.8): o que a IA FARIA, sem executar, mais a decisão humana e o resultado. As três colunas juntas são o que permite comparar recomendação x decisão x desfecho e decidir se um agente sai da sombra.';
