begin;

create table public.lead_experience_signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  broker_id uuid references public.profiles(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  signal_type text not null check (signal_type in ('slow_response','service_complaint','broker_rejection','general_friction')),
  severity text not null check (severity in ('low','medium','high','critical')),
  confidence numeric(5,2) not null check (confidence between 0 and 100),
  evidence text not null,
  recommendation text not null check (recommendation in ('keep_with_recovery','offer_broker_change','manager_review')),
  suggested_reply text,
  status text not null default 'pending' check (status in ('pending','keep','change_requested','resolved','dismissed')),
  decision_by uuid references public.profiles(id) on delete set null,
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index lead_experience_signals_pending_idx on public.lead_experience_signals (organization_id, status, severity, created_at desc);
create unique index lead_experience_signals_message_unique on public.lead_experience_signals (message_id);
alter table public.lead_experience_signals enable row level security;
create policy lead_experience_signals_scope on public.lead_experience_signals for select to authenticated
using (organization_id = (select public.current_organization_id()) and (select private.can_access_commercial_lead(organization_id, broker_id)));
revoke all on public.lead_experience_signals from anon;
revoke insert, update, delete on public.lead_experience_signals from authenticated;
grant select on public.lead_experience_signals to authenticated;
grant select, insert, update, delete on public.lead_experience_signals to service_role;

create table public.external_sales_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null unique references public.leads(id) on delete cascade,
  broker_id uuid references public.profiles(id) on delete set null,
  external_company text,
  external_project text,
  estimated_value numeric(16,2),
  purchase_date date,
  reason_summary text,
  evidence_status text not null default 'declared' check (evidence_status in ('declared','reviewing','verified','discarded')),
  director_notes text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index external_sales_records_director_idx on public.external_sales_records (organization_id, evidence_status, purchase_date desc, created_at desc);
alter table public.external_sales_records enable row level security;
create policy external_sales_director_scope on public.external_sales_records for select to authenticated
using (
  organization_id = (select public.current_organization_id())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.organization_id = (select public.current_organization_id()) and coalesce(p.commercial_role, case when p.role = 'admin' then 'director' else p.role end) = 'director')
);
revoke all on public.external_sales_records from anon;
revoke insert, update, delete on public.external_sales_records from authenticated;
grant select on public.external_sales_records to authenticated;
grant select, insert, update, delete on public.external_sales_records to service_role;

create or replace function private.capture_external_sale_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'comprou_outro' and old.status is distinct from new.status then
    insert into public.external_sales_records (organization_id, lead_id, broker_id, reason_summary, created_by)
    values (new.organization_id, new.id, new.assigned_to, left(coalesce(new.notes, ''), 4000), (select auth.uid()))
    on conflict (lead_id) do update set broker_id = excluded.broker_id, reason_summary = excluded.reason_summary, updated_at = now();
  end if;
  return new;
end;
$$;
revoke all on function private.capture_external_sale_profile() from public, anon, authenticated;
drop trigger if exists leads_capture_external_sale on public.leads;
create trigger leads_capture_external_sale after update of status on public.leads
for each row execute function private.capture_external_sale_profile();

insert into public.external_sales_records (organization_id, lead_id, broker_id, reason_summary)
select organization_id, id, assigned_to, left(coalesce(notes, ''), 4000) from public.leads where status = 'comprou_outro'
on conflict (lead_id) do nothing;

commit;
