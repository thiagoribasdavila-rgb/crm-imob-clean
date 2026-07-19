begin;

create table public.lead_reactivation_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  development_id uuid references public.developments(id) on delete set null,
  name text not null,
  source_type text not null check (source_type in ('company_legacy','broker_external')),
  status text not null default 'imported' check (status in ('imported','pending_approval','approved','queued','running','completed','rejected')),
  consent_basis text,
  template_name text,
  template_language text not null default 'pt_BR',
  imported_count integer not null default 0,
  eligible_count integer not null default 0,
  queued_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lead_reactivation_contacts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.lead_reactivation_batches(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  phone text not null,
  status text not null default 'imported' check (status in ('imported','blocked','pending_approval','queued','sent','replied','failed')),
  block_reason text,
  message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (batch_id, phone)
);

create table public.messaging_suppressions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null default 'whatsapp',
  recipient text not null,
  reason text not null default 'opt_out',
  source text not null default 'customer_request',
  created_at timestamptz not null default now(),
  unique (organization_id, channel, recipient)
);

create index lead_reactivation_batches_owner_idx on public.lead_reactivation_batches (organization_id, owner_id, created_at desc);
create index lead_reactivation_contacts_status_idx on public.lead_reactivation_contacts (batch_id, status);
create index messaging_suppressions_lookup_idx on public.messaging_suppressions (organization_id, channel, recipient);

alter table public.lead_reactivation_batches enable row level security;
alter table public.lead_reactivation_contacts enable row level security;
alter table public.messaging_suppressions enable row level security;

create policy lead_reactivation_batches_scope on public.lead_reactivation_batches for select to authenticated
using (organization_id = (select public.current_organization_id()) and (select private.can_view_commercial_profile(owner_id)));
create policy lead_reactivation_contacts_scope on public.lead_reactivation_contacts for select to authenticated
using (exists (select 1 from public.lead_reactivation_batches b where b.id = batch_id and b.organization_id = (select public.current_organization_id()) and (select private.can_view_commercial_profile(b.owner_id))));
revoke all on public.lead_reactivation_batches, public.lead_reactivation_contacts, public.messaging_suppressions from anon;
revoke insert, update, delete on public.lead_reactivation_batches, public.lead_reactivation_contacts, public.messaging_suppressions from authenticated;
revoke select on public.messaging_suppressions from authenticated;
grant select on public.lead_reactivation_batches, public.lead_reactivation_contacts to authenticated;
grant select, insert, update, delete on public.lead_reactivation_batches, public.lead_reactivation_contacts, public.messaging_suppressions to service_role;

commit;
