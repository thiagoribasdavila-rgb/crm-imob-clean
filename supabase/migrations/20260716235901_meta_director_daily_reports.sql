begin;
create table if not exists public.meta_daily_reports (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  report_date date not null, status text not null default 'ready' check (status in ('ready','reviewed')),
  payload jsonb not null default '{}'::jsonb, reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, report_date)
);
create index if not exists meta_daily_reports_org_date_idx on public.meta_daily_reports (organization_id, report_date desc);
alter table public.meta_daily_reports enable row level security;
create policy meta_daily_reports_director_select on public.meta_daily_reports for select to authenticated using (
  organization_id = (select public.current_organization_id()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.organization_id = meta_daily_reports.organization_id
    and coalesce(p.commercial_role, case when p.role = 'admin' then 'director' else p.role end) = 'director'
  )
);
revoke insert, update, delete on public.meta_daily_reports from anon, authenticated;
grant select on public.meta_daily_reports to authenticated;
commit;
