begin;
create table if not exists public.pipeline_stage_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stage_key text not null check (stage_key in ('novo','contato','qualificacao','visita','proposta','contrato','ganho','perdido','comprou_outro')),
  label text not null check (char_length(label) between 1 and 40), probability integer not null check (probability between 0 and 100),
  position integer not null check (position between 1 and 999), visible boolean not null default true,
  updated_by uuid references public.profiles(id), updated_at timestamptz not null default now(), primary key (organization_id, stage_key)
);
alter table public.pipeline_stage_settings enable row level security;
create policy pipeline_stage_settings_read on public.pipeline_stage_settings for select to authenticated using (organization_id = (select public.current_organization_id()));
revoke insert,update,delete on public.pipeline_stage_settings from authenticated,anon;
grant select on public.pipeline_stage_settings to authenticated;
grant all on public.pipeline_stage_settings to service_role;
commit;
