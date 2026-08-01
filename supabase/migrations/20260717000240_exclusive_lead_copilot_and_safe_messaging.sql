begin;

create table public.lead_copilots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null unique references public.leads(id) on delete cascade,
  broker_id uuid not null references public.profiles(id),
  copilot_key uuid not null default gen_random_uuid() unique,
  memory jsonb not null default '{}'::jsonb,
  interaction_count integer not null default 0,
  learning_version integer not null default 1,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lead_identity_registry (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  identity_type text not null check (identity_type in ('phone')),
  identity_value text not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, identity_type, identity_value),
  unique (lead_id, identity_type)
);

alter table public.lead_identity_registry enable row level security;
revoke all on public.lead_identity_registry from anon, authenticated;
grant select, insert, update, delete on public.lead_identity_registry to service_role;

insert into public.lead_identity_registry (organization_id, identity_type, identity_value, lead_id)
select distinct on (organization_id, regexp_replace(phone, '\D', '', 'g'))
  organization_id, 'phone', regexp_replace(phone, '\D', '', 'g'), id
from public.leads
where phone is not null and length(regexp_replace(phone, '\D', '', 'g')) >= 10
order by organization_id, regexp_replace(phone, '\D', '', 'g'), created_at, id
on conflict do nothing;

create or replace function private.enforce_unique_lead_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare normalized text; existing_lead uuid;
begin
  normalized := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
  if length(normalized) < 10 then return new; end if;
  select lead_id into existing_lead from public.lead_identity_registry
  where organization_id = new.organization_id and identity_type = 'phone' and identity_value = normalized;
  if existing_lead is not null and existing_lead <> new.id then
    raise exception 'Este contato já pertence a uma lead única no CRM.';
  end if;
  delete from public.lead_identity_registry
  where lead_id = new.id and identity_type = 'phone' and identity_value <> normalized;
  insert into public.lead_identity_registry (organization_id, identity_type, identity_value, lead_id)
  values (new.organization_id, 'phone', normalized, new.id)
  on conflict (organization_id, identity_type, identity_value) do update set lead_id = excluded.lead_id;
  return new;
end;
$$;
revoke all on function private.enforce_unique_lead_identity() from public, anon, authenticated;

drop trigger if exists leads_enforce_unique_identity on public.leads;
create trigger leads_enforce_unique_identity after insert or update of phone on public.leads
for each row execute function private.enforce_unique_lead_identity();

create index lead_copilots_broker_idx on public.lead_copilots (organization_id, broker_id, updated_at desc);
alter table public.lead_copilots enable row level security;
create policy lead_copilots_commercial_scope on public.lead_copilots for select to authenticated
using (organization_id = (select public.current_organization_id()) and (select private.can_access_commercial_lead(organization_id, broker_id)));
revoke all on public.lead_copilots from anon;
revoke insert, update, delete on public.lead_copilots from authenticated;
grant select on public.lead_copilots to authenticated;
grant select, insert, update, delete on public.lead_copilots to service_role;

insert into public.lead_copilots (organization_id, lead_id, broker_id)
select organization_id, id, assigned_to from public.leads where assigned_to is not null
on conflict (lead_id) do nothing;

create or replace function private.keep_lead_owner_and_copilot_aligned()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.assigned_to is not null then
    insert into public.lead_copilots (organization_id, lead_id, broker_id)
    values (new.organization_id, new.id, new.assigned_to)
    on conflict (lead_id) do update set broker_id = excluded.broker_id, learning_version = public.lead_copilots.learning_version + case when public.lead_copilots.broker_id <> excluded.broker_id then 1 else 0 end, updated_at = now();
    update public.conversations set assigned_to = new.assigned_to, updated_at = now()
    where lead_id = new.id and assigned_to is distinct from new.assigned_to;
  end if;
  return new;
end;
$$;
revoke all on function private.keep_lead_owner_and_copilot_aligned() from public, anon, authenticated;

drop trigger if exists leads_align_owner_copilot on public.leads;
create trigger leads_align_owner_copilot after insert or update of assigned_to on public.leads
for each row execute function private.keep_lead_owner_and_copilot_aligned();

create or replace function private.enforce_conversation_lead_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.lead_id is not null then
    select assigned_to into new.assigned_to from public.leads
    where id = new.lead_id and organization_id = new.organization_id;
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_enforce_lead_owner on public.conversations;
create trigger conversations_enforce_lead_owner before insert or update of lead_id, assigned_to on public.conversations
for each row execute function private.enforce_conversation_lead_owner();

alter table public.lead_reactivation_batches
  add column daily_cap integer not null default 100 check (daily_cap between 1 and 1000),
  add column interval_seconds integer not null default 30 check (interval_seconds between 10 and 3600),
  add column send_window_start time not null default '09:00',
  add column send_window_end time not null default '18:00',
  add column quality_status text not null default 'unknown' check (quality_status in ('unknown','green','yellow','red')),
  add column delivered_count integer not null default 0,
  add column read_count integer not null default 0,
  add column replied_count integer not null default 0,
  add column failed_count integer not null default 0,
  add column paused_reason text;

commit;
