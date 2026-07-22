-- ============================================================================
-- Atlas v3 — FUNDAÇÃO REAL DO BANCO (tabelas-base)
-- ----------------------------------------------------------------------------
-- POR QUE ESTE ARQUIVO EXISTE
--
-- O repositório NÃO reconstruía o banco. O arquivo
-- `20260711040000_atlas_v3_foundation.sql` é um STUB de documentação: 11 linhas
-- de comentário dizendo que "o schema foi aplicado remotamente" em OUTRO projeto
-- Supabase (pvvdfqbkqhfifylzgbkq). Ele contém ZERO DDL. Consequência medida:
--
--   * Nenhuma migration do repo criava organizations, profiles, leads,
--     activities ou tasks — as raízes de todo o produto (leads sozinha tem ~135
--     chamadas `.from()` no código; profiles 53; organizations 16).
--   * Numa homologação limpa, 47 migrations foram tentadas: 5 aplicaram e 40
--     falharam, quase todas com `relation "public.organizations" does not exist`.
--   * A migration `20260716210000_atlas_v3_canonical_base_tables.sql` chama
--     `private.current_organization_id()`, mas o schema `private` só nasce na
--     migration SEGUINTE (`20260716212459`) e a função privada nunca é criada
--     por migration alguma — ela só existia no banco vivo.
--
-- Este arquivo resolve os dois problemas de uma vez, rodando ANTES de tudo
-- (timestamp 20260711030000 < 20260711040000 do stub):
--
--   1. cria o schema `private` e a função `private.current_organization_id()`,
--      que a cauda inteira pressupõe;
--   2. cria, em ordem de dependência, as 23 tabelas que existem de fato em
--      PRODUÇÃO, espelhando colunas, tipos, defaults, PKs, CHECKs e FKs
--      obtidos por INTROSPECÇÃO DE CATÁLOGO do banco vivo (somente leitura de
--      catálogo — nenhum dado de cliente foi lido ou copiado).
--
-- O stub `20260711040000_atlas_v3_foundation.sql` NÃO foi apagado nem editado:
-- ele permanece como registro histórico. A partir daqui, ninguém depende dele.
--
-- REGRAS SEGUIDAS NESTE ARQUIVO
--   * `if not exists` em tudo -> reaplicável sem quebrar (idempotente).
--   * SCHEMA APENAS. Zero `insert`. Nenhuma linha de dado real.
--   * Nenhuma coluna inventada: só o que a introspecção mostrou.
--   * RLS habilitada em todas as 23 tabelas, SEM policies. Sem policy, RLS é
--     negar-tudo para `anon`/`authenticated` — o padrão seguro. As policies
--     reais são responsabilidade das migrations posteriores.
--
-- LIMITE CONHECIDO: introspecção de catálogo revela estrutura, não comportamento.
-- Policies RLS reais, triggers, funções de negócio, `on delete` das FKs e
-- constraints únicas não-declaradas em coluna NÃO aparecem. Ver a seção
-- "incertezas" do relatório que acompanha esta entrega.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) Extensões usadas pelos defaults de produção.
--    Vários `id` da era V1 usam `extensions.uuid_generate_v4()` (uuid-ossp),
--    enquanto as tabelas mais novas usam `gen_random_uuid()` (nativo do PG13+).
--    Espelhamos os dois porque é o que a introspecção mostrou.
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp" with schema extensions;

-- ---------------------------------------------------------------------------
-- 1) Schema `private` + API de tenant.
--
--    `private.current_organization_id()` é a pedra angular do multi-tenant:
--    dezenas de policies e funções da cauda comparam `organization_id` com ela
--    (direta ou indiretamente, via o wrapper `public.current_organization_id()`
--    criado em 20260716210000). A função nunca foi versionada — existia só no
--    banco vivo. Reconstruímos aqui a partir do uso observado no repo:
--
--      * `app/api/v1/team/route.ts` grava
--        `app_metadata: { organization_id, commercial_role }` no usuário do Auth
--        -> a fonte primária é o claim do JWT;
--      * as funções irmãs em `private` (ex.: can_access_commercial_lead) leem
--        `public.profiles` por `auth.uid()` exigindo `active = true`
--        -> esse é o fallback natural quando o claim está ausente.
--
--    DECISÃO EXPLÍCITA: claim do JWT primeiro, `profiles` como fallback, e
--    `null` se nenhum dos dois resolver. `null` é o fallback SEGURO: qualquer
--    policy no formato `organization_id = current_organization_id()` avalia como
--    NULL (não-verdadeiro) e nega a linha, em vez de vazar entre empresas.
--    O claim só é aceito se casar com o formato UUID — string inválida vira
--    fallback, nunca exceção que derrubaria a query inteira.
-- ---------------------------------------------------------------------------
create schema if not exists private;

-- Sem USAGE no schema, toda policy que chame `private.*` falha em runtime para
-- o papel `authenticated`. Nenhuma migration do repo concede isso (só o banco
-- vivo tinha). Concedido aqui; o acesso real continua controlado função a
-- função pelos `revoke/grant execute` de cada uma.
grant usage on schema private to authenticated, service_role;

--    plpgsql de PROPÓSITO (não `language sql`): o corpo referencia
--    public.profiles, que só nasce mais abaixo neste mesmo arquivo. `language sql`
--    valida o corpo na hora do CREATE e quebraria com
--    `relation "public.profiles" does not exist`; plpgsql valida em runtime,
--    quando a tabela já existe. Mesma técnica já usada pelo repo em
--    public.current_user_role() (20260716210000).
create or replace function private.current_organization_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claim text;
  v_organization_id uuid;
begin
  v_claim := nullif(((select auth.jwt()) -> 'app_metadata' ->> 'organization_id'), '');

  if v_claim ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_claim::uuid;
  end if;

  select p.organization_id
    into v_organization_id
  from public.profiles p
  where p.id = (select auth.uid())
    and coalesce(p.active, false) = true
  limit 1;

  return v_organization_id;
end;
$$;

revoke all on function private.current_organization_id() from public;
revoke all on function private.current_organization_id() from anon;
grant execute on function private.current_organization_id() to authenticated, service_role;

comment on function private.current_organization_id() is
  'Empresa (tenant) do chamador. Prioriza o claim app_metadata.organization_id do JWT; cai para public.profiles quando ausente; retorna null (nega) se nada resolver.';

-- ===========================================================================
-- 2) TABELAS. Ordem = ordem de dependência de chave estrangeira.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 2.1) organizations — raiz do multi-tenant.
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null,
  status     text default 'ACTIVE'::text,
  created_at timestamptz default now(),
  constraint organizations_slug_key unique (slug)
);

-- ---------------------------------------------------------------------------
-- 2.2) profiles — usuário do produto, 1:1 com auth.users.
--      O CHECK `profiles_role_check` é nomeado de propósito: a migration
--      20260716210000 faz `drop constraint if exists profiles_role_check` para
--      relaxá-lo. O nome precisa bater.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key,
  name                text,
  email               text,
  role                text default 'ADMIN'::text,
  active              boolean default true,
  organization_id     uuid,
  created_at          timestamptz default now(),
  team                text,
  max_active_leads    integer not null default 100,
  availability_status text not null default 'AVAILABLE'::text,
  constraint profiles_id_fkey
    foreign key (id) references auth.users (id) on delete cascade,
  constraint profiles_organization_id_fkey
    foreign key (organization_id) references public.organizations (id),
  constraint profiles_role_check
    check (role = any (array['ADMIN'::text,'DIRETOR_DECISOR'::text,'DIRETOR'::text,'GERENTE'::text,'CORRETOR'::text])),
  constraint profiles_availability_status_check
    check (availability_status = any (array['AVAILABLE'::text,'PAUSED'::text,'VACATION'::text]))
);

comment on column public.profiles.max_active_leads is
  'Maximum number of active leads eligible for automatic distribution.';
comment on column public.profiles.availability_status is
  'Broker availability for automatic lead distribution.';

-- ---------------------------------------------------------------------------
-- 2.3) crm_projects — empreendimentos do CRM.
--      A UNIQUE (id, organization_id) não é redundante: é o alvo exigido pelas
--      FKs COMPOSTAS de leads / inventory_units / marketing_campaigns /
--      knowledge_documents / knowledge_chunks, que amarram o filho à MESMA
--      empresa do pai. Postgres exige índice único no par referenciado.
-- ---------------------------------------------------------------------------
create table if not exists public.crm_projects (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name            text not null,
  developer_name  text,
  code            text,
  status          text not null default 'ACTIVE'::text,
  city            text,
  neighborhood    text,
  address         text,
  launch_date     date,
  delivery_date   date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint crm_projects_organization_id_fkey
    foreign key (organization_id) references public.organizations (id) on delete cascade,
  constraint crm_projects_status_check
    check (status = any (array['ACTIVE'::text,'PAUSED'::text,'SOLD_OUT'::text,'ARCHIVED'::text])),
  constraint crm_projects_id_organization_id_key unique (id, organization_id)
);

-- ---------------------------------------------------------------------------
-- 2.4) marketing_campaigns
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_campaigns (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null,
  project_id           uuid,
  name                 text not null,
  platform             text not null default 'META'::text,
  external_campaign_id text,
  status               text not null default 'ACTIVE'::text,
  started_at           date,
  ended_at             date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint marketing_campaigns_organization_id_fkey
    foreign key (organization_id) references public.organizations (id) on delete cascade,
  constraint marketing_campaigns_project_id_organization_id_fkey
    foreign key (project_id, organization_id)
    references public.crm_projects (id, organization_id) on delete set null,
  constraint marketing_campaigns_status_check
    check (status = any (array['ACTIVE'::text,'PAUSED'::text,'COMPLETED'::text,'ARCHIVED'::text])),
  constraint marketing_campaigns_id_organization_id_key unique (id, organization_id)
);

-- ---------------------------------------------------------------------------
-- 2.5) import_batches — lotes de importação de base legada.
-- ---------------------------------------------------------------------------
create table if not exists public.import_batches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_name     text not null,
  source_file     text,
  total_rows      integer not null default 0,
  imported_rows   integer not null default 0,
  duplicate_rows  integer not null default 0,
  invalid_rows    integer not null default 0,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  constraint import_batches_organization_id_fkey
    foreign key (organization_id) references public.organizations (id) on delete cascade,
  constraint import_batches_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- 2.6) leads — o coração do produto (17.151 linhas em produção).
--      Observação fiel à introspecção: leads NÃO tem FK direta para
--      organizations. O vínculo de tenant só é forçado pelas FKs COMPOSTAS com
--      crm_projects e marketing_campaigns (MATCH SIMPLE: se qualquer coluna do
--      par for nula, a checagem é dispensada). Não "consertamos" isso aqui —
--      espelhar é o objetivo; corrigir é outra migration, com decisão do dono.
--      A UNIQUE (id, organization_id) existe para servir de alvo à FK composta
--      de lead_objections.
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id                      uuid primary key default extensions.uuid_generate_v4(),
  name                    text not null,
  phone                   text,
  email                   text,
  project                 text,
  source                  text,
  campaign                text,
  status                  text default 'NOVO'::text,
  score_ia                integer default 0,
  classificacao_ia        text,
  temperature             text,
  assigned_user_id        uuid,
  created_at              timestamptz default now(),
  organization_id         uuid,
  notes                   text,
  next_action             text,
  next_contact            timestamptz,
  legacy_broker           text,
  import_batch_id         uuid,
  source_row              integer,
  project_id              uuid,
  campaign_id             uuid,
  budget_min              numeric,
  budget_max              numeric,
  preferred_bedrooms      integer,
  preferred_min_area      numeric,
  preferred_neighborhoods text[] not null default '{}'::text[],
  payment_method          text,
  purchase_timeline       text,
  monthly_income          numeric,
  available_down_payment  numeric,
  fgts_balance            numeric,
  desired_monthly_payment numeric,
  financing_required      boolean,
  financing_term_months   integer,
  financial_restrictions  boolean,
  financial_notes         text,
  constraint leads_assigned_user_id_fkey
    foreign key (assigned_user_id) references public.profiles (id) on delete set null,
  constraint leads_import_batch_id_fkey
    foreign key (import_batch_id) references public.import_batches (id) on delete set null,
  constraint leads_project_tenant_fkey
    foreign key (project_id, organization_id)
    references public.crm_projects (id, organization_id) on delete set null,
  constraint leads_campaign_tenant_fkey
    foreign key (campaign_id, organization_id)
    references public.marketing_campaigns (id, organization_id) on delete set null,
  constraint leads_preferred_bedrooms_check
    check (preferred_bedrooms is null or (preferred_bedrooms >= 0 and preferred_bedrooms <= 10)),
  constraint leads_preferred_min_area_check
    check (preferred_min_area is null or preferred_min_area > 0::numeric),
  constraint leads_monthly_income_check
    check (monthly_income is null or monthly_income >= 0::numeric),
  constraint leads_available_down_payment_check
    check (available_down_payment is null or available_down_payment >= 0::numeric),
  constraint leads_fgts_balance_check
    check (fgts_balance is null or fgts_balance >= 0::numeric),
  constraint leads_desired_monthly_payment_check
    check (desired_monthly_payment is null or desired_monthly_payment >= 0::numeric),
  constraint leads_financing_term_months_check
    check (financing_term_months is null or (financing_term_months >= 12 and financing_term_months <= 480)),
  constraint leads_id_organization_id_key unique (id, organization_id)
);

-- ---------------------------------------------------------------------------
-- 2.7) Tabelas legadas V1 mantidas em produção (isoladas do acesso do cliente).
--      Existem, então são espelhadas. Os comentários de tabela vêm do banco vivo.
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id         uuid primary key default extensions.uuid_generate_v4(),
  name       text not null,
  email      text,
  role       text default 'CORRETOR'::text,
  created_at timestamptz default now(),
  constraint users_email_key unique (email)
);
comment on table public.users is
  'Legacy V1 table. Isolated from client access; use auth.users and public.profiles.';

create table if not exists public.projects (
  id         uuid primary key default extensions.uuid_generate_v4(),
  name       text not null,
  company    text,
  status     text default 'ACTIVE'::text,
  created_at timestamptz default now()
);
comment on table public.projects is
  'Legacy V1 table. Isolated until a tenant-aware projects model is introduced.';

create table if not exists public.activities (
  id          uuid primary key default extensions.uuid_generate_v4(),
  lead_id     uuid,
  type        text,
  description text,
  created_at  timestamptz default now(),
  constraint activities_lead_id_fkey
    foreign key (lead_id) references public.leads (id) on delete cascade
);
comment on table public.activities is
  'Legacy V1 table. Isolated; use public.lead_events for CRM timeline.';

create table if not exists public.ai_scores (
  id             uuid primary key default extensions.uuid_generate_v4(),
  lead_id        uuid,
  score          integer,
  classification text,
  recommendation text,
  created_at     timestamptz default now(),
  constraint ai_scores_lead_id_fkey
    foreign key (lead_id) references public.leads (id) on delete cascade
);
comment on table public.ai_scores is
  'Legacy V1 table. Isolated; use public.lead_scores for scoring history.';

-- ---------------------------------------------------------------------------
-- 2.8) Tabelas operacionais penduradas em leads/profiles.
--      Fiel à produção: elas TÊM `organization_id`, mas SEM FK para
--      organizations. É o "drift de FK pendente" já conhecido; espelhado como
--      está para que homologação reproduza produção, não uma versão idealizada.
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id              uuid primary key default extensions.uuid_generate_v4(),
  name            text,
  email           text,
  phone           text,
  lead_id         uuid,
  created_at      timestamptz default now(),
  organization_id uuid,
  constraint customers_lead_id_fkey
    foreign key (lead_id) references public.leads (id) on delete set null
);

create table if not exists public.tasks (
  id              uuid primary key default extensions.uuid_generate_v4(),
  title           text,
  description     text,
  status          text default 'OPEN'::text,
  user_id         uuid,
  lead_id         uuid,
  created_at      timestamptz default now(),
  organization_id uuid,
  priority        text default 'NORMAL'::text,
  due_date        timestamptz,
  constraint tasks_lead_id_fkey
    foreign key (lead_id) references public.leads (id) on delete cascade,
  constraint tasks_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete set null
);

create table if not exists public.lead_events (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid,
  event_type      text,
  metadata        jsonb,
  created_at      timestamptz default now(),
  organization_id uuid,
  type            text,
  description     text,
  created_by      uuid,
  constraint lead_events_lead_id_fkey
    foreign key (lead_id) references public.leads (id) on delete cascade,
  constraint lead_events_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null
);

create table if not exists public.lead_scores (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid,
  score           integer,
  classification  text,
  created_at      timestamptz default now(),
  organization_id uuid,
  probability     integer,
  reason          text,
  constraint lead_scores_lead_id_fkey
    foreign key (lead_id) references public.leads (id) on delete cascade
);

create table if not exists public.pipeline_history (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid,
  status          text,
  created_at      timestamptz default now(),
  organization_id uuid,
  old_status      text,
  new_status      text default 'NOVO'::text,
  changed_by      uuid,
  constraint pipeline_history_lead_id_fkey
    foreign key (lead_id) references public.leads (id) on delete cascade,
  constraint pipeline_history_changed_by_fkey
    foreign key (changed_by) references public.profiles (id) on delete set null
);

create table if not exists public.followups (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid,
  message         text,
  status          text default 'OPEN'::text,
  created_at      timestamptz default now(),
  organization_id uuid,
  user_id         uuid,
  action          text,
  priority        text default 'NORMAL'::text,
  scheduled_at    timestamptz,
  completed       boolean default false,
  constraint followups_lead_id_fkey
    foreign key (lead_id) references public.leads (id) on delete cascade,
  constraint followups_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete set null
);

create table if not exists public.lead_distribution_history (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  lead_id          uuid not null,
  assigned_user_id uuid not null,
  reason           text not null,
  created_at       timestamptz not null default now(),
  constraint lead_distribution_history_organization_id_fkey
    foreign key (organization_id) references public.organizations (id) on delete cascade,
  constraint lead_distribution_history_lead_id_fkey
    foreign key (lead_id) references public.leads (id) on delete cascade,
  constraint lead_distribution_history_assigned_user_id_fkey
    foreign key (assigned_user_id) references public.profiles (id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- 2.9) Estoque e mídia paga.
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_units (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id      uuid not null,
  unit_code       text not null,
  tower           text,
  floor           text,
  typology        text,
  bedrooms        integer,
  suites          integer,
  parking_spaces  integer,
  private_area    numeric,
  price           numeric,
  status          text not null default 'AVAILABLE'::text,
  reserved_until  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint inventory_units_organization_id_fkey
    foreign key (organization_id) references public.organizations (id) on delete cascade,
  constraint inventory_units_project_id_organization_id_fkey
    foreign key (project_id, organization_id)
    references public.crm_projects (id, organization_id) on delete cascade,
  constraint inventory_units_bedrooms_check
    check (bedrooms is null or bedrooms >= 0),
  constraint inventory_units_suites_check
    check (suites is null or suites >= 0),
  constraint inventory_units_parking_spaces_check
    check (parking_spaces is null or parking_spaces >= 0),
  constraint inventory_units_private_area_check
    check (private_area is null or private_area > 0::numeric),
  constraint inventory_units_price_check
    check (price is null or price >= 0::numeric),
  constraint inventory_units_status_check
    check (status = any (array['AVAILABLE'::text,'RESERVED'::text,'SOLD'::text,'SUSPENDED'::text,'BLOCKED'::text]))
);

create table if not exists public.marketing_spend (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id     uuid not null,
  spend_date      date not null,
  amount          numeric not null,
  impressions     integer,
  clicks          integer,
  leads_count     integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint marketing_spend_organization_id_fkey
    foreign key (organization_id) references public.organizations (id) on delete cascade,
  constraint marketing_spend_campaign_id_organization_id_fkey
    foreign key (campaign_id, organization_id)
    references public.marketing_campaigns (id, organization_id) on delete cascade,
  constraint marketing_spend_amount_check
    check (amount >= 0::numeric),
  constraint marketing_spend_impressions_check
    check (impressions is null or impressions >= 0),
  constraint marketing_spend_clicks_check
    check (clicks is null or clicks >= 0),
  constraint marketing_spend_leads_count_check
    check (leads_count is null or leads_count >= 0)
);

-- ---------------------------------------------------------------------------
-- 2.10) Objeções de lead (FK composta amarra lead + empresa).
-- ---------------------------------------------------------------------------
create table if not exists public.lead_objections (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id         uuid not null,
  objection_type  text not null,
  objection_text  text not null,
  detected_source text not null default 'MANUAL'::text,
  response_text   text,
  response_source text,
  status          text not null default 'OPEN'::text,
  outcome_stage   text,
  outcome_notes   text,
  created_by      uuid,
  resolved_by     uuid,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint lead_objections_organization_id_fkey
    foreign key (organization_id) references public.organizations (id) on delete cascade,
  constraint lead_objections_lead_tenant_fk
    foreign key (lead_id, organization_id)
    references public.leads (id, organization_id) on delete cascade,
  constraint lead_objections_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null,
  constraint lead_objections_resolved_by_fkey
    foreign key (resolved_by) references public.profiles (id) on delete set null,
  constraint lead_objections_objection_type_check
    check (objection_type = any (array['PRICE'::text,'FINANCING'::text,'LOCATION'::text,'SIZE'::text,'TIMING'::text,'TRUST'::text,'PRODUCT'::text,'COMPETITOR'::text,'OTHER'::text])),
  constraint lead_objections_detected_source_check
    check (detected_source = any (array['MANUAL'::text,'CONVERSATION_AI'::text,'COPILOT'::text])),
  constraint lead_objections_response_source_check
    check (response_source is null or (response_source = any (array['MANUAL'::text,'COPILOT'::text,'PLAYBOOK'::text]))),
  constraint lead_objections_status_check
    check (status = any (array['OPEN'::text,'ANSWERED'::text,'OVERCOME'::text,'NOT_OVERCOME'::text]))
);

-- ---------------------------------------------------------------------------
-- 2.11) Base de conhecimento (RAG).
--       `search_vector` é coluna GERADA (a introspecção devolveu a expressão no
--       lugar do default e marcou a coluna como generated).
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id      uuid,
  title           text not null,
  document_type   text not null default 'OTHER'::text,
  source_type     text not null default 'TEXT'::text,
  source_path     text,
  mime_type       text,
  checksum        text,
  status          text not null default 'READY'::text,
  metadata        jsonb not null default '{}'::jsonb,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint knowledge_documents_organization_id_fkey
    foreign key (organization_id) references public.organizations (id) on delete cascade,
  constraint knowledge_documents_project_id_organization_id_fkey
    foreign key (project_id, organization_id)
    references public.crm_projects (id, organization_id) on delete set null,
  constraint knowledge_documents_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null,
  constraint knowledge_documents_document_type_check
    check (document_type = any (array['BROCHURE'::text,'PRICE_TABLE'::text,'FLOOR_PLAN'::text,'CONTRACT'::text,'POLICY'::text,'MANUAL'::text,'OTHER'::text])),
  constraint knowledge_documents_source_type_check
    check (source_type = any (array['UPLOAD'::text,'URL'::text,'TEXT'::text,'SYSTEM'::text])),
  constraint knowledge_documents_status_check
    check (status = any (array['PENDING'::text,'PROCESSING'::text,'READY'::text,'FAILED'::text,'ARCHIVED'::text])),
  constraint knowledge_documents_id_organization_id_key unique (id, organization_id)
);

create table if not exists public.knowledge_chunks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  document_id     uuid not null,
  project_id      uuid,
  chunk_index     integer not null,
  content         text not null,
  token_count     integer,
  metadata        jsonb not null default '{}'::jsonb,
  search_vector   tsvector generated always as
                    (to_tsvector('portuguese'::regconfig, coalesce(content, ''::text))) stored,
  created_at      timestamptz not null default now(),
  constraint knowledge_chunks_organization_id_fkey
    foreign key (organization_id) references public.organizations (id) on delete cascade,
  constraint knowledge_chunks_document_id_organization_id_fkey
    foreign key (document_id, organization_id)
    references public.knowledge_documents (id, organization_id) on delete cascade,
  constraint knowledge_chunks_project_id_organization_id_fkey
    foreign key (project_id, organization_id)
    references public.crm_projects (id, organization_id) on delete set null,
  constraint knowledge_chunks_chunk_index_check
    check (chunk_index >= 0),
  constraint knowledge_chunks_token_count_check
    check (token_count is null or token_count >= 0)
);

-- ---------------------------------------------------------------------------
-- 2.12) Telemetria de aprendizado da IA.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_learning_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  user_id          uuid,
  lead_id          uuid,
  provider         text not null,
  model            text not null,
  agent_id         text not null default 'PILOT_COPILOT'::text,
  task_kind        text,
  event_type       text not null,
  feedback         text,
  accepted         boolean,
  executed         boolean,
  converted        boolean,
  conversion_stage text,
  revenue          numeric,
  latency_ms       integer,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  constraint ai_learning_events_organization_id_fkey
    foreign key (organization_id) references public.organizations (id) on delete cascade,
  constraint ai_learning_events_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete set null,
  constraint ai_learning_events_lead_id_fkey
    foreign key (lead_id) references public.leads (id) on delete cascade,
  constraint ai_learning_events_provider_check
    check (provider = any (array['OPENAI'::text,'ANTHROPIC'::text,'GEMINI'::text,'DEEPSEEK'::text,'LOCAL'::text])),
  constraint ai_learning_events_event_type_check
    check (event_type = any (array['RESPONSE'::text,'FEEDBACK'::text,'ACTION_EXECUTED'::text,'STAGE_ADVANCED'::text,'CONVERSION'::text,'REVENUE'::text])),
  constraint ai_learning_events_feedback_check
    check (feedback is null or (feedback = any (array['HELPFUL'::text,'NOT_HELPFUL'::text,'EXCELLENT'::text,'INCORRECT'::text]))),
  constraint ai_learning_events_revenue_check
    check (revenue is null or revenue >= 0::numeric),
  constraint ai_learning_events_latency_ms_check
    check (latency_ms is null or latency_ms >= 0)
);

-- ===========================================================================
-- 3) RLS habilitada nas 23 tabelas.
--    Sem policy = negar tudo para anon/authenticated. As policies reais chegam
--    nas migrations posteriores. `service_role` continua passando (BYPASSRLS).
-- ===========================================================================
alter table public.organizations             enable row level security;
alter table public.profiles                  enable row level security;
alter table public.crm_projects              enable row level security;
alter table public.marketing_campaigns       enable row level security;
alter table public.import_batches            enable row level security;
alter table public.leads                     enable row level security;
alter table public.users                     enable row level security;
alter table public.projects                  enable row level security;
alter table public.activities                enable row level security;
alter table public.ai_scores                 enable row level security;
alter table public.customers                 enable row level security;
alter table public.tasks                     enable row level security;
alter table public.lead_events               enable row level security;
alter table public.lead_scores               enable row level security;
alter table public.pipeline_history          enable row level security;
alter table public.followups                 enable row level security;
alter table public.lead_distribution_history enable row level security;
alter table public.inventory_units           enable row level security;
alter table public.marketing_spend           enable row level security;
alter table public.lead_objections           enable row level security;
alter table public.knowledge_documents       enable row level security;
alter table public.knowledge_chunks          enable row level security;
alter table public.ai_learning_events        enable row level security;

-- ===========================================================================
-- 4) Índices nas chaves estrangeiras.
--    Postgres indexa automaticamente o LADO REFERENCIADO (via unique/PK), nunca
--    o lado que referencia. Sem estes índices, todo `on delete` do pai faz
--    varredura completa do filho e todo join fica caro.
-- ===========================================================================
create index if not exists profiles_organization_id_idx
  on public.profiles (organization_id);

create index if not exists crm_projects_organization_id_idx
  on public.crm_projects (organization_id);

create index if not exists marketing_campaigns_organization_id_idx
  on public.marketing_campaigns (organization_id);
create index if not exists marketing_campaigns_project_tenant_idx
  on public.marketing_campaigns (project_id, organization_id);

create index if not exists import_batches_organization_id_idx
  on public.import_batches (organization_id);
create index if not exists import_batches_created_by_idx
  on public.import_batches (created_by);

create index if not exists leads_organization_id_idx
  on public.leads (organization_id);
create index if not exists leads_assigned_user_id_idx
  on public.leads (assigned_user_id);
create index if not exists leads_import_batch_id_idx
  on public.leads (import_batch_id);
create index if not exists leads_project_tenant_idx
  on public.leads (project_id, organization_id);
create index if not exists leads_campaign_tenant_idx
  on public.leads (campaign_id, organization_id);

create index if not exists activities_lead_id_idx
  on public.activities (lead_id);

create index if not exists ai_scores_lead_id_idx
  on public.ai_scores (lead_id);

create index if not exists customers_lead_id_idx
  on public.customers (lead_id);
create index if not exists customers_organization_id_idx
  on public.customers (organization_id);

create index if not exists tasks_lead_id_idx
  on public.tasks (lead_id);
create index if not exists tasks_user_id_idx
  on public.tasks (user_id);
create index if not exists tasks_organization_id_idx
  on public.tasks (organization_id);

create index if not exists lead_events_lead_id_idx
  on public.lead_events (lead_id);
create index if not exists lead_events_created_by_idx
  on public.lead_events (created_by);
create index if not exists lead_events_organization_id_idx
  on public.lead_events (organization_id);

create index if not exists lead_scores_lead_id_idx
  on public.lead_scores (lead_id);
create index if not exists lead_scores_organization_id_idx
  on public.lead_scores (organization_id);

create index if not exists pipeline_history_lead_id_idx
  on public.pipeline_history (lead_id);
create index if not exists pipeline_history_changed_by_idx
  on public.pipeline_history (changed_by);
create index if not exists pipeline_history_organization_id_idx
  on public.pipeline_history (organization_id);

create index if not exists followups_lead_id_idx
  on public.followups (lead_id);
create index if not exists followups_user_id_idx
  on public.followups (user_id);
create index if not exists followups_organization_id_idx
  on public.followups (organization_id);

create index if not exists lead_distribution_history_organization_id_idx
  on public.lead_distribution_history (organization_id);
create index if not exists lead_distribution_history_lead_id_idx
  on public.lead_distribution_history (lead_id);
create index if not exists lead_distribution_history_assigned_user_id_idx
  on public.lead_distribution_history (assigned_user_id);

create index if not exists inventory_units_organization_id_idx
  on public.inventory_units (organization_id);
create index if not exists inventory_units_project_tenant_idx
  on public.inventory_units (project_id, organization_id);

create index if not exists marketing_spend_organization_id_idx
  on public.marketing_spend (organization_id);
create index if not exists marketing_spend_campaign_tenant_idx
  on public.marketing_spend (campaign_id, organization_id);

create index if not exists lead_objections_organization_id_idx
  on public.lead_objections (organization_id);
create index if not exists lead_objections_lead_tenant_idx
  on public.lead_objections (lead_id, organization_id);
create index if not exists lead_objections_created_by_idx
  on public.lead_objections (created_by);
create index if not exists lead_objections_resolved_by_idx
  on public.lead_objections (resolved_by);

create index if not exists knowledge_documents_organization_id_idx
  on public.knowledge_documents (organization_id);
create index if not exists knowledge_documents_project_tenant_idx
  on public.knowledge_documents (project_id, organization_id);
create index if not exists knowledge_documents_created_by_idx
  on public.knowledge_documents (created_by);

create index if not exists knowledge_chunks_organization_id_idx
  on public.knowledge_chunks (organization_id);
create index if not exists knowledge_chunks_document_tenant_idx
  on public.knowledge_chunks (document_id, organization_id);
create index if not exists knowledge_chunks_project_tenant_idx
  on public.knowledge_chunks (project_id, organization_id);

create index if not exists ai_learning_events_organization_id_idx
  on public.ai_learning_events (organization_id);
create index if not exists ai_learning_events_user_id_idx
  on public.ai_learning_events (user_id);
create index if not exists ai_learning_events_lead_id_idx
  on public.ai_learning_events (lead_id);

commit;
