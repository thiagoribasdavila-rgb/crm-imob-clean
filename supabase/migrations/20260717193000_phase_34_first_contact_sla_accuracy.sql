begin;
create table if not exists public.first_contact_sla_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true, default_minutes integer not null default 15 check(default_minutes between 1 and 1440),
  meta_minutes integer not null default 5 check(meta_minutes between 1 and 1440),
  updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);
alter table public.first_contact_sla_policies enable row level security;
create policy first_contact_sla_policies_read on public.first_contact_sla_policies for select to authenticated using(organization_id=(select public.current_organization_id()));
revoke insert,update,delete on public.first_contact_sla_policies from authenticated,anon; grant select on public.first_contact_sla_policies to authenticated; grant all on public.first_contact_sla_policies to service_role;
alter table public.leads add column if not exists first_response_minutes integer, add column if not exists first_contact_sla_met boolean;
alter table public.leads drop constraint if exists leads_first_response_minutes_check;
alter table public.leads add constraint leads_first_response_minutes_check check(first_response_minutes is null or first_response_minutes>=0);

create or replace function public.apply_first_contact_sla() returns trigger language plpgsql security definer set search_path='' as $$
declare policy_row public.first_contact_sla_policies%rowtype; minutes_value integer;
begin
  if new.first_contacted_at is not null or new.last_interaction_at is not null then return new; end if;
  select * into policy_row from public.first_contact_sla_policies where organization_id=new.organization_id;
  if policy_row.organization_id is null then policy_row.enabled:=true; policy_row.default_minutes:=15; policy_row.meta_minutes:=5; end if;
  if not coalesce(policy_row.enabled,true) then return new; end if;
  minutes_value:=case when lower(coalesce(new.source,'')) in ('meta lead ads','meta','facebook','instagram') then coalesce(policy_row.meta_minutes,5) else coalesce(policy_row.default_minutes,15) end;
  new.first_contact_sla_minutes:=coalesce(new.first_contact_sla_minutes,minutes_value);
  new.first_contact_due_at:=coalesce(new.first_contact_due_at,coalesce(new.created_at,now())+make_interval(mins=>new.first_contact_sla_minutes));
  return new;
end $$;

create or replace function public.complete_first_contact_sla(p_organization_id uuid,p_lead_id uuid,p_occurred_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare lead_created timestamptz; due_at timestamptz; response_minutes integer;
begin
  select created_at,first_contact_due_at into lead_created,due_at from public.leads where id=p_lead_id and organization_id=p_organization_id and first_contacted_at is null for update;
  if lead_created is null then return; end if;
  response_minutes:=greatest(0,floor(extract(epoch from (coalesce(p_occurred_at,now())-lead_created))/60)::integer);
  update public.leads set first_contacted_at=coalesce(p_occurred_at,now()),first_response_minutes=response_minutes,first_contact_sla_met=case when due_at is null then null else coalesce(p_occurred_at,now())<=due_at end,last_interaction_at=coalesce(last_interaction_at,p_occurred_at,now()),updated_at=now() where id=p_lead_id and organization_id=p_organization_id and first_contacted_at is null;
end $$;

create or replace function public.close_first_contact_sla_from_activity() returns trigger language plpgsql security definer set search_path='' as $$ begin
  if new.lead_id is not null and lower(coalesce(new.type,'')) in ('call','email','whatsapp','visit','meeting','message','contact') then perform public.complete_first_contact_sla(new.organization_id,new.lead_id,coalesce(new.occurred_at,now())); end if; return new;
end $$;
create or replace function public.close_first_contact_sla_from_message() returns trigger language plpgsql security definer set search_path='' as $$ declare lead_ref uuid; begin
  if new.status in ('sent','delivered','read','received') then select lead_id into lead_ref from public.conversations where id=new.conversation_id and organization_id=new.organization_id; if lead_ref is not null then perform public.complete_first_contact_sla(new.organization_id,lead_ref,coalesce(new.sent_at,new.created_at,now())); end if; end if; return new;
end $$;
drop trigger if exists messages_close_first_contact_sla on public.messages;
create trigger messages_close_first_contact_sla after insert or update of status on public.messages for each row execute function public.close_first_contact_sla_from_message();
update public.leads set first_response_minutes=greatest(0,floor(extract(epoch from (first_contacted_at-created_at))/60)::integer),first_contact_sla_met=case when first_contact_due_at is null then null else first_contacted_at<=first_contact_due_at end where first_contacted_at is not null and (first_response_minutes is null or first_contact_sla_met is null);
revoke all on function public.apply_first_contact_sla() from public,anon,authenticated;
revoke all on function public.close_first_contact_sla_from_activity() from public,anon,authenticated;
revoke all on function public.close_first_contact_sla_from_message() from public,anon,authenticated;
revoke all on function public.complete_first_contact_sla(uuid,uuid,timestamptz) from public,anon,authenticated;
commit;
