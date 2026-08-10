begin;

alter table public.atlas_decisions
  add column if not exists human_decision text
    check (human_decision is null or human_decision in ('accept', 'adapt', 'reject')),
  add column if not exists decision_reason text,
  add column if not exists responsible_id uuid references public.profiles(id) on delete set null,
  add column if not exists due_at timestamptz,
  add column if not exists outcome_key text
    check (outcome_key is null or outcome_key in ('positive', 'neutral', 'negative', 'not_executed')),
  add column if not exists outcome_notes text,
  add column if not exists outcome_recorded_by uuid references public.profiles(id) on delete set null,
  add column if not exists outcome_recorded_at timestamptz;

create index if not exists idx_atlas_decisions_learning_ledger
  on public.atlas_decisions (organization_id, responsible_id, due_at desc, outcome_recorded_at desc);

commit;
