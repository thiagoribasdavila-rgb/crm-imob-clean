-- ════════════════════════════════════════════════════════════════════════════
-- REGRA DE COMISSÃO POR PROJETO E INCORPORADORA
--
-- O banco já tinha `opportunities.commission_*` e `commission_events` — ambos
-- com ZERO linhas, e ambos sobre a APURAÇÃO de um negócio fechado (quanto
-- entrou, quanto falta receber).
--
-- Nenhum dizia QUEM GANHA QUANTO. `commission_split_percentage` é um número
-- só: não cabe "40% corretor, 10% gerente, 5% diretor, 45% imobiliária".
--
-- O prêmio fica separado de propósito: vem da incorporadora, por unidade, em
-- outra data e outro extrato. Somar junto faria o rateio parecer maior do que
-- é e quebraria a conferência com o parceiro.
--
-- Aplicada em 27/07/2026. Incremental — nada é apagado.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  developer_id uuid,
  development_id uuid,
  pct_corretor numeric(6,3) not null default 0,
  pct_gerente numeric(6,3) not null default 0,
  pct_diretor numeric(6,3) not null default 0,
  pct_imobiliaria numeric(6,3) not null default 0,
  premio_valor numeric(14,2) not null default 0,
  premio_moeda text not null default 'BRL',
  premio_observacao text,
  vigente_desde date not null default current_date,
  vigente_ate date,
  ativo boolean not null default true,
  criado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint soma_ate_cem check (pct_corretor + pct_gerente + pct_diretor + pct_imobiliaria <= 100),
  constraint percentuais_nao_negativos check (pct_corretor >= 0 and pct_gerente >= 0 and pct_diretor >= 0 and pct_imobiliaria >= 0 and premio_valor >= 0),
  constraint escopo_coerente check (development_id is null or developer_id is null)
);
