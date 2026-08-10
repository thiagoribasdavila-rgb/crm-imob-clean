create table if not exists public.forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  horizon_days integer not null check (horizon_days in (30, 60, 90)),
  horizon_end timestamptz not null,
  method text not null check (method = 'canonical_stage_probability_v1'),
  pipeline_gross numeric(16,2) not null check (pipeline_gross >= 0),
  predicted_weighted numeric(16,2) not null check (predicted_weighted >= 0),
  opportunity_count integer not null check (opportunity_count >= 0),
  value_coverage integer not null check (value_coverage between 0 and 100),
  close_date_coverage integer not null check (close_date_coverage between 0 and 100),
  confidence_band text not null check (confidence_band in ('alta', 'media', 'baixa')),
  opportunity_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(opportunity_snapshot) = 'array'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  evaluated_at timestamptz,
  evaluated_by uuid references public.profiles(id) on delete restrict,
  actual_won_value numeric(16,2) check (actual_won_value is null or actual_won_value >= 0),
  actual_won_count integer check (actual_won_count is null or actual_won_count >= 0),
  absolute_error numeric(16,2) check (absolute_error is null or absolute_error >= 0),
  accuracy_percent numeric(6,2) check (accuracy_percent is null or accuracy_percent between 0 and 100),
  result_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (horizon_end > snapshot_at),
  check (
    (evaluated_at is null and evaluated_by is null and actual_won_value is null and actual_won_count is null and absolute_error is null and accuracy_percent is null)
    or
    (evaluated_at is not null and evaluated_by is not null and actual_won_value is not null and actual_won_count is not null and absolute_error is not null)
  )
);

create index if not exists idx_forecast_snapshots_org_horizon
  on public.forecast_snapshots (organization_id, horizon_days, snapshot_at desc);

create or replace function public.protect_forecast_snapshot_measurement()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'forecast snapshots are append-only';
  end if;
  if new.organization_id is distinct from old.organization_id
    or new.snapshot_at is distinct from old.snapshot_at
    or new.horizon_days is distinct from old.horizon_days
    or new.horizon_end is distinct from old.horizon_end
    or new.method is distinct from old.method
    or new.pipeline_gross is distinct from old.pipeline_gross
    or new.predicted_weighted is distinct from old.predicted_weighted
    or new.opportunity_count is distinct from old.opportunity_count
    or new.value_coverage is distinct from old.value_coverage
    or new.close_date_coverage is distinct from old.close_date_coverage
    or new.confidence_band is distinct from old.confidence_band
    or new.opportunity_snapshot is distinct from old.opportunity_snapshot
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'forecast snapshot source is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_forecast_snapshot_update on public.forecast_snapshots;
create trigger protect_forecast_snapshot_update
  before update on public.forecast_snapshots
  for each row execute function public.protect_forecast_snapshot_measurement();

drop trigger if exists protect_forecast_snapshot_delete on public.forecast_snapshots;
create trigger protect_forecast_snapshot_delete
  before delete on public.forecast_snapshots
  for each row execute function public.protect_forecast_snapshot_measurement();

alter table public.forecast_snapshots enable row level security;

drop policy if exists forecast_snapshots_director_read on public.forecast_snapshots;
create policy forecast_snapshots_director_read
  on public.forecast_snapshots
  for select
  to authenticated
  using (
    organization_id = (select public.current_organization_id())
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.organization_id = forecast_snapshots.organization_id
        and p.active = true
        and (
          p.role = 'admin'
          or p.commercial_role in ('director', 'superintendent')
        )
    )
  );

revoke all on public.forecast_snapshots from anon;
revoke insert, update, delete on public.forecast_snapshots from authenticated;
grant select on public.forecast_snapshots to authenticated;
grant all on public.forecast_snapshots to service_role;

comment on table public.forecast_snapshots is
  'Fotografias imutáveis do forecast canônico; resultado só é aferido após o horizonte e com venda observada.';
