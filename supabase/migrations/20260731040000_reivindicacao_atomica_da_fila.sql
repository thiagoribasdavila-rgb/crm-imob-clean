-- A REIVINDICAÇÃO DE EVENTO PASSA A SER ATÔMICA, COM O RELÓGIO DO BANCO.
--
-- ── O DEFEITO ───────────────────────────────────────────────────────────────
--
-- `app/api/v2/outbox/process/route.ts` selecionava e reivindicava assim:
--
--   .lte("available_at", new Date().toISOString())     ← relógio do PROCESSO
--   ...
--   .update({ locked_at: new Date().toISOString() })   ← grava relógio do PROCESSO
--
-- `available_at` e `locked_at` são gerados pelo PostgreSQL (`now()` é o default da
-- coluna). Compará-los com o relógio do Node é comparar dois relógios diferentes:
-- num contêiner com drift de poucos milissegundos, um evento perfeitamente
-- elegível é ignorado; com drift para o outro lado, um evento agendado para o
-- futuro é processado antes da hora.
--
-- Medido em 2026-07-31: um evento recém-inserido apareceu com `available_at` 6 ms
-- À FRENTE do relógio deste processo — inelegível por 6 milissegundos, num campo
-- cujo valor o próprio banco acabara de escrever.
--
-- Havia ainda um segundo problema, de forma: SELECT e depois UPDATE são duas
-- viagens. A exclusão mútua vinha de um compare-and-swap por linha
-- (`.in("status", [...])`), que funciona — mas a SELEÇÃO já tinha usado o relógio
-- errado, e entre as duas viagens a fila pode mudar.
--
-- ── O CONSERTO ──────────────────────────────────────────────────────────────
--
-- Uma função que SELECIONA, VALIDA e ADQUIRE numa única instrução, dentro do
-- banco:
--
--   · `now()` é o relógio do PostgreSQL — a mesma fonte que escreveu as colunas;
--   · `FOR UPDATE SKIP LOCKED` dá exclusão mútua sem espera: dois workers
--     simultâneos pegam conjuntos DISJUNTOS, nenhum bloqueia o outro;
--   · `attempts` incrementa na reivindicação, não na conclusão — assim uma
--     tentativa que morre no meio ainda conta, e o evento não gira para sempre.
--
-- NÃO é SECURITY DEFINER, de propósito. Em 20260730180000 foi fechada uma
-- escalação de privilégio causada por função SECURITY DEFINER que recebia
-- identidade por parâmetro. Aqui não há necessidade: quem chama é o
-- `service_role`, que já atravessa a RLS. Menos superfície é melhor que mais
-- verificação.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
--   DROP FUNCTION IF EXISTS public.reivindica_eventos_da_fila(text, integer);
--   DROP FUNCTION IF EXISTS public.leases_expirados(integer, integer);
--
-- Reverter faz o worker voltar ao SELECT+UPDATE com relógio do processo. O código
-- da rota precisa voltar junto — as duas coisas mudam no mesmo commit.

-- ── 1. Reivindicação atômica ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reivindica_eventos_da_fila(
  p_worker text,
  p_limite integer DEFAULT 20
)
RETURNS SETOF public.integration_outbox
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$
  WITH candidatos AS (
    SELECT id
    FROM public.integration_outbox
    WHERE status IN ('pending', 'failed')
      -- `now()` do BANCO, contra colunas escritas pelo BANCO. Sem tolerância:
      -- não é preciso tolerar diferença entre relógios quando só há um relógio.
      AND available_at <= now()
    ORDER BY created_at
    LIMIT GREATEST(1, LEAST(p_limite, 200))
    -- Exclusão mútua sem espera: o segundo worker PULA a linha travada em vez de
    -- ficar bloqueado nela. É o que faz dois workers simultâneos processarem
    -- conjuntos disjuntos em vez de um esperar o outro.
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.integration_outbox AS alvo
  SET status = 'processing',
      attempts = alvo.attempts + 1,
      locked_at = now(),
      locked_by = p_worker,
      updated_at = now()
  FROM candidatos
  WHERE alvo.id = candidatos.id
  RETURNING alvo.*;
$$;

REVOKE ALL ON FUNCTION public.reivindica_eventos_da_fila(text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reivindica_eventos_da_fila(text, integer) TO service_role;

COMMENT ON FUNCTION public.reivindica_eventos_da_fila(text, integer) IS
  'Seleciona, valida e adquire eventos numa instrucao so, com now() do banco e FOR UPDATE SKIP LOCKED. Substitui o SELECT+UPDATE que comparava o relogio do processo Node com timestamps do PostgreSQL.';

-- ── 2. Leases expirados, também pelo relógio do banco ───────────────────────
--
-- A política do que FAZER com um lease expirado (repetível por tópico, escalar,
-- encerrar) continua em `lib/integrations/outbox-lease.ts` — ela é regra de
-- negócio e muda com o produto. O que vem para cá é só a PERGUNTA "quais
-- expiraram?", porque é ela que depende do relógio.
CREATE OR REPLACE FUNCTION public.leases_expirados(
  p_minutos integer DEFAULT 10,
  p_limite integer DEFAULT 50
)
RETURNS SETOF public.integration_outbox
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT *
  FROM public.integration_outbox
  WHERE status = 'processing'
    AND locked_at IS NOT NULL
    AND locked_at < now() - make_interval(mins => GREATEST(1, p_minutos))
  ORDER BY locked_at
  LIMIT GREATEST(1, LEAST(p_limite, 500));
$$;

REVOKE ALL ON FUNCTION public.leases_expirados(integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leases_expirados(integer, integer) TO service_role;

COMMENT ON FUNCTION public.leases_expirados(integer, integer) IS
  'Quais eventos estao presos com lease vencido, medido pelo relogio do banco. A politica do que fazer com eles fica em lib/integrations/outbox-lease.ts.';
