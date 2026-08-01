begin;

create table if not exists public.meta_lead_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid references public.integrations(id) on delete set null,
  page_id text not null,
  form_id text,
  name text not null,
  active boolean not null default true,
  default_owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meta_lead_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id uuid not null references public.meta_lead_sources(id) on delete cascade,
  external_lead_id text not null unique,
  page_id text not null,
  form_id text,
  ad_id text,
  adset_id text,
  campaign_external_id text,
  status text not null default 'received' check (status in ('received','processing','imported','failed')),
  lead_id uuid references public.leads(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists meta_lead_sources_page_form_unique on public.meta_lead_sources (page_id, form_id) nulls not distinct;
create index if not exists meta_lead_sources_lookup_idx on public.meta_lead_sources (page_id, form_id) where active = true;
create index if not exists meta_lead_events_org_status_idx on public.meta_lead_events (organization_id, status, received_at desc);

alter table public.meta_lead_sources enable row level security;
alter table public.meta_lead_events enable row level security;

create policy meta_lead_sources_select_org on public.meta_lead_sources for select to authenticated
using (organization_id = (select public.current_organization_id()));
create policy meta_lead_events_select_org on public.meta_lead_events for select to authenticated
using (organization_id = (select public.current_organization_id()));

revoke insert, update, delete on public.meta_lead_sources, public.meta_lead_events from anon, authenticated;
grant select on public.meta_lead_sources, public.meta_lead_events to authenticated;

commit;
