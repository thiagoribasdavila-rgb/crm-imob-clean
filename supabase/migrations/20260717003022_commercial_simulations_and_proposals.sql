begin;

create table public.commercial_simulations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade, property_id uuid not null references public.properties(id),
  development_id uuid references public.developments(id), payment_rule_id uuid not null references public.developer_payment_flow_rules(id),
  created_by uuid not null references public.profiles(id), property_price numeric(16,2) not null,
  down_payment numeric(16,2), financed_balance numeric(16,2), installment_amount numeric(16,2), installments_count integer,
  rule_snapshot jsonb not null, status text not null default 'draft' check (status in ('draft','proposal_review','approved','rejected','expired')),
  valid_until timestamptz not null default (now() + interval '24 hours'), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index commercial_simulations_lead_idx on public.commercial_simulations (organization_id, lead_id, created_at desc);
alter table public.commercial_simulations enable row level security;
create policy commercial_simulations_scope on public.commercial_simulations for select to authenticated using (
  organization_id = (select public.current_organization_id()) and exists (select 1 from public.leads l where l.id = lead_id and (select private.can_view_commercial_profile(l.assigned_to)))
);
revoke all on public.commercial_simulations from anon;
revoke insert, update, delete on public.commercial_simulations from authenticated;
grant select on public.commercial_simulations to authenticated;
grant select, insert, update, delete on public.commercial_simulations to service_role;

commit;
