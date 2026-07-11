-- Atlas AI V2 — Marketing, automações e comunicação omnichannel

create extension if not exists pgcrypto;

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('meta','whatsapp','google','calendar','sheets','n8n','make','custom')),
  name text not null,
  status text not null default 'disconnected' check (status in ('disconnected','connected','degraded','error')),
  external_account_id text,
  config jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, name)
);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  trigger_type text not null,
  trigger_config jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  requires_approval boolean not null default true,
  run_count bigint not null default 0,
  failure_count bigint not null default 0,
  last_run_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','email','sms','instagram','messenger')),
  name text not null,
  category text not null default 'utility',
  language text not null default 'pt_BR',
  subject text,
  body text not null,
  variables jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','pending','approved','rejected','archived')),
  external_template_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, channel, name, language)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null,
  external_thread_id text,
  status text not null default 'open' check (status in ('open','pending','resolved','archived')),
  assigned_to uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  channel text not null,
  sender text,
  recipient text,
  content text,
  media jsonb not null default '[]'::jsonb,
  status text not null default 'queued' check (status in ('queued','sent','delivered','read','failed','received')),
  external_message_id text,
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.creative_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  name text not null,
  format text not null,
  channel text,
  headline text,
  primary_text text,
  description text,
  call_to_action text,
  asset_url text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','review','approved','published','rejected','archived')),
  performance_score numeric(5,2),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  event_type text not null,
  source text not null,
  external_event_id text,
  value numeric(14,2),
  currency text default 'BRL',
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, source, external_event_id)
);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_type text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired','cancelled')),
  requested_by uuid references public.profiles(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  decision_reason text,
  expires_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_integrations_org_provider on public.integrations (organization_id, provider);
create index if not exists idx_automation_rules_org_status on public.automation_rules (organization_id, status);
create index if not exists idx_conversations_org_updated on public.conversations (organization_id, updated_at desc);
create index if not exists idx_messages_conversation_created on public.messages (conversation_id, created_at desc);
create index if not exists idx_campaign_events_campaign_occurred on public.campaign_events (campaign_id, occurred_at desc);
create index if not exists idx_approval_requests_org_status on public.approval_requests (organization_id, status, created_at desc);

alter table public.integrations enable row level security;
alter table public.automation_rules enable row level security;
alter table public.message_templates enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.creative_assets enable row level security;
alter table public.campaign_events enable row level security;
alter table public.approval_requests enable row level security;

-- Reuse the organization membership model established by the Atlas V3 foundation.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['integrations','automation_rules','message_templates','conversations','messages','creative_assets','campaign_events','approval_requests']
  loop
    execute format('drop policy if exists atlas_org_isolation on public.%I', table_name);
    execute format($policy$
      create policy atlas_org_isolation on public.%I
      for all to authenticated
      using (organization_id in (select organization_id from public.profiles where id = auth.uid()))
      with check (organization_id in (select organization_id from public.profiles where id = auth.uid()))
    $policy$, table_name);
  end loop;
end $$;
