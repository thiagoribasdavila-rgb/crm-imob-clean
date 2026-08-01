-- ============================================================================
-- Atlas v3 — SEGUNDA CAMADA DA FUNDAÇÃO
-- (tabelas canônicas órfãs + API pública de tenant)
-- ----------------------------------------------------------------------------
-- POR QUE ESTE ARQUIVO EXISTE
--
-- A primeira camada (`20260711030000_atlas_v3_foundation_base_tables.sql`)
-- reconstruiu as 23 tabelas que existem DE FATO em produção, mais o schema
-- `private` e `private.current_organization_id()`. Depois dela a homologação
-- passou a ter 47 tabelas — mas o replay continuou falhando em cascata por dois
-- motivos que a primeira camada não cobre:
--
--   (A) DOIS OBJETOS CANÔNICOS SEM DONO. `public.pipeline` e `public.units` são
--       referenciados por migrations do repo mas NÃO são criados por migration
--       nenhuma E não existem em produção (foram criadas só no projeto Supabase
--       antigo `pvvdfqbkqhfifylzgbkq`, cujo DDL nunca foi versionado — ver o stub
--       `20260711040000_atlas_v3_foundation.sql`, que as lista pelo nome).
--
--   (B) A API PÚBLICA DE TENANT NASCE TARDE DEMAIS.
--       `public.current_organization_id()` e `public.current_user_role()` só são
--       criadas em `20260716210000_atlas_v3_canonical_base_tables.sql`, mas
--       migrations de 11/07 já as chamam. Como `create policy` valida a função no
--       momento do CREATE, a migration inteira aborta com
--       `function public.current_organization_id() does not exist` — e junto com
--       ela morrem as tabelas que ela criaria.
--
-- ----------------------------------------------------------------------------
-- O QUE FOI CONFIRMADO ANTES DE CRIAR (auditoria, não palpite)
--
-- Varredura de TODAS as 135 migrations cruzando "referências a public.X" contra
-- "create table/view de X". Únicos objetos referenciados e nunca criados:
--
--     public.pipeline   -> 20260711232000 (índice), 20260711233000 (policy)
--     public.units      -> 20260711232000 (índice), 20260711233000 (policy)
--     public.search_knowledge_chunks  -> é FUNÇÃO, não tabela (fora de escopo)
--
-- Os demais alvos suspeitos foram DESCARTADOS por verificação:
--
--     campaigns / properties / opportunities / ai_insights / developments
--         -> têm `create table` em 20260716210000 e JÁ EXISTEM na homologação.
--     atlas_decisions / atlas_agent_runs / atlas_events
--         -> têm `create table` em 20260711150000_atlas_v3_unification.sql.
--     atlas_entities / atlas_memories
--         -> têm `create table` em 20260711200000_atlas_2030_foundation.sql.
--
--     As cinco tabelas `atlas_*` NÃO estão faltando por ausência de DDL: elas
--     faltam porque as DUAS migrations que as criam terminam em
--     `create policy ... using (organization_id = public.current_organization_id())`
--     e abortam no COMMIT da transação por causa do problema (B). Recriá-las aqui
--     seria duplicar schema e criar risco de drift entre duas definições. A
--     correção CERTA é a causa raiz: publicar a função antes. Feito na seção 1.
--
-- ----------------------------------------------------------------------------
-- REGRAS SEGUIDAS (idênticas às da primeira camada)
--   * `if not exists` em tudo -> reaplicável sem quebrar.
--   * SCHEMA APENAS. Zero insert/update/delete/drop/truncate. Nenhum dado.
--   * Constraints com NOME EXPLÍCITO, para que migrations posteriores consigam
--     referenciá-las.
--   * RLS habilitada, SEM policy. Sem policy, RLS nega tudo para
--     anon/authenticated — o padrão seguro. As policies reais vêm depois
--     (20260711233000 cria `pipeline_org_access` e `units_org_access`).
--   * Nenhuma FK aponta para tabela que ainda não existe NESTE ponto da linha do
--     tempo. Colunas de ligação cujo alvo nasce depois ficam como `uuid` nu — o
--     mesmo padrão que 20260716210000 já usa para `developer_id`/`typology_id`.
-- ============================================================================

begin;

-- ===========================================================================
-- 1) API PÚBLICA DE TENANT — antecipada para 11/07.
--
--    Corpos COPIADOS LITERALMENTE de 20260716210000_atlas_v3_canonical_base_tables.sql
--    (linhas 44-55 e 62-80). Como lá o comando é `create or replace`, quando
--    aquela migration rodar ela apenas reescreverá texto idêntico: no-op real,
--    zero divergência entre as duas definições.
--
--    QUEM DESBLOQUEIA (medido no replay):
--      20260711150000_atlas_v3_unification.sql   -> atlas_decisions,
--          atlas_agent_runs, atlas_events, digital_twin_snapshots
--      20260711200000_atlas_2030_foundation.sql  -> atlas_entities,
--          atlas_relationships, atlas_memories, atlas_simulations,
--          atlas_recommendations, atlas_data_products
--      e, por tabela, toda a cauda que grava em `atlas_events`
--      (phase_33, opt-out de WhatsApp, roteamento noturno, /api/v1/integrations...).
-- ===========================================================================

-- Wrapper fino da versão privada, que a primeira camada já criou. Mantém o
-- espírito do hardening 20260715032525 (remove_public_tenant_helper_rpc):
-- `anon` e `public` continuam sem execute; só authenticated/service_role.
create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_organization_id();
$$;
revoke all on function public.current_organization_id() from public;
revoke all on function public.current_organization_id() from anon;
grant execute on function public.current_organization_id() to authenticated, service_role;

comment on function public.current_organization_id() is
  'Wrapper público de private.current_organization_id(). Antecipado para 20260711035000 porque policies de 11/07 já o chamam; 20260716210000 o reescreve com corpo idêntico.';

-- Irmã da anterior: usada pelas policies de `feature_flags` em
-- 20260711233000_optimize_tenant_rls_policies.sql, que é 5 dias ANTERIOR à
-- migration que a cria. plpgsql DE PROPÓSITO: o corpo lê `commercial_role`, que
-- só nasce em 20260716212459. `language sql` validaria o corpo no CREATE e
-- quebraria; plpgsql valida em runtime, quando a coluna já existe.
create or replace function public.current_user_role()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return (
    select lower(coalesce(p.commercial_role, p.role))
    from public.profiles p
    where p.id = (select auth.uid()) and p.active = true
    limit 1
  );
end;
$$;
revoke all on function public.current_user_role() from public;
revoke all on function public.current_user_role() from anon;
grant execute on function public.current_user_role() to authenticated, service_role;

comment on function public.current_user_role() is
  'Papel do chamador em minúsculas (commercial_role com fallback no role legado). Antecipado para 20260711035000; 20260716210000 o reescreve com corpo idêntico.';

-- ===========================================================================
-- 2) public.pipeline
-- ---------------------------------------------------------------------------
-- POR QUE EXISTE
--   O stub 20260711040000 lista `pipeline` entre as tabelas canônicas do V3
--   ("organizations, profiles, leads, pipeline, properties, customers,
--   developments, units, opportunities, activities, tasks, campaigns,
--   ai_insights and audit_logs"), logo depois de `leads`. Duas migrations a
--   tratam como tabela existente:
--     * 20260711232000: `create index ... on public.pipeline(organization_id)`
--     * 20260711233000: `create policy pipeline_org_access on public.pipeline
--                        ... organization_id = (...)`
--   Sem a tabela, as DUAS migrations abortam inteiras.
--
-- DE ONDE VEIO O SCHEMA — e o que é fato vs. inferência
--   FATO (exigido por migration, não negociável):
--     * `organization_id`, do índice e da policy acima. É a ÚNICA coluna
--       comprovada.
--   INFERÊNCIA (documentada como tal):
--     * Nenhum `.from("pipeline")` no código (`lib`, `app`) — 0 ocorrências.
--       Nenhum `alter table public.pipeline` em migration nenhuma. Nenhuma FK
--       aponta para ela. Ou seja: NÃO EXISTE evidência de coluna além de
--       organization_id.
--     * O vocabulário abaixo foi copiado da irmã que a fundação já espelhou de
--       produção, `public.pipeline_history` (lead_id, old_status/new_status,
--       changed_by, organization_id), somada aos campos de negociação que
--       `public.opportunities` usa em 20260716210000 (stage, value, probability,
--       expected_close_at). Interpretação adotada: `pipeline` é o ESTADO ATUAL
--       do lead no funil, e `pipeline_history` é o log das transições.
--   POSTURA: tudo nullable exceto id/organization_id, e ZERO check constraint —
--   não conheço o vocabulário real de `stage`/`status`, e um CHECK errado
--   quebraria escrita futura. Coluna sobrando é barata; CHECK errado, não.
-- ---------------------------------------------------------------------------
create table if not exists public.pipeline (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  lead_id           uuid,
  opportunity_id    uuid,          -- alvo (public.opportunities) só nasce em 20260716210000: sem FK aqui
  stage             text,
  previous_stage    text,
  status            text,
  position          integer,
  value             numeric,
  probability       numeric,
  expected_close_at timestamptz,
  entered_at        timestamptz not null default now(),
  exited_at         timestamptz,
  assigned_to       uuid,
  changed_by        uuid,
  notes             text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint pipeline_organization_id_fkey
    foreign key (organization_id) references public.organizations (id) on delete cascade,
  constraint pipeline_lead_id_fkey
    foreign key (lead_id) references public.leads (id) on delete cascade,
  constraint pipeline_assigned_to_fkey
    foreign key (assigned_to) references public.profiles (id) on delete set null,
  constraint pipeline_changed_by_fkey
    foreign key (changed_by) references public.profiles (id) on delete set null
);

comment on table public.pipeline is
  'Estado atual do lead no funil comercial. Tabela canônica órfã: citada pelo stub 20260711040000 e exigida por 20260711232000/20260711233000, mas sem DDL em migration alguma. Só organization_id é comprovado; as demais colunas são derivadas de pipeline_history + opportunities. Ver comentários da migration 20260711035000.';

-- ===========================================================================
-- 3) public.units
-- ---------------------------------------------------------------------------
-- POR QUE EXISTE
--   Mesmo caso de `pipeline`. Exigida por:
--     * 20260711232000: `create index ... on public.units(organization_id)`
--     * 20260711233000: `create policy units_org_access on public.units ...`
--
-- DE ONDE VEIO O SCHEMA — e o que é fato vs. inferência
--   FATO:
--     * `organization_id`, do índice e da policy. Única coluna comprovada.
--     * A MESMA migration 20260711232000 cria
--       `idx_opportunities_unit_id on public.opportunities(unit_id)` — logo
--       `units` é granularidade de UNIDADE IMOBILIÁRIA, e uma oportunidade
--       aponta para uma unidade. Isso fixa a natureza da tabela, não as colunas.
--   INFERÊNCIA:
--     * Nenhum `.from("units")` no código — 0 ocorrências (os hits de grep por
--       "units" são todos `inventory_units`, `development_typologies` etc.).
--       Nenhum `alter table public.units`. Nenhuma FK a referencia.
--     * Vocabulário copiado das duas irmãs já versionadas: `inventory_units`
--       (primeira camada, espelho de produção: unit_code/tower/floor/typology/
--       bedrooms/suites/parking_spaces/private_area/price/status/reserved_until)
--       e `properties` (20260716210000: unit_number/bathrooms/list_price/
--       development_id/inventory_source). Adotei a UNIÃO das duas, para que
--       `units` sirva de destino tanto do modelo antigo quanto do novo.
--     * NOTA HONESTA: é bem provável que `units` seja o nome V3 do que produção
--       chama de `inventory_units` e o que a cauda chama de `properties` — ou
--       seja, uma TERCEIRA grafia da mesma entidade. Não consolidei as três aqui:
--       consolidar é decisão de produto, não de migration de fundação.
--   POSTURA: tudo nullable exceto id/organization_id; zero CHECK (o vocabulário
--   de `status` diverge entre as irmãs — 'AVAILABLE' maiúsculo em
--   inventory_units vs. 'available' minúsculo em properties — então cravar um
--   CHECK aqui seria escolher por conta própria).
-- ---------------------------------------------------------------------------
create table if not exists public.units (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  development_id    uuid,          -- alvo (public.developments) só nasce em 20260716210000: sem FK aqui
  property_id       uuid,          -- alvo (public.properties)   só nasce em 20260716210000: sem FK aqui
  project_id        uuid,          -- crm_projects (legado). Sem FK: ver nota abaixo.
  unit_code         text,
  unit_number       text,
  tower             text,
  floor             text,
  typology          text,
  orientation       text,
  bedrooms          integer,
  bathrooms         integer,
  suites            integer,
  parking_spaces    integer,
  private_area      numeric,
  total_area        numeric,
  price             numeric,
  list_price        numeric,
  status            text,
  inventory_source  text,
  reserved_until    timestamptz,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint units_organization_id_fkey
    foreign key (organization_id) references public.organizations (id) on delete cascade
);

-- `project_id` FICA SEM FK de propósito. `public.crm_projects` já existe neste
-- ponto e a FK composta (id, organization_id) seria tecnicamente possível, mas
-- não há UMA evidência de que `units` se pendure em crm_projects — o stub V3
-- pareia `units` com `developments`, não com `crm_projects`. Amarrar sem prova
-- criaria uma restrição inventada que travaria inserção futura. Coluna nua.

comment on table public.units is
  'Unidade imobiliária (grafia V3). Tabela canônica órfã: exigida por 20260711232000/20260711233000 e apontada por opportunities.unit_id, mas sem DDL em migration alguma. Só organization_id é comprovado; demais colunas derivadas da união de inventory_units + properties. Ver comentários da migration 20260711035000.';

-- ===========================================================================
-- 4) RLS habilitada, sem policy.
--    Estado seguro por omissão: nega tudo para anon/authenticated até que
--    20260711233000 crie `pipeline_org_access` / `units_org_access`.
--    `service_role` continua passando (BYPASSRLS).
-- ===========================================================================
alter table public.pipeline enable row level security;
alter table public.units    enable row level security;

-- ===========================================================================
-- 5) Índices.
--    Nomes escolhidos DE PROPÓSITO para casar com os de
--    20260711232000_add_missing_foreign_key_indexes.sql (`idx_<tabela>_<coluna>`),
--    e não com a convenção `<tabela>_<coluna>_idx` da primeira camada: assim
--    aquelas duas linhas viram no-op de verdade em vez de criar um índice
--    duplicado sobre a mesma coluna. Os índices que aquela migration NÃO cobre
--    seguem a convenção da fundação.
--    Postgres indexa o lado REFERENCIADO das FKs (via PK/unique), nunca o lado
--    que referencia — por isso cada FK acima ganha o seu.
-- ===========================================================================
create index if not exists idx_pipeline_organization_id
  on public.pipeline (organization_id);
create index if not exists pipeline_lead_id_idx
  on public.pipeline (lead_id);
create index if not exists pipeline_assigned_to_idx
  on public.pipeline (assigned_to);
create index if not exists pipeline_changed_by_idx
  on public.pipeline (changed_by);
create index if not exists pipeline_org_stage_idx
  on public.pipeline (organization_id, stage);

create index if not exists idx_units_organization_id
  on public.units (organization_id);
create index if not exists units_development_id_idx
  on public.units (development_id);
create index if not exists units_property_id_idx
  on public.units (property_id);
create index if not exists units_org_status_idx
  on public.units (organization_id, status);

commit;
