-- Calibração central das IAs — overrides por organização (defaults vivem no código).
-- Parâmetros e trilhos: lib/ai/calibration.ts. Política Meta (HOUSING) é travada no código.

create table if not exists public.ai_calibration (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  overrides jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.ai_calibration enable row level security;

-- Leitura: membros da organização. Escrita: só via service role (rota valida diretor).
drop policy if exists ai_calibration_select on public.ai_calibration;
create policy ai_calibration_select on public.ai_calibration
  for select using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

comment on table public.ai_calibration is
  'Overrides de calibração das IAs por organização; merge com clamp em lib/ai/calibration.ts (mergeCalibration).';
