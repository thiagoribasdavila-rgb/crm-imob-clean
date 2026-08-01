-- ROLLBACK de 20260730060000_finops_uso_de_infra.sql
--
-- Desliga a leitura de consumo de infraestrutura do Centro de Custo (§8).
--
-- ── O que acontece com o painel depois disto ──────────────────────────────────
--
-- Nada quebra e nada mente: a rota /api/v1/finops/cost-center trata a ausência
-- da função como "consumo de banco e de armazenamento NÃO MEDIDO — a função
-- public.finops_uso_de_infra não existe neste banco", e a cobertura do painel
-- cai, o que é o comportamento correto. É por isso que o rollback é seguro: o
-- painel perde precisão declarando a perda, em vez de passar a somar zero.
--
-- Este arquivo NÃO cria, não altera e não apaga tabela alguma — a migration só
-- criou uma função de leitura. Não há dado a perder.
--
-- Aplicar com:
--   psql "$DATABASE_URL" -f supabase/rollbacks/20260730060000_finops_uso_de_infra.down.sql
--
-- NUNCA mova este arquivo para supabase/migrations/: um `.down.sql` lá dentro
-- vira versão duplicada e o `db push` aborta no último arquivo, depois de já ter
-- aplicado os anteriores. Medido.

drop function if exists public.finops_uso_de_infra();
-- A primeira tentativa viveu em `private` e ficou inalcançável pelo PostgREST.
-- Derrubada aqui também, para não deixar função órfã se o rollback rodar num
-- banco onde ela chegou a existir.
drop function if exists private.finops_uso_de_infra();
