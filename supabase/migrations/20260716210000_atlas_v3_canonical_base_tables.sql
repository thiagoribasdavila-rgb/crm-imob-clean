-- ============================================================================
-- Atlas v3 — Tabelas-base canônicas ausentes (remediação de drift pré-deploy)
-- ----------------------------------------------------------------------------
-- CONTEXTO: 20260711040000_atlas_v3_foundation.sql é um STUB de documentação
-- (zero DDL). As tabelas canônicas developments/properties/campaigns/
-- opportunities/ai_insights são referenciadas por ~25 migrations da cauda e por
-- dezenas de arquivos de código, mas NENHUMA migration as cria. Sem elas, aplicar
-- a cauda (16→20/07) num banco falha por FK pendente.
--
-- Esta migration cria a forma canônica dessas 5 tabelas ANTES da cauda. Colunas e
-- tipos derivados do uso real (selects no código + ALTERs das phases), de modo que
-- os `ADD COLUMN IF NOT EXISTS` das phases 61/62/64 virem no-ops idempotentes.
--
-- ORDENAÇÃO SEGURA (validado contra o grafo de dependências):
--   * FKs inline apontam SOMENTE para tabelas já presentes neste ponto:
--     organizations/leads/profiles (vêm do dump da prod) + as canônicas criadas
--     acima nesta própria migration (developments antes de properties/etc.).
--   * developer_id (→developers, criada na phase_61) e typology_id
--     (→development_typologies, criada na phase_63) ficam como uuid SEM FK inline
--     para não referenciar tabela que ainda não existe. A integridade dessas duas
--     colunas pode ser reforçada por uma migration tardia após as phases 61/63.
--   * `units` foi deliberadamente OMITIDA: nenhum FID da cauda a referencia e
--     nenhum código a consulta (era falso positivo de grep sobre inventory_units).
--
-- RLS auto-contida: cada tabela habilita RLS + policy de leitura por organização
-- (usando public.current_organization_id(), presente no dump), sem depender de
-- migrations pré-corte que o caminho "espelho" não aplica. Escritas passam por
-- RPCs security-definer, então revogamos insert/update/delete de `authenticated`.
--
-- Idempotente: CREATE ... IF NOT EXISTS + DROP POLICY IF EXISTS. Seguro re-rodar.
-- Validação definitiva: aplicar a cauda inteira contra um Postgres real.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) public.developments — evolução canônica de public.crm_projects
--    Forma COMPLETA (núcleo legado + colunas que phase_62 adiciona) para que os
--    ALTER ... ADD COLUMN IF NOT EXISTS das phases virem no-ops.
-- ---------------------------------------------------------------------------
create table if not exists public.developments (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  developer_id       uuid, -- FK→public.developers adiada (developers nasce na phase_61)
  developer_name     text,
  name               text not null,
  project_code       text,
  slug               text,
  address_line       text,
  neighborhood       text,
  city               text,
  state              text,
  postal_code        text,
  latitude           numeric(9,6),
  longitude          numeric(9,6),
  market_segment     text,
  product_type       text,
  typologies         text[] not null default '{}',
  bedrooms_min       smallint,
  bedrooms_max       smallint,
  private_area_min   numeric(12,2),
  private_area_max   numeric(12,2),
  price_min          numeric(16,2),
  price_max          numeric(16,2),
  total_units        integer,
  status             text not null default 'active',
  sales_cycle_status text not null default 'planning',
  launch_date        date,
  sales_start_date   date,
  sales_end_date     date,
  delivery_date      date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists developments_org_project_code_unique
  on public.developments(organization_id, project_code) where project_code is not null;
create unique index if not exists developments_org_slug_unique
  on public.developments(organization_id, slug) where slug is not null;
create index if not exists developments_org_developer_idx
  on public.developments(organization_id, developer_id, status);
create index if not exists developments_org_cycle_idx
  on public.developments(organization_id, sales_cycle_status, developer_id);

alter table public.developments enable row level security;
drop policy if exists developments_tenant_read on public.developments;
create policy developments_tenant_read on public.developments for select to authenticated
  using (organization_id = (select public.current_organization_id()));
revoke all on public.developments from anon;
revoke insert, update, delete on public.developments from authenticated;
grant select on public.developments to authenticated;

-- ---------------------------------------------------------------------------
-- 2) public.properties — evolução canônica de public.inventory_units
-- ---------------------------------------------------------------------------
create table if not exists public.properties (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  development_id          uuid not null references public.developments(id) on delete cascade,
  typology_id             uuid, -- FK→public.development_typologies adiada (nasce na phase_63)
  canonical_unit_key      text,
  title                   text,
  unit_number             text,
  tower                   text,
  floor                   text,
  orientation             text,
  typology                text,
  neighborhood            text,
  city                    text,
  state                   text,
  bedrooms                integer,
  bathrooms               integer,
  parking_spaces          integer,
  area                    numeric(14,2),
  price                   numeric(16,2),
  list_price              numeric(16,2),
  status                  text not null default 'available',
  inventory_source        text not null default 'manual',
  inventory_version       integer not null default 1,
  availability_updated_at timestamptz not null default now(),
  last_synced_at          timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create unique index if not exists properties_org_canonical_unit_unique
  on public.properties(organization_id, development_id, canonical_unit_key)
  where canonical_unit_key is not null;
create index if not exists properties_typology_availability_idx
  on public.properties(organization_id, development_id, typology_id, status);
create index if not exists idx_properties_organization_id on public.properties(organization_id);
create index if not exists idx_properties_development_id on public.properties(development_id);

alter table public.properties enable row level security;
drop policy if exists properties_tenant_read on public.properties;
create policy properties_tenant_read on public.properties for select to authenticated
  using (organization_id = (select public.current_organization_id()));
revoke all on public.properties from anon;
revoke insert, update, delete on public.properties from authenticated;
grant select on public.properties to authenticated;

-- ---------------------------------------------------------------------------
-- 3) public.campaigns — evolução canônica de public.marketing_campaigns
--    (nomes de coluna starts_at/ends_at seguem o SELECT vivo em marketing/page.tsx)
-- ---------------------------------------------------------------------------
create table if not exists public.campaigns (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  development_id       uuid references public.developments(id) on delete set null,
  project_id           uuid, -- legado marketing_campaigns.project_id; sem FK (não há tabela projects canônica)
  name                 text not null,
  channel              text,
  platform             text,
  external_campaign_id text,
  status               text not null default 'ACTIVE' check (status in ('ACTIVE','PAUSED','COMPLETED','ARCHIVED')),
  budget               numeric(14,2),
  spend                numeric(14,2) not null default 0,
  leads_count          integer not null default 0,
  sales_count          integer not null default 0,
  revenue              numeric(14,2) not null default 0,
  starts_at            timestamptz,
  ends_at              timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_campaigns_organization_id on public.campaigns(organization_id);
create index if not exists idx_campaigns_org_status on public.campaigns(organization_id, status);

alter table public.campaigns enable row level security;
drop policy if exists campaigns_tenant_read on public.campaigns;
create policy campaigns_tenant_read on public.campaigns for select to authenticated
  using (organization_id = (select public.current_organization_id()));
revoke all on public.campaigns from anon;
revoke insert, update, delete on public.campaigns from authenticated;
grant select on public.campaigns to authenticated;

-- ---------------------------------------------------------------------------
-- 4) public.opportunities — pipeline de oportunidades comerciais
--    (commission_status enum vem literal da união TS em sales/page.tsx)
-- ---------------------------------------------------------------------------
create table if not exists public.opportunities (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  lead_id                     uuid references public.leads(id) on delete set null,
  property_id                 uuid references public.properties(id) on delete set null,
  assigned_to                 uuid references public.profiles(id) on delete set null,
  stage                       text not null default 'novo',
  status                      text,
  value                       numeric(14,2),
  probability                 numeric(5,2) not null default 0,
  expected_close_at           timestamptz,
  won_at                      timestamptz,
  lost_at                     timestamptz,
  commission_sla_days         integer,
  commission_gross            numeric(14,2),
  commission_percentage       numeric(6,3),
  commission_split_percentage numeric(6,3),
  commission_net              numeric(14,2),
  commission_received_amount  numeric(14,2) not null default 0,
  commission_due_at           timestamptz,
  commission_received_at      timestamptz,
  commission_status           text not null default 'not_applicable'
    check (commission_status in ('not_applicable','pending','due_soon','overdue','partial','received','divergent')),
  commission_notes            text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index if not exists idx_opportunities_organization_id on public.opportunities(organization_id);
create index if not exists idx_opportunities_lead_id on public.opportunities(lead_id);
create index if not exists idx_opportunities_org_stage on public.opportunities(organization_id, stage);

alter table public.opportunities enable row level security;
drop policy if exists opportunities_tenant_read on public.opportunities;
create policy opportunities_tenant_read on public.opportunities for select to authenticated
  using (organization_id = (select public.current_organization_id()));
revoke all on public.opportunities from anon;
revoke insert, update, delete on public.opportunities from authenticated;
grant select on public.opportunities to authenticated;

-- ---------------------------------------------------------------------------
-- 5) public.ai_insights — insights de IA (lido por intelligence/page.tsx)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_insights (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type            text,
  title           text,
  summary         text,
  content         text,
  recommendation  text,
  score           numeric(10,2),
  confidence      numeric(5,2),
  status          text not null default 'active',
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_ai_insights_organization_id on public.ai_insights(organization_id);
create index if not exists idx_ai_insights_org_created on public.ai_insights(organization_id, created_at desc);

alter table public.ai_insights enable row level security;
drop policy if exists ai_insights_tenant_read on public.ai_insights;
create policy ai_insights_tenant_read on public.ai_insights for select to authenticated
  using (organization_id = (select public.current_organization_id()));
revoke all on public.ai_insights from anon;
revoke insert, update, delete on public.ai_insights from authenticated;
grant select on public.ai_insights to authenticated;
