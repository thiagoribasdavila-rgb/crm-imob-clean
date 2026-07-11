begin;

create table if not exists public.atlas_entities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  external_key text,
  canonical_name text,
  attributes jsonb not null default '{}'::jsonb,
  confidence numeric(5,2) not null default 100,
  source text not null default 'atlas',
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entity_type, external_key)
);

create table if not exists public.atlas_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  from_entity_id uuid not null references public.atlas_entities(id) on delete cascade,
  relationship_type text not null,
  to_entity_id uuid not null references public.atlas_entities(id) on delete cascade,
  attributes jsonb not null default '{}'::jsonb,
  weight numeric(8,4) not null default 1,
  confidence numeric(5,2) not null default 100,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, from_entity_id, relationship_type, to_entity_id, valid_from)
);

create table if not exists public.atlas_memories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scope_type text not null check (scope_type in ('organization','user','lead','customer','property','development','campaign','agent','market')),
  scope_id uuid,
  memory_type text not null,
  content jsonb not null,
  importance numeric(5,2) not null default 50,
  confidence numeric(5,2) not null default 100,
  source_event_id uuid references public.atlas_events(id) on delete set null,
  expires_at timestamptz,
  superseded_by uuid references public.atlas_memories(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.atlas_simulations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  simulation_type text not null,
  name text not null,
  baseline jsonb not null default '{}'::jsonb,
  assumptions jsonb not null default '{}'::jsonb,
  scenarios jsonb not null default '[]'::jsonb,
  result jsonb,
  confidence numeric(5,2),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  requested_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.atlas_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recommendation_type text not null,
  subject_type text not null,
  subject_id uuid,
  title text not null,
  rationale text,
  recommendation jsonb not null,
  evidence jsonb not null default '[]'::jsonb,
  expected_impact jsonb not null default '{}'::jsonb,
  confidence numeric(5,2),
  status text not null default 'active' check (status in ('active','accepted','rejected','expired','executed')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.atlas_data_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_key text not null,
  name text not null,
  description text,
  schema_version text not null default '1.0.0',
  contract jsonb not null default '{}'::jsonb,
  owner_domain text not null,
  classification text not null default 'internal' check (classification in ('public','partner','internal','confidential','restricted')),
  quality_score numeric(5,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, product_key)
);

create index if not exists idx_atlas_entities_lookup on public.atlas_entities (organization_id, entity_type, canonical_name);
create index if not exists idx_atlas_relationships_from on public.atlas_relationships (organization_id, from_entity_id, relationship_type);
create index if not exists idx_atlas_relationships_to on public.atlas_relationships (organization_id, to_entity_id, relationship_type);
create index if not exists idx_atlas_memories_scope on public.atlas_memories (organization_id, scope_type, scope_id, created_at desc);
create index if not exists idx_atlas_simulations_org_status on public.atlas_simulations (organization_id, status, created_at desc);
create index if not exists idx_atlas_recommendations_subject on public.atlas_recommendations (organization_id, subject_type, subject_id, status);

alter table public.atlas_entities enable row level security;
alter table public.atlas_relationships enable row level security;
alter table public.atlas_memories enable row level security;
alter table public.atlas_simulations enable row level security;
alter table public.atlas_recommendations enable row level security;
alter table public.atlas_data_products enable row level security;

create policy "tenant atlas entities" on public.atlas_entities for all using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());
create policy "tenant atlas relationships" on public.atlas_relationships for all using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());
create policy "tenant atlas memories" on public.atlas_memories for all using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());
create policy "tenant atlas simulations" on public.atlas_simulations for all using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());
create policy "tenant atlas recommendations" on public.atlas_recommendations for all using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());
create policy "tenant atlas data products" on public.atlas_data_products for all using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());

commit;