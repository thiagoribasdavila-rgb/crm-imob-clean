begin;

create table public.developer_payment_flow_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  developer_name text not null,
  version integer not null default 1,
  rule_name text not null,
  payment_flow text not null,
  down_payment_percent numeric(6,3),
  installments_count integer,
  balloon_payment_notes text,
  financing_notes text,
  valid_from date,
  valid_until date,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, developer_name, version),
  check (down_payment_percent is null or down_payment_percent between 0 and 100),
  check (installments_count is null or installments_count between 0 and 600),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create unique index developer_payment_rule_one_active_idx on public.developer_payment_flow_rules (organization_id, lower(developer_name)) where active;
create index developer_payment_rule_lookup_idx on public.developer_payment_flow_rules (organization_id, developer_name, created_at desc);
alter table public.developer_payment_flow_rules enable row level security;
create policy developer_payment_rules_read on public.developer_payment_flow_rules for select to authenticated
using (organization_id = (select public.current_organization_id()));
revoke all on public.developer_payment_flow_rules from anon;
revoke insert, update, delete on public.developer_payment_flow_rules from authenticated;
grant select on public.developer_payment_flow_rules to authenticated;
grant select, insert, update, delete on public.developer_payment_flow_rules to service_role;

commit;
