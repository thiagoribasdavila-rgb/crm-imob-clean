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

-- ════════════════════════════════════════════════════════════════════════════
-- CERCA — acrescentada em 2026-07-29, depois de MEDIR a divergência
--
-- Esta migration criou a tabela SEM `enable row level security` e SEM policy
-- nenhuma. No banco de homologação a cerca EXISTE (relrowsecurity = true, 2
-- policies) porque alguém a aplicou À MÃO, FORA do repositório. Ou seja: o banco
-- vivo está certo e o REPOSITÓRIO está errado — quem provisionar um ambiente novo
-- rodando estas migrations ganha a tabela ABERTA.
--
-- Por que isso vaza de verdade, e não só na teoria:
--   `has_table_privilege('anon','public.commission_rules','SELECT')` = true, e a
--   chave anon vai no bundle do navegador POR DESENHO. Sem RLS, o único obstáculo
--   entre a chave pública e o rateio de comissão de TODA imobiliária (quanto o
--   corretor leva, quanto a casa retém, quanto a incorporadora paga de prêmio) é
--   não saber o nome da tabela. As duas policies abaixo são a única barreira.
--
-- As duas são cópia fiel do que está VIVO, lido com pg_get_expr(pg_policy) em
-- 2026-07-29 — não foram escritas de memória.
--
-- `to public` (ausência de cláusula `to`) é o que está vivo, e é seguro aqui: para
-- a chave anon `auth.uid()` é NULL, nenhuma linha de `profiles` casa, o EXISTS dá
-- falso e a tabela devolve zero linhas. A cerca fecha por falta de perfil, não por
-- nome de papel.
--
-- Idempotente de propósito: `drop policy if exists` antes de criar, porque esta
-- migration vai rodar em bancos que JÁ têm as duas policies (homologação é um
-- deles) e um `create policy` cru abortaria o deploy inteiro com 42710.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.commission_rules enable row level security;

-- Quem é da organização LÊ a regra de comissão dela. Sem isto o corretor não
-- consegue conferir o próprio rateio.
drop policy if exists commission_rules_leitura on public.commission_rules;
create policy commission_rules_leitura
  on public.commission_rules
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = commission_rules.organization_id
    )
  );

-- ESCREVER é ato de diretoria. O percentual que define o salário de todo mundo
-- não pode ser editável por quem é pago por ele — por isso a escrita pede
-- admin ou director, e não repete a leitura.
drop policy if exists commission_rules_escrita_diretoria on public.commission_rules;
create policy commission_rules_escrita_diretoria
  on public.commission_rules
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = commission_rules.organization_id
        and (p.role = 'admin' or p.commercial_role = 'director')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = commission_rules.organization_id
        and (p.role = 'admin' or p.commercial_role = 'director')
    )
  );
