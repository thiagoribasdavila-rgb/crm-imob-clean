begin;

create table if not exists public.lead_source_distribution_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_key text not null check (source_key in ('meta')),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  weight smallint not null default 1 check (weight between 1 and 10),
  configured_by uuid not null references public.profiles(id),
  configured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_key, profile_id)
);

create index if not exists lead_source_distribution_members_scope_idx
  on public.lead_source_distribution_members (organization_id, source_key, enabled, profile_id);

alter table public.lead_source_distribution_members enable row level security;
drop policy if exists lead_source_distribution_members_scope on public.lead_source_distribution_members;
create policy lead_source_distribution_members_scope
  on public.lead_source_distribution_members
  for select to authenticated
  using (organization_id = (select public.current_organization_id()));
revoke all on public.lead_source_distribution_members from public, anon;
revoke insert, update, delete on public.lead_source_distribution_members from authenticated;
grant select on public.lead_source_distribution_members to authenticated;

create or replace function public.configure_source_distribution_members(
  p_actor_id uuid,
  p_organization_id uuid,
  p_source_key text,
  p_members jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  normalized_source text := lower(trim(coalesce(p_source_key, '')));
  member_count integer;
begin
  select coalesce(commercial_role, case role when 'admin' then 'director' else role end)
    into actor_role
  from public.profiles
  where id = p_actor_id
    and organization_id = p_organization_id
    and active = true;

  if actor_role is distinct from 'director' then
    raise exception 'source_distribution_actor_forbidden';
  end if;
  if normalized_source <> 'meta' then
    raise exception 'source_distribution_source_invalid';
  end if;
  if jsonb_typeof(p_members) <> 'array'
    or jsonb_array_length(p_members) < 1
    or jsonb_array_length(p_members) > 25 then
    raise exception 'source_distribution_members_invalid';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 10
    or char_length(trim(p_reason)) > 500 then
    raise exception 'source_distribution_reason_invalid';
  end if;

  with requested as (
    select profile_id, coalesce(weight, 1) as weight
    from jsonb_to_recordset(p_members) as item(profile_id uuid, weight integer)
  )
  select count(*) into member_count from requested;

  if member_count <> jsonb_array_length(p_members)
    or exists (
      with requested as (
        select profile_id, coalesce(weight, 1) as weight
        from jsonb_to_recordset(p_members) as item(profile_id uuid, weight integer)
      )
      select 1
      from requested r
      left join public.profiles p on p.id = r.profile_id
        and p.organization_id = p_organization_id
        and p.active = true
      where r.profile_id is null
        or r.weight not between 1 and 10
        or p.id is null
        or coalesce(p.commercial_role, p.role) <> 'broker'
    )
    or exists (
      with requested as (
        select profile_id
        from jsonb_to_recordset(p_members) as item(profile_id uuid, weight integer)
      )
      select 1
      from requested
      group by profile_id
      having count(*) > 1
    ) then
    raise exception 'source_distribution_members_invalid';
  end if;

  delete from public.lead_source_distribution_members
  where organization_id = p_organization_id
    and source_key = normalized_source;

  insert into public.lead_source_distribution_members (
    organization_id, source_key, profile_id, enabled, weight, configured_by, configured_at, updated_at
  )
  select p_organization_id, normalized_source, item.profile_id, true,
    coalesce(item.weight, 1), p_actor_id, now(), now()
  from jsonb_to_recordset(p_members) as item(profile_id uuid, weight integer);

  return jsonb_build_object(
    'sourceKey', normalized_source,
    'configured', member_count,
    'configuredAt', now()
  );
end;
$$;

create or replace function public.distribute_project_leads_v3(
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
  selected_source text;
  selected_channel text;
  selected_priority integer;
  selected_sla integer;
  selected_wait integer;
  selected_broker uuid;
  selected_load integer;
  selected_weight integer;
  selected_last timestamptz;
  distributed integer := 0;
  changed integer;
  assignments jsonb := '[]'::jsonb;
begin
  if p_limit < 1 or p_limit > 100 then raise exception 'distribution_limit_invalid'; end if;
  select coalesce(commercial_role, case role when 'admin' then 'director' else role end)
    into actor_role
  from public.profiles
  where id = p_actor_id and organization_id = p_organization_id and active = true;
  if actor_role is distinct from 'director' then raise exception 'distribution_actor_forbidden'; end if;
  if not exists (
    select 1 from public.developments
    where id = p_development_id and organization_id = p_organization_id
  ) then raise exception 'distribution_project_invalid'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || p_development_id::text, 57));
  for counter in 1..p_limit loop
    select l.id,
      lower(trim(coalesce(l.source, 'não informada'))),
      coalesce(r.priority, 5),
      coalesce(r.sla_minutes, 60),
      greatest(0, floor(extract(epoch from (now() - l.created_at)) / 60)::integer)
    into selected_lead, selected_source, selected_priority, selected_sla, selected_wait
    from public.leads l
    left join public.lead_distribution_priority_rules r
      on r.organization_id = p_organization_id
      and r.development_id = p_development_id
      and r.source_key = lower(trim(coalesce(l.source, 'não informada')))
      and r.enabled = true
    where l.organization_id = p_organization_id
      and l.development_id = p_development_id
      and l.assigned_to is null
      and (
        lower(trim(coalesce(l.source, ''))) not in ('meta', 'meta ads', 'meta lead ads', 'facebook', 'instagram')
        or exists (
          select 1 from public.lead_source_distribution_members source_member
          where source_member.organization_id = p_organization_id
            and source_member.source_key = 'meta'
            and source_member.enabled = true
        )
      )
    order by
      (greatest(0, floor(extract(epoch from (now() - l.created_at)) / 60))::numeric / coalesce(r.sla_minutes, 60)) desc,
      coalesce(r.priority, 5) desc,
      l.created_at,
      l.id
    for update of l skip locked
    limit 1;

    exit when selected_lead is null;
    selected_channel := case
      when selected_source in ('meta', 'meta ads', 'meta lead ads', 'facebook', 'instagram') then 'meta'
      else selected_source
    end;

    with candidates as (
      select p.id,
        (select count(*) from public.leads lp
          where lp.organization_id = p_organization_id
            and lp.development_id = p_development_id
            and lp.assigned_to = p.id
            and lp.status not in ('venda', 'ganho', 'perdido', 'arquivado', 'archived'))::integer as project_load,
        coalesce(m.weight, 1) as weight,
        m.last_assigned_at
      from public.profiles p
      join public.commercial_presence cp
        on cp.profile_id = p.id
        and cp.organization_id = p_organization_id
        and cp.availability = 'available'
        and cp.last_seen_at >= now() - interval '90 seconds'
      left join public.project_distribution_members m
        on m.development_id = p_development_id and m.profile_id = p.id
      left join public.broker_capacity_limits cap
        on cap.organization_id = p_organization_id and cap.profile_id = p.id
      where p.organization_id = p_organization_id
        and p.active = true
        and coalesce(p.commercial_role, p.role) = 'broker'
        and coalesce(m.enabled, true)
        and (select count(*) from public.leads la
          where la.organization_id = p_organization_id
            and la.assigned_to = p.id
            and la.status not in ('venda', 'ganho', 'perdido', 'arquivado', 'archived')) < coalesce(cap.max_active_leads, 100)
        and (select count(*) from public.leads lp
          where lp.organization_id = p_organization_id
            and lp.assigned_to = p.id
            and lp.development_id = p_development_id
            and lp.status not in ('venda', 'ganho', 'perdido', 'arquivado', 'archived')) < coalesce(cap.max_project_leads, 50)
        and (
          selected_channel <> 'meta'
          or exists (
            select 1 from public.lead_source_distribution_members source_member
            where source_member.organization_id = p_organization_id
              and source_member.source_key = 'meta'
              and source_member.profile_id = p.id
              and source_member.enabled = true
          )
        )
    )
    select id, project_load, weight, last_assigned_at
      into selected_broker, selected_load, selected_weight, selected_last
    from candidates
    order by (project_load::numeric / nullif(weight, 0)), last_assigned_at nulls first, id
    limit 1;

    if selected_broker is null then raise exception 'distribution_no_broker_with_capacity'; end if;

    update public.leads
      set assigned_to = selected_broker, updated_at = now()
    where id = selected_lead and organization_id = p_organization_id and assigned_to is null;
    get diagnostics changed = row_count;
    if changed <> 1 then continue; end if;

    update public.project_distribution_members
      set assignments_count = assignments_count + 1,
        last_assigned_at = now(), updated_at = now()
    where organization_id = p_organization_id
      and development_id = p_development_id
      and profile_id = selected_broker;

    insert into public.lead_distribution_events(
      organization_id, development_id, lead_id, assigned_to, actor_id, algorithm, score_snapshot, created_at
    ) values (
      p_organization_id, p_development_id, selected_lead, selected_broker, p_actor_id,
      'sla_source_priority_director_meta_v5',
      jsonb_build_object('source', selected_source, 'sourceChannel', selected_channel,
        'priority', selected_priority, 'slaMinutes', selected_sla, 'waitingMinutes', selected_wait,
        'selectedLoad', selected_load, 'selectedWeight', selected_weight,
        'metaRosterRestricted', selected_channel = 'meta'),
      now()
    );
    distributed := distributed + 1;
    assignments := assignments || jsonb_build_array(jsonb_build_object(
      'leadId', selected_lead, 'brokerId', selected_broker,
      'source', selected_source, 'sourceChannel', selected_channel,
      'waitingMinutes', selected_wait, 'priority', selected_priority,
      'slaMinutes', selected_sla, 'load', selected_load, 'weight', selected_weight
    ));
  end loop;

  return jsonb_build_object('distributed', distributed, 'assignments', assignments,
    'algorithm', 'sla_source_priority_director_meta_v5', 'actorRole', actor_role);
end;
$$;

revoke all on function public.configure_source_distribution_members(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.configure_source_distribution_members(uuid, uuid, text, jsonb, text) to service_role;
revoke all on function public.distribute_project_leads_v3(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.distribute_project_leads_v3(uuid, uuid, uuid, integer) to service_role;

commit;
