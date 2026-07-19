begin;

create table public.ai_sales_journeys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  broker_id uuid not null references public.profiles(id),
  development_id uuid references public.developments(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  stage text not null default 'approach' check (stage in ('approach','discovery','qualification','simulation','proposal_review','completed','paused')),
  status text not null default 'eligible' check (status in ('eligible','pending_approval','active','waiting_customer','waiting_broker','completed','paused','opted_out')),
  last_message_id uuid references public.messages(id) on delete set null,
  next_run_at timestamptz,
  consent_basis text not null,
  context_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, lead_id)
);

create index ai_sales_journeys_due_idx on public.ai_sales_journeys (organization_id, status, next_run_at);
alter table public.ai_sales_journeys enable row level security;
create policy ai_sales_journeys_scope on public.ai_sales_journeys for select to authenticated
using (organization_id = (select public.current_organization_id()) and (select private.can_view_commercial_profile(broker_id)));
revoke all on public.ai_sales_journeys from anon;
revoke insert, update, delete on public.ai_sales_journeys from authenticated;
grant select on public.ai_sales_journeys to authenticated;
grant select, insert, update, delete on public.ai_sales_journeys to service_role;

commit;
