-- ATLAS AI OS - Fase 11/100
-- RASCUNHO GERADO VIA SUPABASE CLI. NAO APLICAR EM PRODUCAO.
--
-- Promocao permitida somente depois de:
--   1. clone de staging isolado e sanitizado;
--   2. fingerprint remoto e backup restauravel aprovados;
--   3. mapeamentos de papel e hierarquia revisados por humano;
--   4. matriz de contratos, RLS, privilegios e rollback aprovada.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Esta trava impede que o rascunho seja executado por engano. O valor deve ser
-- configurado no clone de staging antes da promocao do arquivo para migrations/.
do $atlas_reconciliation_guard$
declare
  target_environment text := current_setting('app.atlas_reconciliation_environment', true);
begin
  if target_environment is distinct from 'staging_clone' then
    raise exception 'atlas_reconciliation_staging_only';
  end if;

  if to_regclass('public.profiles') is null or to_regclass('public.leads') is null then
    raise exception 'atlas_reconciliation_base_tables_missing';
  end if;

  if to_regclass('public.developments') is null then
    raise exception 'atlas_reconciliation_developments_missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'name'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'role'
  ) then
    raise exception 'atlas_reconciliation_legacy_profile_contract_missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads'
      and column_name = 'assigned_user_id' and data_type = 'uuid'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads'
      and column_name = 'project_id' and data_type = 'uuid'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads'
      and column_name = 'score_ia' and data_type = 'integer'
  ) then
    raise exception 'atlas_reconciliation_legacy_lead_contract_missing_or_invalid';
  end if;
end;
$atlas_reconciliation_guard$;

-- Os campos novos entram primeiro como nullable. Nenhum default pode esconder
-- o valor legado antes do backfill e das invariantes.
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists commercial_role text,
  add column if not exists reports_to uuid references public.profiles(id) on delete set null;

alter table public.leads
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists development_id uuid references public.developments(id) on delete set null,
  add column if not exists score integer;

alter table public.leads alter column score drop default;
alter table public.leads alter column score drop not null;

-- Nada e inferido silenciosamente. Qualquer ambiguidade cancela a transacao e
-- exige decisao humana antes de uma nova tentativa em staging.
do $atlas_reconciliation_preflight$
begin
  if exists (
    select 1 from public.profiles
    where role is null or lower(trim(role::text)) not in ('admin', 'manager', 'broker')
  ) then
    raise exception 'atlas_reconciliation_unknown_legacy_role';
  end if;

  if exists (
    select 1 from public.profiles
    where nullif(trim(name), '') is null
      and (nullif(trim(full_name), '') is null or trim(full_name) = 'Usuario Atlas')
  ) then
    raise exception 'atlas_reconciliation_profile_name_missing';
  end if;

  if exists (
    select 1 from public.profiles
    where nullif(trim(name), '') is not null
      and nullif(trim(full_name), '') is not null
      and trim(full_name) not in ('Usuario Atlas', 'Usuário Atlas')
      and trim(full_name) <> trim(name)
  ) then
    raise exception 'atlas_reconciliation_profile_name_conflict';
  end if;

  if exists (
    select 1 from public.profiles
    where commercial_role is not null
      and commercial_role is distinct from case lower(trim(role::text))
        when 'admin' then 'director'
        when 'manager' then 'manager'
        when 'broker' then 'broker'
      end
  ) then
    raise exception 'atlas_reconciliation_profile_role_conflict';
  end if;

  if exists (
    select 1 from public.leads
    where assigned_user_id is not null and assigned_to is not null
      and assigned_user_id <> assigned_to
  ) then
    raise exception 'atlas_reconciliation_owner_conflict';
  end if;

  if exists (
    select 1 from public.leads
    where project_id is not null and development_id is not null
      and project_id <> development_id
  ) then
    raise exception 'atlas_reconciliation_project_conflict';
  end if;

  if exists (
    select 1 from public.leads
    where score_ia is not null and (score_ia < 0 or score_ia > 100)
  ) or exists (
    select 1 from public.leads
    where score is not null and (score < 0 or score > 100)
  ) then
    raise exception 'atlas_reconciliation_score_out_of_range';
  end if;

  -- Zero no campo novo e score_ia nao zero e o defeito conhecido da ponte.
  -- Qualquer outra divergencia nao e automaticamente resolvida.
  if exists (
    select 1 from public.leads
    where score_ia is not null and score is not null
      and score_ia <> score and score_ia <> 0 and score <> 0
  ) then
    raise exception 'atlas_reconciliation_score_conflict';
  end if;

  -- Grants so serao alterados se as politicas comerciais ja existirem.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and roles @> array['authenticated']::name[]
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'leads'
      and roles @> array['authenticated']::name[]
  ) then
    raise exception 'atlas_reconciliation_rls_policy_missing';
  end if;
end;
$atlas_reconciliation_preflight$;

update public.profiles
set full_name = trim(name)
where nullif(trim(name), '') is not null
  and (
    nullif(trim(full_name), '') is null
    or trim(full_name) in ('Usuario Atlas', 'Usuário Atlas')
  );

update public.profiles
set commercial_role = case lower(trim(role::text))
  when 'admin' then 'director'
  when 'manager' then 'manager'
  when 'broker' then 'broker'
end
where commercial_role is null;

-- reports_to nao e atualizado aqui: hierarquia exige mapa humano aprovado.

update public.leads
set assigned_to = assigned_user_id
where assigned_to is null and assigned_user_id is not null;

update public.leads
set assigned_user_id = assigned_to
where assigned_user_id is null and assigned_to is not null;

update public.leads
set development_id = project_id
where development_id is null and project_id is not null;

update public.leads
set project_id = development_id
where project_id is null and development_id is not null;

update public.leads
set score = score_ia
where score_ia is not null and (score is null or score = 0);

update public.leads
set score_ia = score
where score is not null and (score_ia is null or score_ia = 0);

update public.leads set score = 0 where score is null;
update public.leads set score_ia = score where score_ia is null;

do $atlas_reconciliation_invariants$
begin
  if exists (
    select 1 from public.profiles
    where nullif(trim(full_name), '') is null or commercial_role is null
  ) then
    raise exception 'atlas_reconciliation_profile_backfill_incomplete';
  end if;

  if exists (
    select 1 from public.leads
    where assigned_user_id is distinct from assigned_to
      or project_id is distinct from development_id
      or score_ia is distinct from score
  ) then
    raise exception 'atlas_reconciliation_lead_backfill_incomplete';
  end if;
end;
$atlas_reconciliation_invariants$;

alter table public.profiles alter column full_name set not null;
alter table public.leads alter column score set default 0;
alter table public.leads alter column score set not null;

alter table public.leads drop constraint if exists leads_score_range_check;
alter table public.leads add constraint leads_score_range_check check (score between 0 and 100);

create schema if not exists private;
revoke all on schema private from public, anon;

create or replace function private.sync_lead_compatibility_contracts()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $atlas_sync$
declare
  legacy_changed boolean;
  canonical_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.assigned_user_id is not null and new.assigned_to is not null
      and new.assigned_user_id <> new.assigned_to then
      raise exception 'lead_contract_conflict:owner';
    end if;
    new.assigned_to := coalesce(new.assigned_to, new.assigned_user_id);
    new.assigned_user_id := coalesce(new.assigned_user_id, new.assigned_to);

    if new.project_id is not null and new.development_id is not null
      and new.project_id <> new.development_id then
      raise exception 'lead_contract_conflict:project';
    end if;
    new.development_id := coalesce(new.development_id, new.project_id);
    new.project_id := coalesce(new.project_id, new.development_id);

    if new.score_ia is not null and new.score is not null and new.score_ia <> new.score then
      if new.score = 0 then
        new.score := new.score_ia;
      elsif new.score_ia = 0 then
        new.score_ia := new.score;
      else
        raise exception 'lead_contract_conflict:score';
      end if;
    end if;
    new.score := coalesce(new.score, new.score_ia, 0);
    new.score_ia := coalesce(new.score_ia, new.score, 0);
  else
    legacy_changed := new.assigned_user_id is distinct from old.assigned_user_id;
    canonical_changed := new.assigned_to is distinct from old.assigned_to;
    if legacy_changed and canonical_changed and new.assigned_user_id is distinct from new.assigned_to then
      raise exception 'lead_contract_conflict:owner';
    elsif legacy_changed then
      new.assigned_to := new.assigned_user_id;
    elsif canonical_changed then
      new.assigned_user_id := new.assigned_to;
    elsif new.assigned_user_id is distinct from new.assigned_to then
      raise exception 'lead_contract_conflict:owner';
    end if;

    legacy_changed := new.project_id is distinct from old.project_id;
    canonical_changed := new.development_id is distinct from old.development_id;
    if legacy_changed and canonical_changed and new.project_id is distinct from new.development_id then
      raise exception 'lead_contract_conflict:project';
    elsif legacy_changed then
      new.development_id := new.project_id;
    elsif canonical_changed then
      new.project_id := new.development_id;
    elsif new.project_id is distinct from new.development_id then
      raise exception 'lead_contract_conflict:project';
    end if;

    legacy_changed := new.score_ia is distinct from old.score_ia;
    canonical_changed := new.score is distinct from old.score;
    if legacy_changed and canonical_changed and new.score_ia is distinct from new.score then
      raise exception 'lead_contract_conflict:score';
    elsif legacy_changed then
      new.score := new.score_ia;
    elsif canonical_changed then
      new.score_ia := new.score;
    elsif new.score_ia is distinct from new.score then
      raise exception 'lead_contract_conflict:score';
    end if;
  end if;

  if new.score is null or new.score_ia is null
    or new.score not between 0 and 100 or new.score_ia not between 0 and 100 then
    raise exception 'lead_contract_conflict:score_range';
  end if;

  return new;
end;
$atlas_sync$;

revoke all on function private.sync_lead_compatibility_contracts() from public, anon, authenticated;

drop trigger if exists sync_lead_compatibility_contracts on public.leads;
create trigger sync_lead_compatibility_contracts
before insert or update of assigned_user_id, assigned_to, project_id, development_id, score_ia, score
on public.leads
for each row execute function private.sync_lead_compatibility_contracts();

create index if not exists leads_org_assigned_created_idx
  on public.leads (organization_id, assigned_to, created_at desc);
create index if not exists leads_org_development_created_idx
  on public.leads (organization_id, development_id, created_at desc);

-- Privilegios da Data API e RLS sao controles separados.
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.leads enable row level security;

revoke all on table public.organizations, public.profiles, public.leads from anon;
revoke all on table public.organizations, public.profiles, public.leads from authenticated;

grant select (id, name, slug, plan, active)
  on table public.organizations to authenticated;
grant update (name, slug)
  on table public.organizations to authenticated;

grant select (
  id, organization_id, name, full_name, role, commercial_role, reports_to,
  access_role, active, avatar_url, phone, creci, bio, created_at, updated_at
) on table public.profiles to authenticated;
grant update (name, full_name, avatar_url, phone, creci, bio, updated_at)
  on table public.profiles to authenticated;

grant select, insert, update on table public.leads to authenticated;
grant all on table public.organizations, public.profiles, public.leads to service_role;

comment on function private.sync_lead_compatibility_contracts() is
  'Compatibilidade temporaria Atlas: sincroniza contratos legado/canonico e rejeita conflitos.';

commit;
