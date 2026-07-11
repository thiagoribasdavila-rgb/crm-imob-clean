begin;

create table if not exists public.atlas_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  decision_type text not null,
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status text not null default 'proposed' check (status in ('proposed','approved','rejected','executing','completed','failed','cancelled')),
  title text not null,
  rationale text,
  recommended_action jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  confidence numeric(5,2) check (confidence is null or (confidence >= 0 and confidence <= 100)),
  requires_approval boolean not null default true,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  executed_at timestamptz,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.atlas_agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_key text not null,
  objective text not null,
  status text not null default 'queued' check (status in ('queued','running','waiting_approval','completed','failed','cancelled')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  decision_id uuid references public.atlas_decisions(id) on delete set null,
  correlation_id text,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.digital_twin_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  twin_type text not null check (twin_type in ('buyer','property','development','investor','market','campaign','broker')),
  entity_id uuid,
  version integer not null default 1,
  state jsonb not null default '{}'::jsonb,
  signals jsonb not null default '[]'::jsonb,
  quality_score numeric(5,2),
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (organization_id, twin_type, entity_id, version)
);

create table if not exists public.atlas_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  source text not null,
  aggregate_type text,
  aggregate_id uuid,
  payload jsonb not null default '{}'::jsonb,
  correlation_id text,
  causation_id uuid,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_atlas_decisions_org_status on public.atlas_decisions (organization_id, status, priority, created_at desc);
create index if not exists idx_atlas_agent_runs_org_status on public.atlas_agent_runs (organization_id, status, created_at desc);
create index if not exists idx_digital_twin_lookup on public.digital_twin_snapshots (organization_id, twin_type, entity_id, generated_at desc);
create index if not exists idx_atlas_events_org_type on public.atlas_events (organization_id, event_type, occurred_at desc);

alter table public.atlas_decisions enable row level security;
alter table public.atlas_agent_runs enable row level security;
alter table public.digital_twin_snapshots enable row level security;
alter table public.atlas_events enable row level security;

create policy "tenant atlas decisions" on public.atlas_decisions
for all using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

create policy "tenant atlas agent runs" on public.atlas_agent_runs
for all using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

create policy "tenant digital twins" on public.digital_twin_snapshots
for all using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

create policy "tenant atlas events" on public.atlas_events
for all using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

commit;
