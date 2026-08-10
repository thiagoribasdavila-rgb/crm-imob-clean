-- ATLAS AI OS - Fase 30/100
-- Contrato minimo exclusivo do banco local efemero. Nao contem leads ou dados reais.

begin;

do $phase30_local_only$
begin
  if current_setting('app.atlas_phase30_environment', true) is distinct from 'local_ephemeral' then
    raise exception 'phase30_local_ephemeral_only';
  end if;
end;
$phase30_local_only$;

do $phase30_roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$phase30_roles$;

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists phase30_profiles_organization_idx
  on public.profiles (organization_id);

revoke all on table public.organizations from public, anon, authenticated;
revoke all on table public.profiles from public, anon, authenticated;

commit;
