-- ============================================================================
-- INVESTIMENTO DE MÍDIA NÃO PODE SER CONTADO DUAS VEZES
-- ============================================================================
--
-- ── O que foi medido em 2026-07-31 ──────────────────────────────────────────
--
-- `marketing_spend` tem SETE leitores no produto (relatório de custo, stop-loss,
-- desempenho de anúncio, briefing do diretor, contexto de campanha da lead,
-- qualidade de campanha, relatório semanal do incorporador) e **ZERO
-- escritores**. A tabela está vazia, e todos os sete respondem R$ 0.
--
-- Enquanto isso, a conta de anúncios da Meta registra **R$ 3.612,01 gastos nos
-- últimos 30 dias**, em 7 campanhas e 94 combinações dia×campanha. O dinheiro
-- saiu. O CRM não sabe.
--
-- Este arquivo prepara o terreno para o importador. Ele NÃO importa nada.
--
-- ── Por que um índice único vem ANTES do importador ─────────────────────────
--
-- Um importador diário sem chave natural é uma máquina de somar gasto que não
-- aconteceu: rodou duas vezes no mesmo dia, o custo dobra, o CPL dobra, o ROAS
-- cai pela metade — e ninguém percebe, porque o número continua *plausível*.
-- Investimento contado em dobro é pior que investimento ausente: o ausente se
-- vê, o dobrado se acredita.
--
-- A chave natural de um gasto de mídia é (organização, campanha, dia). Com o
-- índice único, o importador usa `upsert` e reimportar vira operação idempotente
-- — que é exatamente o que um cron precisa ser, porque cron reexecuta.
--
-- Verificado antes de criar: `select count(*) from marketing_spend` = 0. Não há
-- duplicata pré-existente a resolver, e a criação não pode falhar por conflito.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--
--   drop index if exists public.marketing_spend_org_campanha_dia_uidx;
--
-- Reverter só remove a garantia; nenhuma linha é perdida.
-- ============================================================================

create unique index if not exists marketing_spend_org_campanha_dia_uidx
  on public.marketing_spend (organization_id, campaign_id, spend_date);

comment on index public.marketing_spend_org_campanha_dia_uidx is
  'Chave natural do gasto de mídia: uma linha por organização, campanha e dia. '
  'Existe para o importador diário poder fazer upsert e ser idempotente — sem '
  'ela, reexecutar o cron dobraria o investimento registrado.';

-- ── Índice de leitura por período ──────────────────────────────────────────
--
-- Todo leitor de `marketing_spend` filtra por organização e por faixa de
-- `spend_date` (`gte(inicio)`), e nenhum índice cobria a data. Com a tabela
-- vazia isso nunca doeu; com 94 linhas por mês por conta, passa a doer.
create index if not exists marketing_spend_org_dia_idx
  on public.marketing_spend (organization_id, spend_date desc);

-- ── RLS ────────────────────────────────────────────────────────────────────
--
-- A tabela já tem RLS habilitada e política por organização (verificado em
-- pg_policies antes desta migration). Nada a alterar: índice não muda política,
-- e criar política nova aqui sobreporia a que já protege a tabela.
