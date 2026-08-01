-- A COMPARAÇÃO DE MIGRATIONS PASSA A SER POR NOME, NÃO POR VERSÃO.
--
-- ── O FALSO VERMELHO QUE ISTO EVITA ─────────────────────────────────────────
--
-- A primeira versão de `estado_das_migrations()` devolvia a versão mais alta
-- aplicada, e a rota comparava com o prefixo numérico do arquivo mais novo do
-- repositório. Medido em 2026-07-31, o resultado seria SEMPRE divergente:
--
--   arquivo no repo .... 20260731020000_estado_das_migrations_para_prontidao.sql
--   linha no banco ..... 20260731013305 | estado_das_migrations_para_prontidao
--
-- O banco grava `version` como o carimbo de QUANDO aplicou, não o prefixo do
-- arquivo. Os números nunca coincidem, então `emDia` seria `false` para sempre —
-- inclusive num ambiente perfeitamente em dia.
--
-- Isso não é detalhe: falso vermelho custa tanto quanto falso verde. Um portão
-- que grita todo dia ensina a ser ignorado, e no dia em que o alerta for real
-- ninguém olha. Esta base já pagou essa lição.
--
-- O `name` bate exatamente com o sufixo do arquivo. É por ele que se compara.
--
-- ── O QUE A COMPARAÇÃO CERTA REVELOU, NA PRIMEIRA EXECUÇÃO ──────────────────
--
--   repositório ......... 174 migrations
--   banco ............... 219 aplicadas
--   do repo, NÃO aplicadas .. 108
--
-- Ou seja: 108 dos 174 arquivos do repositório nunca foram aplicados com esse
-- nome, e o banco tem 219 registros que vieram de outros caminhos. Este é o
-- drift de schema deste projeto, medido pela primeira vez — e agora publicado
-- continuamente em /api/v1/ready em vez de descoberto num deploy.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- Reverter para a versão anterior (sem `nomes`) faz a rota voltar a dizer
-- "não dá para comparar" — honesto, mas cego. A função anterior está em
-- 20260731020000.

CREATE OR REPLACE FUNCTION public.estado_das_migrations()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = supabase_migrations, pg_temp
AS $$
  SELECT jsonb_build_object(
    'aplicadas', (SELECT count(*) FROM schema_migrations),
    'versaoMaisAlta', (SELECT max(version) FROM schema_migrations),
    'nomes', (SELECT coalesce(jsonb_agg(name ORDER BY name), '[]'::jsonb)
              FROM schema_migrations WHERE name IS NOT NULL)
  );
$$;

-- Sem parâmetro e sem EXECUTE para authenticated/anon, pelo mesmo motivo de
-- 20260730180000: função SECURITY DEFINER que recebe identidade por parâmetro
-- deixa o chamador dizer quem é. Esta não recebe nada e só o service_role chama.
REVOKE ALL ON FUNCTION public.estado_das_migrations() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.estado_das_migrations() TO service_role;
