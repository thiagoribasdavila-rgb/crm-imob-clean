begin;

create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  scope text not null,
  request_hash text,
  response_status integer,
  response_body jsonb,
  locked_until timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, scope, key)
);

create table if not exists public.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  topic text not null,
  aggregate_type text not null,
  aggregate_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','delivered','failed','dead_letter')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dead_letter_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  outbox_event_id uuid references public.integration_outbox(id) on delete set null,
  topic text not null,
  payload jsonb not null,
  error_message text not null,
  attempts integer not null default 0,
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  key text not null,
  enabled boolean not null default false,
  rollout_percentage integer not null default 100 check (rollout_percentage between 0 and 100),
  rules jsonb not null default '{}'::jsonb,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create index if not exists idx_idempotency_expiry on public.idempotency_keys(expires_at);
create index if not exists idx_outbox_delivery on public.integration_outbox(status, available_at);
create index if not exists idx_outbox_org_topic on public.integration_outbox(organization_id, topic);
create index if not exists idx_dlq_unresolved on public.dead_letter_events(organization_id, resolved, created_at desc);
create index if not exists idx_feature_flags_org on public.feature_flags(organization_id, key);

alter table public.idempotency_keys enable row level security;
alter table public.integration_outbox enable row level security;
alter table public.dead_letter_events enable row level security;
alter table public.feature_flags enable row level security;

create policy "tenant idempotency isolation" on public.idempotency_keys
for all using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

create policy "tenant outbox isolation" on public.integration_outbox
for all using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

create policy "tenant dlq isolation" on public.dead_letter_events
for all using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

create policy "tenant feature flags isolation" on public.feature_flags
for select using (organization_id is null or organization_id = public.current_organization_id());

create policy "tenant feature flags management" on public.feature_flags
for all using (
  organization_id = public.current_organization_id()
  and public.current_user_role() in ('admin','manager')
)
with check (
  organization_id = public.current_organization_id()
  and public.current_user_role() in ('admin','manager')
);

commit;
