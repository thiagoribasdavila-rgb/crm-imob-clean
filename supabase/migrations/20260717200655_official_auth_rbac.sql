begin;

alter table public.profiles
  add column if not exists access_role text;

update public.profiles
set access_role = case
  when role = 'admin' then 'admin'
  when commercial_role = 'director' then 'director_decisor'
  when commercial_role in ('superintendent', 'manager') then 'director'
  else 'broker'
end
where access_role is null;

alter table public.profiles
  alter column access_role set not null;

alter table public.profiles
  drop constraint if exists profiles_access_role_check;
alter table public.profiles
  add constraint profiles_access_role_check
  check (access_role in ('admin', 'director_decisor', 'director', 'broker'));

create index if not exists profiles_org_access_role_active_idx
  on public.profiles (organization_id, access_role, active);

create or replace function private.validate_commercial_hierarchy()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare supervisor public.profiles%rowtype;
begin
  if new.commercial_role is null or new.access_role is null then
    raise exception 'rbac_role_required';
  end if;

  -- Perfis desativados preservam histórico e podem ser reorganizados sem manter
  -- uma cadeia comercial ativa. O reset oficial usa exatamente esta propriedade.
  if not new.active then return new; end if;

  if new.access_role in ('admin', 'director_decisor') then
    if new.commercial_role <> 'director' or new.reports_to is not null then
      raise exception 'executive_role_requires_root_scope';
    end if;
    return new;
  end if;

  if new.reports_to is null or new.reports_to = new.id then
    raise exception 'valid_supervisor_required';
  end if;
  select * into supervisor from public.profiles where id = new.reports_to;
  if supervisor.id is null or supervisor.organization_id <> new.organization_id or not supervisor.active then
    raise exception 'supervisor_outside_organization_or_inactive';
  end if;

  if new.access_role = 'director' then
    if new.commercial_role <> 'manager' or supervisor.access_role <> 'director_decisor' then
      raise exception 'operational_director_requires_decision_director';
    end if;
  elsif new.access_role = 'broker' then
    if new.commercial_role <> 'broker' or supervisor.access_role <> 'director' then
      raise exception 'broker_requires_operational_director';
    end if;
  else
    raise exception 'invalid_access_role';
  end if;
  return new;
end;
$$;

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
    new.access_role is distinct from old.access_role or
    new.commercial_role is distinct from old.commercial_role or
    new.reports_to is distinct from old.reports_to or
    new.active is distinct from old.active
  ) then raise exception 'profile_authorization_fields_are_server_managed'; end if;
  return new;
end;
$$;

-- O RBAC oficial usa profiles/RLS como fonte de autorização. app_metadata serve
-- apenas como espelho do servidor e nunca substitui a validação no banco.
comment on column public.profiles.access_role is
  'RBAC oficial Atlas: admin, director_decisor, director ou broker. Campo gerenciado somente no servidor.';

commit;
