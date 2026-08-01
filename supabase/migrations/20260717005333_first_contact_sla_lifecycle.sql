begin;

alter table public.leads
  add column if not exists first_contact_due_at timestamptz,
  add column if not exists first_contacted_at timestamptz,
  add column if not exists first_contact_sla_minutes integer;

alter table public.leads drop constraint if exists leads_first_contact_sla_minutes_check;
alter table public.leads add constraint leads_first_contact_sla_minutes_check
  check (first_contact_sla_minutes is null or first_contact_sla_minutes between 1 and 1440);

create index if not exists leads_first_contact_sla_pending_idx
  on public.leads (organization_id, first_contact_due_at)
  where first_contacted_at is null and first_contact_due_at is not null;

create or replace function public.apply_first_contact_sla()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.source = 'Meta Lead Ads' and new.last_interaction_at is null and new.first_contact_due_at is null then
    new.first_contact_sla_minutes := coalesce(new.first_contact_sla_minutes, 5);
    new.first_contact_due_at := coalesce(new.created_at, now()) + make_interval(mins => new.first_contact_sla_minutes);
  end if;
  if new.last_interaction_at is not null and new.first_contacted_at is null then
    new.first_contacted_at := new.last_interaction_at;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_apply_first_contact_sla on public.leads;
create trigger leads_apply_first_contact_sla
before insert or update of source, created_at, last_interaction_at on public.leads
for each row execute function public.apply_first_contact_sla();

create or replace function public.close_first_contact_sla_from_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.lead_id is not null and new.type in ('note', 'call', 'whatsapp', 'visit', 'email') then
    update public.leads
    set last_interaction_at = coalesce(last_interaction_at, new.occurred_at, now()),
        first_contacted_at = coalesce(first_contacted_at, new.occurred_at, now()),
        next_action_at = case when first_contacted_at is null then null else next_action_at end,
        updated_at = now()
    where id = new.lead_id and organization_id = new.organization_id and first_contacted_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists activities_close_first_contact_sla on public.activities;
create trigger activities_close_first_contact_sla
after insert on public.activities
for each row execute function public.close_first_contact_sla_from_activity();

update public.leads
set first_contact_sla_minutes = 5,
    first_contact_due_at = coalesce(next_action_at, created_at + interval '5 minutes'),
    first_contacted_at = last_interaction_at
where source = 'Meta Lead Ads'
  and first_contact_due_at is null;

revoke all on function public.apply_first_contact_sla() from public, anon, authenticated;
revoke all on function public.close_first_contact_sla_from_activity() from public, anon, authenticated;

commit;
