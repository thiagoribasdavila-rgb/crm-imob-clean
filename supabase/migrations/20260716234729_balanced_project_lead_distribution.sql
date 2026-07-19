begin;

alter table public.leads
  add column if not exists development_id uuid references public.developments(id) on delete set null;

update public.leads l
set development_id = (
  select nullif(coalesce(to_jsonb(c)->>'development_id', to_jsonb(c)->>'project_id'), '')::uuid
  from public.campaigns c where c.id = l.campaign_id
)
where l.development_id is null and l.campaign_id is not null
  and exists (
    select 1 from public.campaigns c where c.id = l.campaign_id
      and nullif(coalesce(to_jsonb(c)->>'development_id', to_jsonb(c)->>'project_id'), '') is not null
  );

create or replace function private.sync_lead_development_from_campaign()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.development_id is null and new.campaign_id is not null then
    select nullif(coalesce(to_jsonb(c)->>'development_id', to_jsonb(c)->>'project_id'), '')::uuid
    into new.development_id from public.campaigns c where c.id = new.campaign_id;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_sync_development_from_campaign on public.leads;
create trigger leads_sync_development_from_campaign
before insert or update of campaign_id, development_id on public.leads
for each row execute function private.sync_lead_development_from_campaign();

create index if not exists leads_org_development_assignment_idx
  on public.leads (organization_id, development_id, assigned_to, created_at);

create table if not exists public.commercial_presence (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  availability text not null default 'available' check (availability in ('available', 'busy', 'offline')),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commercial_presence_online_idx
  on public.commercial_presence (organization_id, availability, last_seen_at desc);

create table if not exists public.project_distribution_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  weight smallint not null default 1 check (weight between 1 and 10),
  assignments_count integer not null default 0 check (assignments_count >= 0),
  last_assigned_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (development_id, profile_id)
);

create index if not exists project_distribution_queue_idx
  on public.project_distribution_members (organization_id, development_id, enabled, last_assigned_at);

create table if not exists public.lead_distribution_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  assigned_to uuid not null references public.profiles(id),
  actor_id uuid not null references public.profiles(id),
  algorithm text not null default 'online_project_load_v1',
  score_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_distribution_events_org_created_idx
  on public.lead_distribution_events (organization_id, created_at desc);

alter table public.commercial_presence enable row level security;
alter table public.project_distribution_members enable row level security;
alter table public.lead_distribution_events enable row level security;

create policy commercial_presence_scope on public.commercial_presence
for select to authenticated
using (organization_id = (select public.current_organization_id()) and (select private.can_view_commercial_profile(profile_id)));

create policy project_distribution_members_scope on public.project_distribution_members
for select to authenticated
using (organization_id = (select public.current_organization_id()) and (select private.can_view_commercial_profile(profile_id)));

create policy lead_distribution_events_scope on public.lead_distribution_events
for select to authenticated
using (organization_id = (select public.current_organization_id()) and (select private.can_view_commercial_profile(assigned_to)));

revoke all on public.commercial_presence, public.project_distribution_members, public.lead_distribution_events from anon;
revoke insert, update, delete on public.commercial_presence, public.project_distribution_members, public.lead_distribution_events from authenticated;
grant select on public.commercial_presence, public.project_distribution_members, public.lead_distribution_events to authenticated;

create or replace function public.touch_commercial_presence(
  p_actor_id uuid,
  p_organization_id uuid,
  p_availability text default 'available'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_availability not in ('available', 'busy', 'offline') then
    raise exception 'Disponibilidade inválida.';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_id and organization_id = p_organization_id and active = true) then
    raise exception 'Perfil comercial inválido.';
  end if;
  insert into public.commercial_presence (profile_id, organization_id, availability, last_seen_at, updated_at)
  values (p_actor_id, p_organization_id, p_availability, now(), now())
  on conflict (profile_id) do update set
    availability = excluded.availability,
    last_seen_at = excluded.last_seen_at,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.distribute_project_leads(
  p_actor_id uuid,
  p_organization_id uuid,
  p_development_id uuid,
  p_limit integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  counter integer;
  selected_lead uuid;
  selected_broker uuid;
  selected_load integer;
  distributed integer := 0;
begin
  if p_limit < 1 or p_limit > 100 then raise exception 'O lote deve conter entre 1 e 100 leads.'; end if;

  select coalesce(commercial_role, case role when 'admin' then 'director' when 'manager' then 'manager' when 'broker' then 'broker' end)
  into actor_role from public.profiles
  where id = p_actor_id and organization_id = p_organization_id and active = true;

  if actor_role not in ('director', 'superintendent', 'manager') then raise exception 'Perfil sem permissão para distribuir leads.'; end if;
  if not exists (select 1 from public.developments where id = p_development_id and organization_id = p_organization_id) then raise exception 'Projeto inválido.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || p_development_id::text, 0));

  for counter in 1..p_limit loop
    select l.id into selected_lead
    from public.leads l
    where l.organization_id = p_organization_id and l.development_id = p_development_id and l.assigned_to is null
    order by l.created_at, l.id
    for update skip locked limit 1;
    exit when selected_lead is null;

    with recursive descendants as (
      select id from public.profiles where id = p_actor_id
      union all
      select p.id from public.profiles p join descendants d on p.reports_to = d.id
      where p.organization_id = p_organization_id and p.active = true
    ), candidates as (
      select p.id,
        count(l.id)::integer as project_load,
        coalesce(m.weight, 1) as weight,
        m.last_assigned_at
      from public.profiles p
      join public.commercial_presence cp on cp.profile_id = p.id
        and cp.organization_id = p_organization_id and cp.availability = 'available'
        and cp.last_seen_at >= now() - interval '90 seconds'
      left join public.project_distribution_members m on m.development_id = p_development_id and m.profile_id = p.id
      left join public.leads l on l.organization_id = p_organization_id and l.development_id = p_development_id and l.assigned_to = p.id
      where p.organization_id = p_organization_id and p.active = true
        and coalesce(p.commercial_role, p.role) = 'broker'
        and coalesce(m.enabled, true)
        and (actor_role = 'director' or p.id in (select id from descendants))
      group by p.id, m.weight, m.last_assigned_at
    )
    select id, project_load into selected_broker, selected_load
    from candidates
    order by (project_load::numeric / weight), last_assigned_at nulls first, id
    limit 1;

    if selected_broker is null then raise exception 'Nenhum corretor online e disponível para este projeto.'; end if;

    update public.leads set assigned_to = selected_broker, updated_at = now() where id = selected_lead;
    insert into public.project_distribution_members (organization_id, development_id, profile_id, assignments_count, last_assigned_at, updated_at)
    values (p_organization_id, p_development_id, selected_broker, 1, now(), now())
    on conflict (development_id, profile_id) do update set
      assignments_count = public.project_distribution_members.assignments_count + 1,
      last_assigned_at = excluded.last_assigned_at, updated_at = excluded.updated_at;
    insert into public.lead_distribution_events (organization_id, development_id, lead_id, assigned_to, actor_id, score_snapshot)
    values (p_organization_id, p_development_id, selected_lead, selected_broker, p_actor_id,
      jsonb_build_object('projectLoadBefore', selected_load, 'presenceWindowSeconds', 90));
    distributed := distributed + 1;
    selected_lead := null; selected_broker := null;
  end loop;

  return jsonb_build_object('distributed', distributed, 'developmentId', p_development_id);
end;
$$;

revoke all on function public.touch_commercial_presence(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.distribute_project_leads(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.touch_commercial_presence(uuid, uuid, text) to service_role;
grant execute on function public.distribute_project_leads(uuid, uuid, uuid, integer) to service_role;

commit;
