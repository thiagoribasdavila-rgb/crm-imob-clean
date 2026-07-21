begin;

-- Ponte aditiva: mantém o schema legado intacto e cria os nomes canônicos do V3.
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists commercial_role text,
  add column if not exists reports_to uuid references public.profiles(id) on delete set null,
  add column if not exists avatar_url text,
  add column if not exists phone text,
  add column if not exists creci text,
  add column if not exists bio text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='name') then
    execute 'update public.profiles set full_name=coalesce(nullif(trim(full_name),''''),nullif(trim(name),''''),''Usuário Atlas'') where full_name is null';
  else
    update public.profiles set full_name='Usuário Atlas' where full_name is null;
  end if;
end $$;

update public.profiles set
  commercial_role=coalesce(commercial_role,case role when 'admin' then 'director' when 'manager' then 'manager' when 'broker' then 'broker' else 'broker' end),
  updated_at=coalesce(updated_at,created_at,now())
where commercial_role is null;

alter table public.profiles
  alter column full_name set not null;

alter table public.profiles drop constraint if exists profiles_commercial_role_check;
alter table public.profiles add constraint profiles_commercial_role_check
  check (commercial_role in ('director', 'superintendent', 'manager', 'broker'));

create index if not exists profiles_org_commercial_role_idx on public.profiles(organization_id, commercial_role) where active=true;
create index if not exists profiles_reports_to_idx on public.profiles(reports_to) where active=true;

alter table public.leads
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists development_id uuid references public.developments(id) on delete set null,
  add column if not exists score integer not null default 0,
  add column if not exists bedrooms integer,
  add column if not exists preferred_regions text[] not null default '{}',
  add column if not exists purpose text,
  add column if not exists next_action_at timestamptz,
  add column if not exists last_interaction_at timestamptz,
  add column if not exists metadata jsonb not null default '{}',
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='assigned_user_id') then
    execute 'update public.leads set assigned_to=coalesce(assigned_to,assigned_user_id)';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='project_id') then
    execute 'update public.leads set development_id=coalesce(development_id,project_id)';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='score_ia') then
    execute 'update public.leads set score=coalesce(score,score_ia,0)';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='preferred_bedrooms') then
    execute 'update public.leads set bedrooms=coalesce(bedrooms,preferred_bedrooms)';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='preferred_neighborhoods') then
    execute 'update public.leads set preferred_regions=case when cardinality(preferred_regions)>0 then preferred_regions else coalesce(preferred_neighborhoods,''{}'') end';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='next_contact') then
    execute 'update public.leads set next_action_at=coalesce(next_action_at,next_contact)';
  end if;
end $$;

update public.leads set updated_at=coalesce(updated_at,created_at,now());

create index if not exists leads_org_assigned_created_idx on public.leads(organization_id, assigned_to, created_at desc);
create index if not exists leads_org_development_created_idx on public.leads(organization_id, development_id, created_at desc);

commit;
