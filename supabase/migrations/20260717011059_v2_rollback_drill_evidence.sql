begin;

create table if not exists public.v2_rollback_drills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  backup_evidence_id uuid not null references public.homologation_backup_evidence(id),
  source_environment text not null default 'v3-homologation' check (source_environment = 'v3-homologation'),
  target_v2_url text not null check (target_v2_url ~ '^https://'),
  execution_mode text not null default 'simulation' check (execution_mode = 'simulation'),
  status text not null check (status in ('passed', 'failed')),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 0 and 1440),
  v3_preserved boolean not null default true check (v3_preserved),
  health_check_status integer check (health_check_status between 100 and 599),
  evidence_reference text not null check (char_length(evidence_reference) between 4 and 500),
  notes text check (notes is null or char_length(notes) <= 2000),
  responsible_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (completed_at >= started_at)
);

create index if not exists v2_rollback_drills_org_created_idx
  on public.v2_rollback_drills (organization_id, created_at desc);

alter table public.v2_rollback_drills enable row level security;

create policy v2_rollback_drills_director_select on public.v2_rollback_drills
for select to authenticated using (
  organization_id = (select public.current_organization_id())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.role = 'admin' or p.commercial_role = 'director'))
);

create policy v2_rollback_drills_director_insert on public.v2_rollback_drills
for insert to authenticated with check (
  organization_id = (select public.current_organization_id())
  and responsible_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.role = 'admin' or p.commercial_role = 'director'))
);

create or replace function private.enforce_rollback_backup_evidence()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.homologation_backup_evidence backup
    where backup.id = new.backup_evidence_id
      and backup.organization_id = new.organization_id
      and backup.restore_status = 'passed'
  ) then
    raise exception 'Rollback exige backup restaurado da mesma empresa.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_rollback_backup_evidence() from public, anon, authenticated;
create trigger enforce_rollback_backup_evidence
before insert or update of organization_id, backup_evidence_id on public.v2_rollback_drills
for each row execute function private.enforce_rollback_backup_evidence();

revoke all on public.v2_rollback_drills from anon;
grant select, insert on public.v2_rollback_drills to authenticated;

commit;
