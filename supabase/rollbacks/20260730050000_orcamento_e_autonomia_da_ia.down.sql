-- ROLLBACK de 20260730050000_orcamento_e_autonomia_da_ia
--
-- Vive em supabase/rollbacks/ e NUNCA em supabase/migrations/: um .down.sql lá
-- dentro cria versão duplicada e o `supabase db push` aborta no ÚLTIMO arquivo,
-- depois de já ter aplicado os anteriores — pior que não aplicar nada, porque
-- deixa o banco no meio do caminho. Isso foi medido neste projeto.
--
-- ── A ordem é deliberada ────────────────────────────────────────────────────
--
-- A coluna `agent` sai por ÚLTIMO, e sob condição. Derrubá-la primeiro apagaria
-- a dimensão do agente das linhas de consumo já gravadas, e o histórico não
-- volta: `feature` permite recalcular, mas só enquanto as linhas existirem.
--
-- ── O que este rollback NÃO desfaz, de propósito ────────────────────────────
--
-- `ai_usage_events` inteira. Ela é anterior a esta entrega (43 linhas medidas em
-- 2026-07-30) e apagá-la seria destruir a única medição de consumo que existe.
-- Desligar o teto NÃO é motivo para perder o velocímetro.

begin;

drop policy if exists ai_shadow_decisions_org_fence on public.ai_shadow_decisions;
drop table if exists public.ai_shadow_decisions;

drop function if exists public.consumo_de_ia_do_dia(uuid, uuid, text);
-- A versão em `private` existiu por algumas horas em 2026-07-30 antes de a prova
-- revelar que PostgREST não a alcançava. Some junto, se ainda estiver por aí.
drop function if exists private.consumo_de_ia_do_dia(uuid, uuid, text);

drop index if exists public.ai_usage_events_org_dia_agente_idx;
drop index if exists public.ai_usage_events_org_dia_usuario_idx;

-- A coluna do agente sai só se o rollback for explicitamente TOTAL. O padrão é
-- preservá-la: ela é dado medido, e cai fora do caminho do produto sozinha
-- quando o código para de escrevê-la. Para removê-la de fato, rode à mão:
--
--   alter table public.ai_usage_events drop column if exists agent;

commit;
