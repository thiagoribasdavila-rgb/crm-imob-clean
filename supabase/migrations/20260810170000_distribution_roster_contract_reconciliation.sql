begin;

-- Reconciles the director-facing project roster with the v6 distribution
-- engine already used by the homologation database. This migration is
-- intentionally additive and preserves the legacy roster as a compatibility
-- mirror while the application converges on distribution_roster.
create table if not exists public.distribution_roster (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  escopo text not null,
  escopo_id text not null,
  profile_id uuid not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  posicao smallint
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.distribution_roster'::regclass
      and conname = 'distribution_roster_escopo_check'
  ) then
    alter table public.distribution_roster
      add constraint distribution_roster_escopo_check
      check (escopo in ('projeto', 'campanha'));
  end if;
end;
$$;

create unique index if not exists distribution_roster_unique
  on public.distribution_roster (organization_id, escopo, escopo_id, profile_id);
create index if not exists distribution_roster_busca
  on public.distribution_roster (organization_id, escopo, escopo_id)
  where ativo;
create index if not exists distribution_roster_ordem
  on public.distribution_roster (organization_id, escopo, escopo_id, posicao)
  where ativo;

alter table public.distribution_roster enable row level security;

drop policy if exists distribution_roster_read on public.distribution_roster;
drop policy if exists distribution_roster_leitura on public.distribution_roster;
create policy distribution_roster_read
  on public.distribution_roster
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.organization_id = distribution_roster.organization_id
        and p.active = true
    )
  );

drop policy if exists distribution_roster_write on public.distribution_roster;
drop policy if exists distribution_roster_escrita on public.distribution_roster;
drop policy if exists distribution_roster_director_write on public.distribution_roster;
create policy distribution_roster_director_write
  on public.distribution_roster
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.organization_id = distribution_roster.organization_id
        and p.active = true
        and lower(replace(replace(coalesce(p.commercial_role::text, p.role::text, ''), '_', '-'), ' ', '-'))
          in ('director', 'diretor', 'diretor-decisor', 'owner', 'admin', 'administrator')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.organization_id = distribution_roster.organization_id
        and p.active = true
        and lower(replace(replace(coalesce(p.commercial_role::text, p.role::text, ''), '_', '-'), ' ', '-'))
          in ('director', 'diretor', 'diretor-decisor', 'owner', 'admin', 'administrator')
    )
  );

revoke all on table public.distribution_roster from public, anon;
grant select on table public.distribution_roster to authenticated;
grant all on table public.distribution_roster to service_role;

create or replace function public.configure_project_distribution_roster_v1(
  p_actor_id uuid,
  p_organization_id uuid,
  p_development_id uuid,
  p_members jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_member jsonb;
  v_profile_id uuid;
  v_enabled boolean;
  v_weight integer;
  v_position smallint := 0;
  v_enabled_count integer := 0;
  v_member_ids uuid[] := '{}';
  v_seen_ids uuid[] := '{}';
begin
  select lower(replace(replace(coalesce(p.commercial_role::text, p.role::text, ''), '_', '-'), ' ', '-'))
    into v_actor_role
  from public.profiles p
  where p.id = p_actor_id
    and p.organization_id = p_organization_id
    and p.active = true;

  if v_actor_role is null or v_actor_role not in (
    'director', 'diretor', 'diretor-decisor', 'owner', 'admin', 'administrator'
  ) then
    raise exception 'DIRECTOR_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.developments d
    where d.id = p_development_id
      and d.organization_id = p_organization_id
  ) then
    raise exception 'DEVELOPMENT_OUT_OF_SCOPE' using errcode = '42501';
  end if;

  if p_members is null
    or jsonb_typeof(p_members) <> 'array'
    or jsonb_array_length(p_members) < 1
    or jsonb_array_length(p_members) > 100 then
    raise exception 'INVALID_DISTRIBUTION_ROSTER' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':project-roster:' || p_development_id::text, 0)
  );

  for v_member in select value from jsonb_array_elements(p_members)
  loop
    begin
      v_profile_id := (v_member ->> 'profile_id')::uuid;
      v_enabled := (v_member ->> 'enabled')::boolean;
      v_weight := (v_member ->> 'weight')::integer;
    exception when others then
      raise exception 'INVALID_DISTRIBUTION_MEMBER' using errcode = '22023';
    end;

    if v_profile_id = any(v_seen_ids)
      or v_enabled is null
      or v_weight is null
      or v_weight < 1
      or v_weight > 10
      or not exists (
        select 1 from public.profiles p
        where p.id = v_profile_id
          and p.organization_id = p_organization_id
          and p.active = true
          and lower(replace(replace(coalesce(p.commercial_role::text, p.role::text, ''), '_', '-'), ' ', '-'))
            in ('broker', 'corretor')
      ) then
      raise exception 'BROKER_OUT_OF_SCOPE' using errcode = '42501';
    end if;

    v_seen_ids := array_append(v_seen_ids, v_profile_id);
    v_member_ids := array_append(v_member_ids, v_profile_id);
    if v_enabled then
      v_enabled_count := v_enabled_count + 1;
      v_position := v_position + 1;
    end if;

    insert into public.distribution_roster (
      organization_id, escopo, escopo_id, profile_id, ativo,
      posicao, created_by, updated_at
    ) values (
      p_organization_id, 'projeto', p_development_id::text, v_profile_id,
      v_enabled, case when v_enabled then v_position else null end,
      p_actor_id, now()
    )
    on conflict (organization_id, escopo, escopo_id, profile_id)
    do update set
      ativo = excluded.ativo,
      posicao = excluded.posicao,
      updated_at = excluded.updated_at;

    insert into public.project_distribution_members (
      organization_id, development_id, profile_id, enabled, weight, updated_at
    ) values (
      p_organization_id, p_development_id, v_profile_id, v_enabled, v_weight, now()
    )
    on conflict (development_id, profile_id)
    do update set
      enabled = excluded.enabled,
      weight = excluded.weight,
      updated_at = excluded.updated_at;
  end loop;

  if v_enabled_count < 1 then
    raise exception 'EMPTY_DISTRIBUTION_ROSTER' using errcode = '22023';
  end if;

  delete from public.distribution_roster r
  where r.organization_id = p_organization_id
    and r.escopo = 'projeto'
    and r.escopo_id = p_development_id::text
    and not (r.profile_id = any(v_member_ids));

  update public.project_distribution_members m
  set enabled = false, updated_at = now()
  where m.organization_id = p_organization_id
    and m.development_id = p_development_id
    and not (m.profile_id = any(v_member_ids));

  return jsonb_build_object(
    'development_id', p_development_id,
    'configured', jsonb_array_length(p_members),
    'enabled', v_enabled_count,
    'engine', 'distribution_roster_v6'
  );
end;
$$;

create or replace function public.configure_project_distribution_member_v1(
  p_actor_id uuid,
  p_organization_id uuid,
  p_development_id uuid,
  p_profile_id uuid,
  p_enabled boolean,
  p_weight integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_members jsonb;
begin
  select jsonb_agg(
    jsonb_build_object(
      'profile_id', p.id,
      'enabled', case
        when p.id = p_profile_id then p_enabled
        when exists (
          select 1 from public.distribution_roster existing_roster
          where existing_roster.organization_id = p_organization_id
            and existing_roster.escopo = 'projeto'
            and existing_roster.escopo_id = p_development_id::text
        ) then coalesce(r.ativo, false)
        else coalesce(m.enabled, true)
      end,
      'weight', case when p.id = p_profile_id then p_weight else coalesce(m.weight, 1) end
    ) order by coalesce(r.posicao, 32767), p.name, p.id
  )
  into v_members
  from public.profiles p
  left join public.distribution_roster r
    on r.organization_id = p_organization_id
   and r.escopo = 'projeto'
   and r.escopo_id = p_development_id::text
   and r.profile_id = p.id
  left join public.project_distribution_members m
    on m.organization_id = p_organization_id
   and m.development_id = p_development_id
   and m.profile_id = p.id
  where p.organization_id = p_organization_id
    and p.active = true
    and lower(replace(replace(coalesce(p.commercial_role::text, p.role::text, ''), '_', '-'), ' ', '-'))
      in ('broker', 'corretor');

  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id
      and p.organization_id = p_organization_id
      and p.active = true
      and lower(replace(replace(coalesce(p.commercial_role::text, p.role::text, ''), '_', '-'), ' ', '-'))
        in ('broker', 'corretor')
  ) then
    raise exception 'BROKER_OUT_OF_SCOPE' using errcode = '42501';
  end if;

  return public.configure_project_distribution_roster_v1(
    p_actor_id,
    p_organization_id,
    p_development_id,
    v_members
  );
end;
$$;

revoke all on function public.configure_project_distribution_roster_v1(uuid,uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.configure_project_distribution_roster_v1(uuid,uuid,uuid,jsonb)
  to service_role;
revoke all on function public.configure_project_distribution_member_v1(uuid,uuid,uuid,uuid,boolean,integer)
  from public, anon, authenticated;
grant execute on function public.configure_project_distribution_member_v1(uuid,uuid,uuid,uuid,boolean,integer)
  to service_role;

do $$
begin
  if to_regprocedure(
    'public.distribute_project_leads_v6(uuid,uuid,uuid,integer,integer)'
  ) is not null then
    execute 'revoke all on function public.distribute_project_leads_v6(uuid,uuid,uuid,integer,integer) from public, anon, authenticated';
    execute 'grant execute on function public.distribute_project_leads_v6(uuid,uuid,uuid,integer,integer) to service_role';
  end if;
end;
$$;

commit;
