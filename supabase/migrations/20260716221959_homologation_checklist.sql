begin;

create table if not exists public.homologation_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  check_key text not null check (char_length(check_key) between 3 and 100),
  outcome text not null check (outcome in ('passed', 'failed')),
  notes text check (notes is null or char_length(notes) <= 1000),
  verified_by uuid not null references public.profiles(id),
  verified_at timestamptz not null default now(),
  unique (organization_id, check_key, verified_by)
);

create index if not exists homologation_results_org_verified_idx
  on public.homologation_results (organization_id, verified_at desc);

alter table public.homologation_results enable row level security;

create policy homologation_results_select_scope on public.homologation_results
for select to authenticated
using (
  organization_id = (select public.current_organization_id())
  and (
    verified_by = (select auth.uid())
    or (select private.can_view_commercial_profile(verified_by))
  )
);

create policy homologation_results_insert_own on public.homologation_results
for insert to authenticated
with check (
  organization_id = (select public.current_organization_id())
  and verified_by = (select auth.uid())
);

create policy homologation_results_update_own on public.homologation_results
for update to authenticated
using (organization_id = (select public.current_organization_id()) and verified_by = (select auth.uid()))
with check (organization_id = (select public.current_organization_id()) and verified_by = (select auth.uid()));

revoke all on public.homologation_results from anon;
grant select, insert, update on public.homologation_results to authenticated;

commit;
