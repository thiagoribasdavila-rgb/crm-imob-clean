/*
  ATLAS 10X — FASE 4/24
  PROPOSTA NÃO APLICADA.

  Objetivo: reconciliar a hierarquia comercial completa e garantir que uma
  mudança isolada de access_role também passe pela validação.

  Uso permitido agora: revisão e ensaio em banco descartável.
  Uso proibido agora: homologação compartilhada ou produção.
  Pré-requisitos: paridade da Fase 3, backup testado, tenant controlado,
  matriz de perfis aprovada e revisão explícita de grants/policies.
*/

begin;

create or replace function private.validate_commercial_hierarchy()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  supervisor public.profiles%rowtype;
begin
  if new.commercial_role is null or new.access_role is null then
    raise exception 'rbac_role_required';
  end if;

  if new.access_role = 'admin' then
    if new.commercial_role <> 'director' or new.reports_to is not null then
      raise exception 'admin_requires_director_root';
    end if;
    return new;
  end if;

  if new.access_role = 'director_decisor' then
    if new.commercial_role <> 'director' or new.reports_to is not null then
      raise exception 'decision_director_requires_root';
    end if;
    return new;
  end if;

  if new.commercial_role = 'director' then
    raise exception 'director_requires_executive_access_role';
  end if;

  if new.reports_to is null or new.reports_to = new.id then
    raise exception 'valid_supervisor_required';
  end if;

  select *
  into supervisor
  from public.profiles
  where id = new.reports_to;

  if supervisor.id is null
     or supervisor.organization_id <> new.organization_id
     or not supervisor.active then
    raise exception 'supervisor_outside_organization_or_inactive';
  end if;

  if new.commercial_role = 'superintendent' then
    if new.access_role <> 'director'
       or supervisor.commercial_role <> 'director' then
      raise exception 'superintendent_requires_director';
    end if;
  elsif new.commercial_role = 'manager' then
    if new.access_role <> 'director'
       or supervisor.commercial_role <> 'superintendent' then
      raise exception 'manager_requires_superintendent';
    end if;
  elsif new.commercial_role = 'broker' then
    if new.access_role <> 'broker'
       or supervisor.commercial_role <> 'manager' then
      raise exception 'broker_requires_manager';
    end if;
  else
    raise exception 'invalid_commercial_role';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_commercial_hierarchy on public.profiles;
create trigger validate_commercial_hierarchy
before insert or update of organization_id, access_role, commercial_role, reports_to, active
on public.profiles
for each row execute function private.validate_commercial_hierarchy();

revoke all on function private.validate_commercial_hierarchy() from public;

-- O rollback intencional impede aplicação acidental deste artefato de revisão.
rollback;
