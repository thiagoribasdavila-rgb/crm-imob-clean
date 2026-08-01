begin;

create schema if not exists private;

alter table public.profiles
  add column if not exists commercial_role text,
  add column if not exists reports_to uuid references public.profiles(id) on delete set null;

update public.profiles
set commercial_role = case role
  when 'admin' then 'director'
  when 'manager' then 'manager'
  when 'broker' then 'broker'
  else commercial_role
end
where commercial_role is null;

alter table public.profiles
  drop constraint if exists profiles_commercial_role_check;
alter table public.profiles
  add constraint profiles_commercial_role_check
  check (commercial_role is null or commercial_role in ('director', 'superintendent', 'manager', 'broker'));

create index if not exists profiles_org_commercial_role_idx
  on public.profiles (organization_id, commercial_role)
  where active = true;
create index if not exists profiles_reports_to_idx
  on public.profiles (reports_to)
  where active = true;
create index if not exists leads_org_assigned_created_idx
  on public.leads (organization_id, assigned_to, created_at desc);

create or replace function private.can_view_commercial_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive viewer as (
    select id, organization_id,
      coalesce(commercial_role, case role when 'admin' then 'director' when 'manager' then 'manager' when 'broker' then 'broker' end) as commercial_role
    from public.profiles
    where id = (select auth.uid()) and active = true
  ), descendants as (
    select p.id, p.organization_id
    from public.profiles p join viewer v on p.id = v.id
    union all
    select p.id, p.organization_id
    from public.profiles p
    join descendants d on p.reports_to = d.id
    where p.active = true
  )
  select exists (
    select 1
    from viewer v
    join public.profiles target on target.id = target_profile_id
    where target.organization_id = v.organization_id
      and (
        v.commercial_role = 'director'
        or target.id in (select id from descendants)
      )
  );
$$;

create or replace function private.can_access_commercial_lead(
  lead_organization_id uuid,
  lead_owner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select id, organization_id,
      coalesce(commercial_role, case role when 'admin' then 'director' when 'manager' then 'manager' when 'broker' then 'broker' end) as commercial_role
    from public.profiles
    where id = (select auth.uid()) and active = true
  )
  select exists (
    select 1 from viewer v
    where v.organization_id = lead_organization_id
      and (
        v.commercial_role = 'director'
        or lead_owner_id = v.id
        or (lead_owner_id is not null and private.can_view_commercial_profile(lead_owner_id))
        or (lead_owner_id is null and v.commercial_role = 'superintendent')
      )
  );
$$;

revoke all on function private.can_view_commercial_profile(uuid) from public, anon;
revoke all on function private.can_access_commercial_lead(uuid, uuid) from public, anon;
grant execute on function private.can_view_commercial_profile(uuid) to authenticated;
grant execute on function private.can_access_commercial_lead(uuid, uuid) to authenticated;

drop policy if exists profiles_select_org on public.profiles;
drop policy if exists profiles_commercial_scope on public.profiles;
create policy profiles_commercial_scope on public.profiles
for select to authenticated
using ((select private.can_view_commercial_profile(id)));

drop policy if exists leads_org_access on public.leads;
drop policy if exists leads_commercial_select on public.leads;
drop policy if exists leads_commercial_insert on public.leads;
drop policy if exists leads_commercial_update on public.leads;
drop policy if exists leads_commercial_delete on public.leads;
create policy leads_commercial_select on public.leads
for select to authenticated
using ((select private.can_access_commercial_lead(organization_id, assigned_to)));
create policy leads_commercial_insert on public.leads
for insert to authenticated
with check ((select private.can_access_commercial_lead(organization_id, assigned_to)));
create policy leads_commercial_update on public.leads
for update to authenticated
using ((select private.can_access_commercial_lead(organization_id, assigned_to)))
with check ((select private.can_access_commercial_lead(organization_id, assigned_to)));
create policy leads_commercial_delete on public.leads
for delete to authenticated
using ((select private.can_access_commercial_lead(organization_id, assigned_to)));

create table if not exists public.lead_transfer_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  target_owner_id uuid not null references public.profiles(id),
  lead_count integer not null check (lead_count > 0),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.lead_transfer_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.lead_transfer_batches(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  previous_owner_id uuid references public.profiles(id),
  target_owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (batch_id, lead_id)
);

create index if not exists lead_transfer_batches_org_created_idx
  on public.lead_transfer_batches (organization_id, created_at desc);
create index if not exists lead_transfer_items_batch_idx
  on public.lead_transfer_items (batch_id);
create index if not exists lead_transfer_items_lead_idx
  on public.lead_transfer_items (lead_id, created_at desc);

alter table public.lead_transfer_batches enable row level security;
alter table public.lead_transfer_items enable row level security;

create policy lead_transfer_batches_select_scope on public.lead_transfer_batches
for select to authenticated
using (
  organization_id = (select public.current_organization_id())
  and (actor_id = (select auth.uid()) or (select private.can_view_commercial_profile(actor_id)))
);
create policy lead_transfer_items_select_scope on public.lead_transfer_items
for select to authenticated
using (
  exists (
    select 1 from public.lead_transfer_batches b
    where b.id = batch_id
      and b.organization_id = (select public.current_organization_id())
      and (b.actor_id = (select auth.uid()) or (select private.can_view_commercial_profile(b.actor_id)))
  )
);

revoke insert, update, delete on public.lead_transfer_batches from authenticated, anon;
revoke insert, update, delete on public.lead_transfer_items from authenticated, anon;
grant select on public.lead_transfer_batches, public.lead_transfer_items to authenticated;

create or replace function public.bulk_transfer_leads(
  p_actor_id uuid,
  p_organization_id uuid,
  p_lead_ids uuid[],
  p_target_owner_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  target_role text;
  requested_count integer;
  accessible_count integer;
  batch_id uuid;
begin
  requested_count := coalesce(array_length(p_lead_ids, 1), 0);
  if requested_count < 1 or requested_count > 200 then
    raise exception 'A transferência deve conter entre 1 e 200 leads.';
  end if;

  select coalesce(commercial_role, case role when 'admin' then 'director' when 'manager' then 'manager' when 'broker' then 'broker' end)
  into actor_role
  from public.profiles
  where id = p_actor_id and organization_id = p_organization_id and active = true;

  select coalesce(commercial_role, case role when 'admin' then 'director' when 'manager' then 'manager' when 'broker' then 'broker' end)
  into target_role
  from public.profiles
  where id = p_target_owner_id and organization_id = p_organization_id and active = true;

  if actor_role not in ('director', 'superintendent', 'manager') then
    raise exception 'Perfil sem permissão para transferir leads.';
  end if;
  if target_role not in ('manager', 'broker') then
    raise exception 'O destino deve ser um gerente ou corretor ativo.';
  end if;

  if actor_role <> 'director' and not exists (
    with recursive descendants as (
      select id from public.profiles where id = p_actor_id
      union all
      select p.id from public.profiles p join descendants d on p.reports_to = d.id
      where p.active = true and p.organization_id = p_organization_id
    )
    select 1 from descendants where id = p_target_owner_id
  ) then
    raise exception 'O destino está fora da hierarquia permitida.';
  end if;

  if actor_role = 'manager' and target_role <> 'broker' then
    raise exception 'Gerentes podem transferir apenas para corretores do próprio time.';
  end if;

  perform 1 from public.leads
  where organization_id = p_organization_id and id = any(p_lead_ids)
  order by id for update;

  with recursive descendants as (
    select id from public.profiles where id = p_actor_id
    union all
    select p.id from public.profiles p join descendants d on p.reports_to = d.id
    where p.active = true and p.organization_id = p_organization_id
  )
  select count(*) into accessible_count
  from public.leads l
  where l.organization_id = p_organization_id
    and l.id = any(p_lead_ids)
    and (
      actor_role = 'director'
      or l.assigned_to in (select id from descendants)
      or (l.assigned_to is null and actor_role = 'superintendent')
    );

  if accessible_count <> requested_count then
    raise exception 'Um ou mais leads estão fora do seu escopo ou não existem.';
  end if;

  insert into public.lead_transfer_batches
    (organization_id, actor_id, target_owner_id, lead_count, reason)
  values
    (p_organization_id, p_actor_id, p_target_owner_id, requested_count, nullif(trim(p_reason), ''))
  returning id into batch_id;

  insert into public.lead_transfer_items
    (batch_id, lead_id, previous_owner_id, target_owner_id)
  select batch_id, l.id, l.assigned_to, p_target_owner_id
  from public.leads l
  where l.organization_id = p_organization_id and l.id = any(p_lead_ids);

  update public.leads
  set assigned_to = p_target_owner_id, updated_at = now()
  where organization_id = p_organization_id and id = any(p_lead_ids);

  return jsonb_build_object(
    'batchId', batch_id,
    'transferred', requested_count,
    'targetOwnerId', p_target_owner_id
  );
end;
$$;

revoke all on function public.bulk_transfer_leads(uuid, uuid, uuid[], uuid, text) from public, anon, authenticated;
grant execute on function public.bulk_transfer_leads(uuid, uuid, uuid[], uuid, text) to service_role;

commit;
