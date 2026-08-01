-- Verba por produto (empreendimento) — o campo de estratégia clara do marketing.
-- A liderança define quanto investir por produto/semana e a meta de CAC;
-- o relatório cruza com o gasto real (marketing_spend) para pacing + eficiência.

create table if not exists public.product_budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product text not null,               -- empreendimento / produto (ex.: "Spin Mood")
  developer text,                       -- incorporador (ex.: "SPIN")
  weekly_budget numeric not null default 0,
  target_cac numeric,                   -- CAC-alvo por venda (opcional)
  active boolean not null default true,
  set_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, product)
);

create index if not exists idx_product_budgets_org on public.product_budgets (organization_id, active);
alter table public.product_budgets enable row level security;
