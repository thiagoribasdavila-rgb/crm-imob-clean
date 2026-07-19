create table if not exists public.project_intelligence_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete cascade,
  onboarding_status text not null default 'study_pending' check (onboarding_status in ('study_pending','review_pending','ready','published')),
  readiness_percent integer not null default 20 check (readiness_percent between 0 and 100),
  region_study jsonb not null default '{}'::jsonb,
  commercial_brief jsonb not null default '{}'::jsonb,
  ai_context jsonb not null default '{}'::jsonb,
  source_register jsonb not null default '[]'::jsonb,
  missing_information jsonb not null default '[]'::jsonb,
  last_enriched_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, development_id)
);

create index if not exists project_intelligence_development_idx
  on public.project_intelligence_profiles (development_id, onboarding_status);

alter table public.project_intelligence_profiles enable row level security;
drop policy if exists project_intelligence_org_access on public.project_intelligence_profiles;
create policy project_intelligence_org_access on public.project_intelligence_profiles
  for select to authenticated
  using (organization_id = (select organization_id from public.profiles where id = (select auth.uid())));
revoke insert, update, delete on public.project_intelligence_profiles from anon, authenticated;
grant select on public.project_intelligence_profiles to authenticated;

create or replace function public.scaffold_project_intelligence()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_intelligence_profiles (
    organization_id, development_id, region_study, commercial_brief, ai_context, missing_information
  ) values (
    new.organization_id,
    new.id,
    jsonb_build_object(
      'status', 'pending_enrichment',
      'location', jsonb_build_object('neighborhood', new.neighborhood, 'city', new.city, 'state', new.state),
      'sections', jsonb_build_array('mobilidade','educacao','saude','comercio_e_servicos','lazer','perfil_de_demanda','concorrencia','preco_por_m2')
    ),
    jsonb_build_object('positioning', '', 'personas', '[]'::jsonb, 'objections', '[]'::jsonb, 'talking_points', '[]'::jsonb),
    jsonb_build_object('safe_to_generate', false, 'knowledge_status', 'waiting_for_sources', 'project_name', new.name),
    jsonb_build_array('book','tabela_de_vendas','espelho_de_vendas','data_de_entrega','fluxo_de_pagamento','fontes_regionais')
  ) on conflict (organization_id, development_id) do nothing;
  return new;
end $$;

drop trigger if exists scaffold_project_intelligence_after_insert on public.developments;
create trigger scaffold_project_intelligence_after_insert
after insert on public.developments for each row execute function public.scaffold_project_intelligence();

insert into public.project_intelligence_profiles (organization_id, development_id)
select organization_id, id from public.developments
on conflict (organization_id, development_id) do nothing;

comment on table public.project_intelligence_profiles is
  'Dossiê governado criado automaticamente para todo projeto; separa fatos, estudo regional, briefing comercial e contexto futuro das IAs.';
