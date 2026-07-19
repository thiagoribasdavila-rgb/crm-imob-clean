begin;

create table if not exists public.homologation_backup_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  environment text not null check (environment in ('homologation', 'production')),
  provider text not null check (char_length(provider) between 2 and 80),
  snapshot_reference text not null check (char_length(snapshot_reference) between 4 and 240),
  snapshot_created_at timestamptz not null,
  restore_status text not null default 'pending' check (restore_status in ('pending', 'passed', 'failed')),
  restore_tested_at timestamptz,
  restore_duration_minutes integer check (restore_duration_minutes is null or restore_duration_minutes between 0 and 10080),
  evidence_reference text check (evidence_reference is null or char_length(evidence_reference) <= 500),
  notes text check (notes is null or char_length(notes) <= 2000),
  responsible_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    restore_status = 'pending'
    or (restore_tested_at is not null and evidence_reference is not null)
  )
);

create index if not exists homologation_backup_evidence_org_created_idx
  on public.homologation_backup_evidence (organization_id, snapshot_created_at desc);

alter table public.homologation_backup_evidence enable row level security;

create policy homologation_backup_director_select on public.homologation_backup_evidence
for select to authenticated using (
  organization_id = (select public.current_organization_id())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.role = 'admin' or p.commercial_role = 'director'))
);

create policy homologation_backup_director_insert on public.homologation_backup_evidence
for insert to authenticated with check (
  organization_id = (select public.current_organization_id())
  and responsible_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.role = 'admin' or p.commercial_role = 'director'))
);

create policy homologation_backup_director_update on public.homologation_backup_evidence
for update to authenticated using (
  organization_id = (select public.current_organization_id())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.role = 'admin' or p.commercial_role = 'director'))
) with check (
  organization_id = (select public.current_organization_id())
  and responsible_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.role = 'admin' or p.commercial_role = 'director'))
);

revoke all on public.homologation_backup_evidence from anon;
grant select, insert, update on public.homologation_backup_evidence to authenticated;

commit;
