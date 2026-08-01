begin;

create table if not exists public.hostinger_restart_drills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'waiting_restart' check (status in ('waiting_restart', 'passed', 'failed')),
  before_boot_id uuid not null,
  after_boot_id uuid,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  recovery_seconds integer check (recovery_seconds is null or recovery_seconds between 0 and 86400),
  ready_after_restart boolean,
  log_evidence_reference text check (log_evidence_reference is null or char_length(log_evidence_reference) <= 500),
  notes text check (notes is null or char_length(notes) <= 2000),
  responsible_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'waiting_restart' or (completed_at is not null and after_boot_id is not null and log_evidence_reference is not null)),
  check (status <> 'passed' or before_boot_id <> after_boot_id)
);

create index if not exists hostinger_restart_drills_org_created_idx on public.hostinger_restart_drills (organization_id, created_at desc);
alter table public.hostinger_restart_drills enable row level security;

create policy hostinger_restart_director_select on public.hostinger_restart_drills for select to authenticated using (
  organization_id = (select public.current_organization_id())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.role = 'admin' or p.commercial_role = 'director'))
);
create policy hostinger_restart_director_insert on public.hostinger_restart_drills for insert to authenticated with check (
  organization_id = (select public.current_organization_id()) and responsible_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.role = 'admin' or p.commercial_role = 'director'))
);
create policy hostinger_restart_director_update on public.hostinger_restart_drills for update to authenticated using (
  organization_id = (select public.current_organization_id()) and responsible_id = (select auth.uid())
) with check (organization_id = (select public.current_organization_id()) and responsible_id = (select auth.uid()));

revoke all on public.hostinger_restart_drills from anon;
grant select, insert, update on public.hostinger_restart_drills to authenticated;
commit;
