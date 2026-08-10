begin;

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'ACTIVE',
  plan text not null default 'founder',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null default 'Usuário Atlas',
  name text,
  email text,
  phone text,
  role text not null default 'broker',
  active boolean not null default true,
  team text,
  max_active_leads integer not null default 100,
  availability_status text not null default 'AVAILABLE',
  manager_id uuid references public.profiles(id) on delete set null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.active
  limit 1
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(coalesce(p.role, ''))
  from public.profiles p
  where p.id = (select auth.uid())
    and p.active
  limit 1
$$;

revoke all on function public.current_organization_id() from public, anon;
revoke all on function public.current_user_role() from public, anon;
grant execute on function public.current_organization_id() to authenticated, service_role;
grant execute on function public.current_user_role() to authenticated, service_role;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  company text,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Canonical commercial project source used by the V30 repositories and the
-- audited project mutation RPC introduced later in the migration chain.
create table if not exists public.crm_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  developer_name text,
  code text,
  status text not null default 'ACTIVE',
  city text,
  neighborhood text,
  address text,
  launch_date date,
  delivery_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_projects_id_organization_unique unique (id, organization_id),
  constraint crm_projects_status_check
    check (status in ('ACTIVE', 'PAUSED', 'SOLD_OUT', 'ARCHIVED')),
  constraint crm_projects_date_range_check
    check (delivery_date is null or launch_date is null or delivery_date >= launch_date)
);

create index if not exists crm_projects_organization_status_idx
  on public.crm_projects(organization_id, status);

create index if not exists crm_projects_organization_name_idx
  on public.crm_projects(organization_id, name);

create table if not exists public.developments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  developer_name text,
  project_code text,
  slug text,
  address text,
  city text,
  state text,
  neighborhood text,
  status text not null default 'ACTIVE',
  launch_date date,
  delivery_date date,
  units_total integer,
  units_available integer,
  vgv numeric(16,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  development_id uuid references public.developments(id) on delete set null,
  title text,
  unit text,
  tower text,
  floor text,
  typology text,
  bedrooms integer,
  bathrooms integer,
  parking_spaces integer,
  private_area numeric(12,2),
  price numeric(16,2),
  status text not null default 'AVAILABLE',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  development_id uuid references public.developments(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  name text not null,
  channel text,
  platform text,
  external_campaign_id text,
  status text not null default 'DRAFT',
  budget numeric(16,2),
  spend numeric(16,2) not null default 0,
  leads_count integer not null default 0,
  sales_count integer not null default 0,
  revenue numeric(16,2) not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  project text,
  project_id uuid references public.projects(id) on delete set null,
  development_id uuid references public.developments(id) on delete set null,
  source text,
  campaign text,
  campaign_id uuid references public.campaigns(id) on delete set null,
  status text not null default 'NOVO',
  score_ia integer not null default 0,
  classificacao_ia text,
  temperature text,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  last_interaction_at timestamptz,
  next_action_at timestamptz,
  notes text,
  next_action text,
  next_contact timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  name text not null,
  email text,
  phone text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  stage text not null default 'NEW',
  status text not null default 'OPEN',
  value numeric(16,2),
  probability numeric(7,4),
  expected_close_at timestamptz,
  won_at timestamptz,
  lost_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pipeline (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  stage text not null default 'NEW',
  previous_stage text,
  status text not null default 'OPEN',
  position integer not null default 0,
  value numeric(16,2),
  probability numeric(7,4),
  expected_close_at timestamptz,
  entered_at timestamptz not null default now(),
  exited_at timestamptz,
  assigned_to uuid references public.profiles(id) on delete set null,
  changed_by uuid references public.profiles(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  type text not null,
  title text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  event_type text not null,
  type text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_events_org_created_idx
  on public.lead_events (organization_id, created_at desc);
create index if not exists lead_events_lead_created_idx
  on public.lead_events (organization_id, lead_id, created_at desc);
create index if not exists lead_events_type_created_idx
  on public.lead_events (organization_id, event_type, created_at desc);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'OPEN',
  priority text not null default 'NORMAL',
  due_date date,
  due_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  development_id uuid references public.developments(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  unit text,
  tower text,
  floor text,
  typology text,
  private_area numeric(12,2),
  price numeric(16,2),
  status text not null default 'AVAILABLE',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  type text not null,
  title text,
  summary text,
  content text,
  recommendation text,
  score numeric(8,4),
  confidence numeric(7,4),
  status text not null default 'OPEN',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  module text,
  resource_type text,
  resource_id uuid,
  ip inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations', 'profiles', 'projects', 'crm_projects', 'developments', 'properties',
    'campaigns', 'leads', 'customers', 'opportunities', 'pipeline',
    'activities', 'lead_events', 'tasks', 'units', 'ai_insights', 'audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end
$$;

drop policy if exists lead_events_select_organization on public.lead_events;
create policy lead_events_select_organization
  on public.lead_events for select to authenticated
  using (organization_id = (select public.current_organization_id()));

drop policy if exists lead_events_insert_organization on public.lead_events;
create policy lead_events_insert_organization
  on public.lead_events for insert to authenticated
  with check (
    organization_id = (select public.current_organization_id())
    and created_by = (select auth.uid())
  );

revoke update, delete on public.lead_events from authenticated;

commit;
