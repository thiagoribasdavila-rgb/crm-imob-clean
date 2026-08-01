begin;

create table if not exists public.follow_up_sla_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  broker_id uuid references public.profiles(id) on delete set null,
  due_at timestamptz not null,
  scheduled_at timestamptz not null default now(),
  completed_at timestamptz,
  response_minutes integer check (response_minutes is null or response_minutes >= 0),
  delay_minutes integer check (delay_minutes is null or delay_minutes >= 0),
  on_time boolean,
  status text not null default 'scheduled' check (status in ('scheduled','completed','recovered','superseded','cancelled')),
  completion_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists follow_up_sla_one_open_cycle
  on public.follow_up_sla_events (organization_id, lead_id)
  where status = 'scheduled';
create index if not exists follow_up_sla_team_metrics
  on public.follow_up_sla_events (organization_id, broker_id, scheduled_at desc);
create index if not exists follow_up_sla_due_queue
  on public.follow_up_sla_events (organization_id, due_at)
  where status = 'scheduled';

alter table public.follow_up_sla_events enable row level security;
create policy follow_up_sla_events_commercial_read on public.follow_up_sla_events
  for select to authenticated
  using ((select private.can_access_commercial_lead(organization_id, broker_id)));
revoke insert, update, delete on public.follow_up_sla_events from anon, authenticated;
grant select on public.follow_up_sla_events to authenticated;
grant all on public.follow_up_sla_events to service_role;

create or replace function public.sync_follow_up_sla_from_lead()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.next_action_at is not null then
      insert into public.follow_up_sla_events (organization_id, lead_id, broker_id, due_at, scheduled_at)
      values (new.organization_id, new.id, new.assigned_to, new.next_action_at, now());
    end if;
    return new;
  end if;
  if new.next_action_at is distinct from old.next_action_at then
    if old.next_action_at is not null then
      update public.follow_up_sla_events
      set status = case when new.next_action_at is null then 'cancelled' else 'superseded' end,
          updated_at = now()
      where organization_id = new.organization_id and lead_id = new.id and status = 'scheduled';
    end if;
    if new.next_action_at is not null then
      insert into public.follow_up_sla_events (organization_id, lead_id, broker_id, due_at, scheduled_at)
      values (new.organization_id, new.id, new.assigned_to, new.next_action_at, now());
    end if;
  elsif new.assigned_to is distinct from old.assigned_to then
    update public.follow_up_sla_events set broker_id = new.assigned_to, updated_at = now()
    where organization_id = new.organization_id and lead_id = new.id and status = 'scheduled';
  end if;
  return new;
end $$;

create or replace function public.complete_follow_up_sla(
  p_organization_id uuid,
  p_lead_id uuid,
  p_occurred_at timestamptz,
  p_source text
) returns void language plpgsql security definer set search_path = '' as $$
declare cycle_id uuid; cycle_due timestamptz; cycle_scheduled timestamptz; occurred timestamptz := coalesce(p_occurred_at, now());
begin
  select id, due_at, scheduled_at into cycle_id, cycle_due, cycle_scheduled
  from public.follow_up_sla_events
  where organization_id = p_organization_id and lead_id = p_lead_id and status = 'scheduled'
  order by scheduled_at desc limit 1 for update;
  if cycle_id is null then return; end if;
  update public.follow_up_sla_events
  set completed_at = occurred,
      response_minutes = greatest(0, floor(extract(epoch from (occurred - cycle_scheduled)) / 60)::integer),
      delay_minutes = greatest(0, floor(extract(epoch from (occurred - cycle_due)) / 60)::integer),
      on_time = occurred <= cycle_due,
      status = case when occurred <= cycle_due then 'completed' else 'recovered' end,
      completion_source = left(coalesce(p_source, 'activity'), 80),
      updated_at = now()
  where id = cycle_id and status = 'scheduled';
  update public.leads
  set next_action_at = null, last_interaction_at = greatest(coalesce(last_interaction_at, occurred), occurred), updated_at = now()
  where id = p_lead_id and organization_id = p_organization_id and next_action_at = cycle_due;
end $$;

create or replace function public.complete_follow_up_sla_from_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.lead_id is not null and lower(coalesce(new.type,'')) in ('call','email','whatsapp','visit','meeting','message','contact') then
    perform public.complete_follow_up_sla(new.organization_id, new.lead_id, coalesce(new.occurred_at, now()), 'activity:' || lower(new.type));
  end if;
  return new;
end $$;

create or replace function public.complete_follow_up_sla_from_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare lead_ref uuid;
begin
  if new.status in ('sent','delivered','read','received') then
    select lead_id into lead_ref from public.conversations where id = new.conversation_id and organization_id = new.organization_id;
    if lead_ref is not null then
      perform public.complete_follow_up_sla(new.organization_id, lead_ref, coalesce(new.sent_at,new.created_at,now()), 'message:' || new.status);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists leads_sync_follow_up_sla on public.leads;
create trigger leads_sync_follow_up_sla after insert or update of next_action_at, assigned_to on public.leads
for each row execute function public.sync_follow_up_sla_from_lead();
drop trigger if exists activities_complete_follow_up_sla on public.activities;
create trigger activities_complete_follow_up_sla after insert on public.activities
for each row execute function public.complete_follow_up_sla_from_activity();
drop trigger if exists messages_complete_follow_up_sla on public.messages;
create trigger messages_complete_follow_up_sla after insert or update of status on public.messages
for each row execute function public.complete_follow_up_sla_from_message();

insert into public.follow_up_sla_events (organization_id, lead_id, broker_id, due_at, scheduled_at)
select organization_id, id, assigned_to, next_action_at, coalesce(last_interaction_at, updated_at, created_at, now())
from public.leads l
where next_action_at is not null
  and lower(coalesce(status,'')) not in ('ganho','perdido','arquivado','comprou_outro')
  and not exists (
    select 1 from public.follow_up_sla_events e
    where e.organization_id = l.organization_id and e.lead_id = l.id and e.status = 'scheduled'
  );

revoke all on function public.sync_follow_up_sla_from_lead() from public, anon, authenticated;
revoke all on function public.complete_follow_up_sla(uuid,uuid,timestamptz,text) from public, anon, authenticated;
revoke all on function public.complete_follow_up_sla_from_activity() from public, anon, authenticated;
revoke all on function public.complete_follow_up_sla_from_message() from public, anon, authenticated;

commit;
