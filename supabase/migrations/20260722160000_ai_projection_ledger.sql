-- Ledger de projeção × realizado — o loop de aprendizado do organismo de IA.
-- A IA grava a projeção no momento da decisão; uma semana depois casa com o
-- realizado. O erro por tipo de movimento calibra a confiança futura.
-- Núcleo: lib/ai/learning-loop.ts.

create table if not exists public.ai_projection_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  move_kind text not null,
  target text not null,
  projected jsonb not null,            -- { pessimista, esperado, otimista }
  confidence_at_decision text not null,
  decided_at_week text not null,       -- "YYYY-Www"
  realized_leads_delta numeric,        -- preenchido no fechamento da semana seguinte
  realized_at_week text,
  created_at timestamptz not null default now()
);

create index if not exists idx_projection_ledger_org_kind
  on public.ai_projection_ledger (organization_id, move_kind, decided_at_week desc);

alter table public.ai_projection_ledger enable row level security;

drop policy if exists ai_projection_ledger_select on public.ai_projection_ledger;
create policy ai_projection_ledger_select on public.ai_projection_ledger
  for select using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

comment on table public.ai_projection_ledger is
  'Projeção × realizado por movimento — alimenta trustByMoveKind (lib/ai/learning-loop) para a IA calibrar a própria confiança.';
