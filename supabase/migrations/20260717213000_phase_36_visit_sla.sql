begin;

create table if not exists public.lead_visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  broker_id uuid references public.profiles(id) on delete set null,
  development_id uuid references public.developments(id) on delete set null,
  scheduled_at timestamptz not null,
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  no_show_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','confirmed','completed','cancelled','no_show')),
  format text not null default 'onsite' check (format in ('onsite','video')),
  location text,
  notes text,
  confirmation_minutes integer check (confirmation_minutes is null or confirmation_minutes >= 0),
  completion_delay_minutes integer check (completion_delay_minutes is null or completion_delay_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_visits_agenda on public.lead_visits (organization_id, scheduled_at);
create index if not exists lead_visits_team_metrics on public.lead_visits (organization_id, broker_id, scheduled_at desc);
create unique index if not exists lead_visits_one_active_slot on public.lead_visits (organization_id, lead_id, scheduled_at)
  where status in ('scheduled','confirmed');

alter table public.lead_visits enable row level security;
create policy lead_visits_commercial_read on public.lead_visits for select to authenticated
  using ((select private.can_access_commercial_lead(organization_id, broker_id)));
revoke insert, update, delete on public.lead_visits from anon, authenticated;
grant select on public.lead_visits to authenticated;
grant all on public.lead_visits to service_role;

create or replace function public.validate_visit_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.organization_id <> old.organization_id or new.lead_id <> old.lead_id then raise exception 'visit_identity_immutable'; end if;
  if new.status = old.status then return new; end if;
  if old.status not in ('scheduled','confirmed') then raise exception 'visit_terminal_state'; end if;
  if new.status = 'confirmed' and old.status <> 'scheduled' then raise exception 'visit_confirmation_invalid'; end if;
  if new.status not in ('confirmed','completed','cancelled','no_show') then raise exception 'visit_transition_invalid'; end if;
  if new.status = 'confirmed' then
    new.confirmed_at := coalesce(new.confirmed_at, now());
    new.confirmation_minutes := greatest(0, floor(extract(epoch from (new.confirmed_at - old.created_at)) / 60)::integer);
  elsif new.status = 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
    new.completion_delay_minutes := greatest(0, floor(extract(epoch from (new.completed_at - old.scheduled_at)) / 60)::integer);
  elsif new.status = 'cancelled' then new.cancelled_at := coalesce(new.cancelled_at, now());
  elsif new.status = 'no_show' then
    if now() < old.scheduled_at then raise exception 'visit_no_show_before_schedule'; end if;
    new.no_show_at := coalesce(new.no_show_at, now());
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists lead_visits_validate_transition on public.lead_visits;
create trigger lead_visits_validate_transition before update on public.lead_visits
for each row execute function public.validate_visit_transition();

revoke all on function public.validate_visit_transition() from public, anon, authenticated;

commit;
