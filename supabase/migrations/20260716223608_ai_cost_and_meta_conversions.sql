begin;

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  feature text not null,
  task text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.meta_conversion_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  dataset_id text not null,
  mode text not null default 'test' check (mode in ('test','live')),
  enabled boolean not null default false,
  test_event_code text,
  consent_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meta_conversion_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_name text not null,
  event_id text not null,
  action_source text not null default 'system_generated',
  status text not null default 'pending' check (status in ('pending','processing','delivered','failed','blocked','dead_letter')),
  custom_data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  attempts integer not null default 0,
  meta_response jsonb,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, event_id)
);

create index if not exists ai_usage_events_org_created_idx on public.ai_usage_events (organization_id, created_at desc);
create index if not exists ai_usage_events_org_feature_idx on public.ai_usage_events (organization_id, feature, provider, created_at desc);
create index if not exists meta_conversion_events_delivery_idx on public.meta_conversion_events (organization_id, status, occurred_at);

alter table public.ai_usage_events enable row level security;
alter table public.meta_conversion_configs enable row level security;
alter table public.meta_conversion_events enable row level security;

create policy ai_usage_events_select_org on public.ai_usage_events for select to authenticated
using (organization_id = (select public.current_organization_id()));
create policy meta_conversion_configs_select_org on public.meta_conversion_configs for select to authenticated
using (organization_id = (select public.current_organization_id()));
create policy meta_conversion_events_select_org on public.meta_conversion_events for select to authenticated
using (organization_id = (select public.current_organization_id()));

revoke insert, update, delete on public.ai_usage_events, public.meta_conversion_configs, public.meta_conversion_events from anon, authenticated;
grant select on public.ai_usage_events, public.meta_conversion_configs, public.meta_conversion_events to authenticated;

commit;
