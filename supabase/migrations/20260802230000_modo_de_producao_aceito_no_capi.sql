-- ============================================================================
-- O MODO DE PRODUÇÃO PASSA A CABER NA COLUNA
--
-- ATENÇÃO: esta migration foi ESCRITA e NÃO FOI APLICADA no banco de produção
-- (pozbrcsfthnhmnebfoxv). Enquanto não for aplicada, o código já aceita
-- `mode = 'live'` mas o BANCO pode recusar a gravação — ver "como conferir"
-- no fim deste arquivo.
--
-- ── O QUE ESTAVA TRANCADO ───────────────────────────────────────────────────
--
-- `20260716223608_ai_cost_and_meta_conversions.sql` criou a coluna assim:
--
--     mode text not null default 'test' check (mode = 'test')
--
-- O comentário de intenção era "ninguém liga envio de conversão em produção por
-- engano", e isso é correto como POLÍTICA. O problema é onde a política foi
-- escrita: numa restrição que não distingue "por engano" de "de propósito".
--
-- Do outro lado da mesma trava existe `conversion_go_live` em
-- `app/api/v1/integrations/meta/route.ts` — rota de DIRETORIA, que confere se o
-- dataset já foi configurado em teste antes de promover, e que grava
-- `mode = 'live'`. Ou seja: o produto tem o gesto deliberado que a política
-- pedia, e a coluna recusa esse gesto. O caminho de promoção termina em erro de
-- constraint, não em produção.
--
-- Quem passa a impedir o acidente:
--   1. `conversion_config` grava SEMPRE `mode = 'test'` — configurar nunca liga
--      produção;
--   2. `conversion_go_live` exige diretoria e exige dataset já configurado;
--   3. o default da coluna continua 'test' — linha nova nasce em ensaio;
--   4. a restrição continua existindo, agora fechando o que de fato não pode:
--      um valor que ninguém sabe interpretar.
--
-- ── POR QUE A RESTRIÇÃO NÃO SIMPLESMENTE SAI ────────────────────────────────
--
-- `mode` é lido por `normalizarModoDeEnvio` (lib/meta/modo-de-envio.ts), que
-- trata QUALQUER coisa diferente de 'live' como teste. Sem a restrição, um
-- 'production' ou 'LIVE' digitado à mão viraria teste silenciosamente e o dono
-- juraria estar em produção. Com ela, a gravação errada falha na hora, na cara
-- de quem digitou.
-- ============================================================================

alter table if exists public.meta_conversion_configs
  drop constraint if exists meta_conversion_configs_mode_check;

alter table if exists public.meta_conversion_configs
  add constraint meta_conversion_configs_mode_check check (mode in ('test', 'live'));

comment on column public.meta_conversion_configs.mode is
  'test = o evento sai com test_event_code e a Meta NÃO o usa para otimizar entrega; live = o evento entra na otimização real. Só a rota conversion_go_live (diretoria) promove.';

-- ── COMO CONFERIR SE O BANCO VIVO JÁ ACEITA 'live' ──────────────────────────
--
--   select pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.meta_conversion_configs'::regclass
--      and contype = 'c';
--
-- Se a saída contiver `(mode = 'test'::text)`, a trava ainda está lá e as duas
-- instruções `alter table` acima precisam ser executadas antes de promover
-- qualquer dataset.
