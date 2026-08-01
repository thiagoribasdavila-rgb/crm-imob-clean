-- Ingestão de leads de portais imobiliários (ZAP/Viva Real, OLX, etc.)
-- Espelha o par Meta (meta_lead_sources + meta_lead_events): mapeia a conta do
-- portal → organização, guarda o segredo de assinatura por fonte, e persiste
-- cada lead recebido com dedup para alimentar o outbox (topic portal.lead.ingest).

create table if not exists public.portal_lead_sources(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check(provider in ('zap_imoveis','vivareal','olx_imoveis','quintoandar','imovelweb','chavesnamao')),
  external_account_id text not null,
  secret text not null,
  default_owner_id uuid references public.profiles(id),
  name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, external_account_id)
);
create index if not exists portal_lead_sources_org_idx on public.portal_lead_sources(organization_id);

create table if not exists public.portal_lead_events(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id uuid not null references public.portal_lead_sources(id) on delete cascade,
  provider text not null,
  external_lead_id text not null,
  listing_id text,
  contact jsonb,
  payload jsonb not null,
  status text not null default 'received' check(status in ('received','processing','imported','failed','dead_letter')),
  lead_id uuid references public.leads(id),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(organization_id, provider, external_lead_id)
);
create index if not exists portal_lead_events_org_idx on public.portal_lead_events(organization_id, created_at desc);
create index if not exists portal_lead_events_source_idx on public.portal_lead_events(source_id);

alter table public.portal_lead_sources enable row level security;
alter table public.portal_lead_events enable row level security;

create policy portal_sources_manage on public.portal_lead_sources for all to authenticated
  using(organization_id=(select public.current_organization_id()) and exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.commercial_role,case when p.role='admin' then 'director' else p.role end) in ('director','superintendent','manager')))
  with check(organization_id=(select public.current_organization_id()) and exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.commercial_role,case when p.role='admin' then 'director' else p.role end) in ('director','superintendent','manager')));

create policy portal_events_org_read on public.portal_lead_events for select to authenticated
  using(organization_id=(select public.current_organization_id()));

revoke all on public.portal_lead_sources from anon, authenticated;
revoke all on public.portal_lead_events from anon, authenticated;
grant select, insert, update, delete on public.portal_lead_sources to authenticated;
grant select on public.portal_lead_events to authenticated;
