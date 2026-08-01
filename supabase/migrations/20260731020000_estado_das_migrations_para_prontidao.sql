-- A PRONTIDÃO PASSA A SABER SE FALTA MIGRATION.
--
-- ── POR QUE ISTO PRECISA DE FUNÇÃO ──────────────────────────────────────────
--
-- `supabase_migrations.schema_migrations` guarda o que foi aplicado (217 linhas
-- medidas em 2026-07-31), mas o PostgREST expõe apenas `public` e
-- `graphql_public`. Sem uma função em `public`, a rota de prontidão não tem como
-- responder "faltam migrations?" — e a pergunta importa porque o repositório tem
-- 173 arquivos contra 217 aplicadas: o banco tem coisa que o repo não reproduz.
--
-- ── O QUE ELA DELIBERADAMENTE NÃO FAZ ───────────────────────────────────────
--
-- 1. NÃO recebe parâmetro. Em 2026-07-30 foi fechada uma escalação de privilégio
--    cuja causa era exatamente uma função SECURITY DEFINER que recebia
--    `p_actor_id` e nunca conferia `auth.uid()` — quem chamava dizia quem era.
--    Função sem parâmetro não tem essa superfície.
--
-- 2. EXECUTE é concedido SOMENTE a `service_role`. Nem `authenticated`, nem
--    `anon`. A rota `/api/v1/ready` usa o cliente admin; ninguém mais precisa.
--    Isso também mantém `scripts/check-rpc-sem-escalacao.mjs` verde por mérito,
--    e não por exceção.
--
-- 3. NÃO devolve conteúdo de migration, nem SQL, nem nome de tabela: só a
--    CONTAGEM e a VERSÃO MAIS ALTA aplicada. Versão é um carimbo de data; não é
--    segredo, e é o suficiente para comparar com o topo do repositório.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
--   DROP FUNCTION IF EXISTS public.estado_das_migrations();
--
-- Reverter faz a prontidão voltar a dizer "não medido" para migrations — que é o
-- comportamento honesto na ausência da função, não um verde falso.

CREATE OR REPLACE FUNCTION public.estado_das_migrations()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = supabase_migrations, pg_temp
AS $$
  SELECT jsonb_build_object(
    'aplicadas', (SELECT count(*) FROM schema_migrations),
    'versaoMaisAlta', (SELECT max(version) FROM schema_migrations)
  );
$$;

REVOKE ALL ON FUNCTION public.estado_das_migrations() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.estado_das_migrations() TO service_role;

COMMENT ON FUNCTION public.estado_das_migrations() IS
  'Contagem e versao mais alta aplicada, para /api/v1/ready comparar com o topo do repositorio. Sem parametro e sem EXECUTE para authenticated/anon de proposito — ver 20260730180000.';
