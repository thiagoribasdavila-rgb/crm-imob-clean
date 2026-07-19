begin;

create table if not exists public.profile_hierarchy_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  previous_role text check (previous_role is null or previous_role in ('director','superintendent','manager','broker')),
  new_role text not null check (new_role in ('director','superintendent','manager','broker')),
  previous_reports_to uuid references public.profiles(id),
  new_reports_to uuid references public.profiles(id),
  previous_active boolean,
  new_active boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists profile_hierarchy_events_org_created_idx
  on public.profile_hierarchy_events (organization_id, created_at desc);
create index if not exists profile_hierarchy_events_profile_idx on public.profile_hierarchy_events (profile_id);
create index if not exists profile_hierarchy_events_actor_idx on public.profile_hierarchy_events (actor_id);
create index if not exists profile_hierarchy_events_previous_supervisor_idx on public.profile_hierarchy_events (previous_reports_to) where previous_reports_to is not null;
create index if not exists profile_hierarchy_events_new_supervisor_idx on public.profile_hierarchy_events (new_reports_to) where new_reports_to is not null;

alter table public.profile_hierarchy_events enable row level security;
drop policy if exists profile_hierarchy_events_scope on public.profile_hierarchy_events;
create policy profile_hierarchy_events_scope on public.profile_hierarchy_events
for select to authenticated
using (
  organization_id = (select public.current_organization_id())
  and (select private.can_view_commercial_profile(profile_id))
);

grant select on public.profile_hierarchy_events to authenticated;
revoke insert, update, delete on public.profile_hierarchy_events from authenticated, anon;

create or replace function private.validate_commercial_hierarchy()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare supervisor public.profiles%rowtype;
begin
  if new.commercial_role is null then
    raise exception 'commercial_role_required';
  end if;
  if tg_op = 'UPDATE' and (not new.active or new.commercial_role is distinct from old.commercial_role)
    and exists (select 1 from public.profiles child where child.reports_to=old.id and child.active)
  then raise exception 'reassign_active_direct_reports_first'; end if;

  if new.commercial_role = 'director' then
    if new.reports_to is not null then raise exception 'director_cannot_report'; end if;
  else
    if new.reports_to is null or new.reports_to = new.id then raise exception 'valid_supervisor_required'; end if;
    select * into supervisor from public.profiles where id = new.reports_to;
    if supervisor.id is null or supervisor.organization_id <> new.organization_id or not supervisor.active then
      raise exception 'supervisor_outside_organization_or_inactive';
    end if;
    if new.commercial_role = 'superintendent' and supervisor.commercial_role <> 'director' then raise exception 'superintendent_requires_director'; end if;
    if new.commercial_role = 'manager' and supervisor.commercial_role <> 'superintendent' then raise exception 'manager_requires_superintendent'; end if;
    if new.commercial_role = 'broker' and supervisor.commercial_role <> 'manager' then raise exception 'broker_requires_manager'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_commercial_hierarchy on public.profiles;
create trigger validate_commercial_hierarchy
before insert or update of organization_id, commercial_role, reports_to, active on public.profiles
for each row execute function private.validate_commercial_hierarchy();

create or replace function private.protect_profile_authorization_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (select auth.uid()) = old.id and (
    new.organization_id is distinct from old.organization_id or
    new.role is distinct from old.role or
    new.commercial_role is distinct from old.commercial_role or
    new.reports_to is distinct from old.reports_to or
    new.active is distinct from old.active
  ) then raise exception 'profile_authorization_fields_are_server_managed'; end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_authorization_fields on public.profiles;
create trigger protect_profile_authorization_fields
before update on public.profiles
for each row execute function private.protect_profile_authorization_fields();

create or replace function public.manage_commercial_profile(
  p_actor_id uuid,
  p_organization_id uuid,
  p_profile_id uuid,
  p_commercial_role text,
  p_reports_to uuid,
  p_active boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare actor public.profiles%rowtype; target public.profiles%rowtype; supervisor public.profiles%rowtype; updated public.profiles%rowtype;
begin
  select * into actor from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true;
  select * into target from public.profiles where id=p_profile_id and organization_id=p_organization_id;
  if actor.id is null or target.id is null then raise exception 'profile_not_found'; end if;
  if p_profile_id = p_actor_id and p_active = false then raise exception 'cannot_deactivate_self'; end if;
  if p_reports_to is not null then select * into supervisor from public.profiles where id=p_reports_to and organization_id=p_organization_id and active=true; end if;

  if actor.commercial_role = 'director' then null;
  elsif actor.commercial_role = 'superintendent' then
    if p_commercial_role not in ('manager','broker') or not exists (
      with recursive descendants as (
        select id from public.profiles where reports_to=actor.id and organization_id=p_organization_id
        union all select p.id from public.profiles p join descendants d on p.reports_to=d.id where p.organization_id=p_organization_id
      ) select 1 from descendants where id=p_profile_id
    ) then raise exception 'hierarchy_management_forbidden'; end if;
    if p_reports_to <> actor.id and not exists (
      with recursive descendants as (
        select id from public.profiles where reports_to=actor.id and organization_id=p_organization_id
        union all select p.id from public.profiles p join descendants d on p.reports_to=d.id where p.organization_id=p_organization_id
      ) select 1 from descendants where id=p_reports_to
    ) then raise exception 'supervisor_outside_actor_hierarchy'; end if;
  elsif actor.commercial_role = 'manager' then
    if p_commercial_role <> 'broker' or target.reports_to <> actor.id or p_reports_to <> actor.id then raise exception 'hierarchy_management_forbidden'; end if;
  else raise exception 'hierarchy_management_forbidden';
  end if;

  update public.profiles set commercial_role=p_commercial_role, reports_to=p_reports_to, active=p_active, updated_at=now()
  where id=p_profile_id and organization_id=p_organization_id returning * into updated;

  insert into public.profile_hierarchy_events(organization_id,profile_id,actor_id,previous_role,new_role,previous_reports_to,new_reports_to,previous_active,new_active)
  values(p_organization_id,p_profile_id,p_actor_id,target.commercial_role,p_commercial_role,target.reports_to,p_reports_to,target.active,p_active);
  return updated;
end;
$$;

revoke all on function public.manage_commercial_profile(uuid,uuid,uuid,text,uuid,boolean) from public, anon, authenticated;
grant execute on function public.manage_commercial_profile(uuid,uuid,uuid,text,uuid,boolean) to service_role;

commit;
