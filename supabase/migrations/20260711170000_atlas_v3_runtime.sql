begin;

alter table public.atlas_decisions
  add column if not exists decision_key text,
  add column if not exists expires_at timestamptz,
  add column if not exists execution_attempts integer not null default 0,
  add column if not exists last_error text;

create unique index if not exists idx_atlas_decisions_unique_key
  on public.atlas_decisions (organization_id, decision_key)
  where decision_key is not null and status in ('proposed','approved','executing');

alter table public.atlas_agent_runs
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists attempts integer not null default 0,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists max_attempts integer not null default 3;

create index if not exists idx_atlas_agent_runtime
  on public.atlas_agent_runs (status, available_at, created_at);

create or replace function public.atlas_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_atlas_decisions_updated_at on public.atlas_decisions;
create trigger trg_atlas_decisions_updated_at
before update on public.atlas_decisions
for each row execute function public.atlas_touch_updated_at();

commit;
