begin;

alter table public.atlas_memories
  add column if not exists source text not null default 'atlas',
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.atlas_recommendations
  add column if not exists recommendation_key text,
  add column if not exists accepted_by uuid references public.profiles(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists executed_at timestamptz,
  add column if not exists result jsonb;

create unique index if not exists uq_atlas_recommendations_key
  on public.atlas_recommendations (organization_id, recommendation_key)
  where recommendation_key is not null;

create index if not exists idx_atlas_recommendations_active
  on public.atlas_recommendations (organization_id, status, confidence desc, created_at desc);

create table if not exists public.atlas_api_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  client_key text not null unique,
  secret_hash text not null,
  scopes text[] not null default '{}',
  rate_limit_per_minute integer not null default 120,
  active boolean not null default true,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.atlas_launch_rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  development_id uuid references public.developments(id) on delete set null,
  name text not null,
  slug text not null,
  status text not null default 'draft' check (status in ('draft','prelaunch','launch','selling','paused','sold_out','archived')),
  launch_at timestamptz,
  sales_target integer,
  vgv_target numeric(16,2),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists public.atlas_inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  status text not null default 'held' check (status in ('held','confirmed','expired','cancelled','converted')),
  hold_expires_at timestamptz,
  source text not null default 'atlas',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_active_property_reservation
  on public.atlas_inventory_reservations (organization_id, property_id)
  where status in ('held','confirmed');

alter table public.atlas_api_clients enable row level security;
alter table public.atlas_launch_rooms enable row level security;
alter table public.atlas_inventory_reservations enable row level security;

create policy "tenant atlas api clients" on public.atlas_api_clients for all
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

create policy "tenant atlas launch rooms" on public.atlas_launch_rooms for all
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

create policy "tenant atlas inventory reservations" on public.atlas_inventory_reservations for all
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

commit;
