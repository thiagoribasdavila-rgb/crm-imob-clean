-- AUXILIARES DE PROVA + RECORTE DE TÓPICO NA REIVINDICAÇÃO.
--
-- ── O ESTRAGO QUE A SEGUNDA PARTE CONSERTA ──────────────────────────────────
--
-- `prova_de_fronteira_do_relogio` chamava `reivindica_eventos_da_fila` com limite
-- 200 e filtrava o RETORNO por tópico de prova. O filtro era na leitura: a
-- reivindicação já tinha travado TODAS as linhas elegíveis.
--
-- Medido em 2026-07-31 02:12:45 — os dois eventos reais `meta.lead.fetch` foram
-- reivindicados pela prova: status virou `processing`, `attempts` foi de 1 para 2,
-- `locked_by` virou 'prova-fronteira'. Restaurados ao estado exato (failed,
-- attempts=1, sem lock, available_at intacto, last_error preservado).
-- `updated_at` NÃO foi restaurado: apagar o rastro do próprio erro é pior que o erro.
--
-- O conserto é um parâmetro OPCIONAL de recorte. A alternativa — a prova
-- reescrever o predicado de reivindicação — provaria uma CÓPIA, não a função que
-- roda em produção. Duas verdades sobre o mesmo fato é a doença que este
-- repositório mais paga.
--
-- DROP + CREATE, e não CREATE OR REPLACE: acrescentar parâmetro muda a assinatura
-- e criaria SOBRECARGA, com o PostgREST errando por ambiguidade (armadilha já
-- documentada em 20260730160000).
--
-- ── POR QUE OS AUXILIARES DE PROVA VIVEM NO BANCO ───────────────────────────
--
-- Para provar "exatamente no limite", "1 ms antes" e "1 ms depois" é preciso
-- posicionar `available_at` relativo ao `now()` DO BANCO. Um teste que usasse
-- `Date.now()` do processo teria o mesmo defeito que quer provar corrigido — não
-- saberia onde é o limite. E o PostgREST não expressa `now() + interval` num
-- update.
--
-- Eles são SEGUROS por construção: recusam qualquer linha cujo tópico não comece
-- com prefixo de prova. Incapazes de tocar em evento real — não por disciplina de
-- quem chama, por impossibilidade.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
--   DROP FUNCTION IF EXISTS public.prova_de_fronteira_do_relogio(uuid);
--   DROP FUNCTION IF EXISTS public.envelhece_lock_de_prova(uuid, integer);
--   DROP FUNCTION IF EXISTS public.posiciona_evento_de_prova(uuid, integer);
--   DROP FUNCTION IF EXISTS public.reivindica_eventos_da_fila(text, integer, text);
--   -- e recriar a versão de 2 parâmetros, que está em 20260731040000.

-- ── 1. Posicionar um evento de prova no tempo, pelo relógio do banco ────────
CREATE OR REPLACE FUNCTION public.posiciona_evento_de_prova(p_id uuid, p_offset_ms integer)
RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_topico text;
  v_novo timestamptz;
BEGIN
  SELECT topic INTO v_topico FROM public.integration_outbox WHERE id = p_id;
  IF v_topico IS NULL THEN
    RAISE EXCEPTION 'evento % nao existe', p_id;
  END IF;
  IF v_topico NOT LIKE 'relogio-%' AND v_topico NOT LIKE 'prova.sintetica.%' THEN
    RAISE EXCEPTION 'recusado: % nao e um topico de prova. Esta funcao nao toca em evento real.', v_topico;
  END IF;
  UPDATE public.integration_outbox
  SET available_at = now() + make_interval(secs => p_offset_ms / 1000.0)
  WHERE id = p_id
  RETURNING available_at INTO v_novo;
  RETURN v_novo;
END $$;

-- ── 2. Envelhecer o lock de um evento de prova ──────────────────────────────
CREATE OR REPLACE FUNCTION public.envelhece_lock_de_prova(p_id uuid, p_minutos integer)
RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_topico text;
  v_novo timestamptz;
BEGIN
  SELECT topic INTO v_topico FROM public.integration_outbox WHERE id = p_id;
  IF v_topico IS NULL THEN
    RAISE EXCEPTION 'evento % nao existe', p_id;
  END IF;
  IF v_topico NOT LIKE 'relogio-%' AND v_topico NOT LIKE 'prova.sintetica.%' THEN
    RAISE EXCEPTION 'recusado: % nao e um topico de prova.', v_topico;
  END IF;
  UPDATE public.integration_outbox
  SET locked_at = now() - make_interval(mins => GREATEST(0, p_minutos))
  WHERE id = p_id
  RETURNING locked_at INTO v_novo;
  RETURN v_novo;
END $$;

REVOKE ALL ON FUNCTION public.posiciona_evento_de_prova(uuid, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.envelhece_lock_de_prova(uuid, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.posiciona_evento_de_prova(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.envelhece_lock_de_prova(uuid, integer) TO service_role;

-- ── 3. A reivindicação ganha recorte OPCIONAL por tópico ────────────────────
DROP FUNCTION IF EXISTS public.reivindica_eventos_da_fila(text, integer);

CREATE FUNCTION public.reivindica_eventos_da_fila(
  p_worker text,
  p_limite integer DEFAULT 20,
  p_topico_prefixo text DEFAULT NULL
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
      AND available_at <= now()
      -- NULL = produção, sem recorte. Preenchido = só aquele prefixo, e a
      -- reivindicação fica incapaz de tocar em evento real.
      AND (p_topico_prefixo IS NULL OR topic LIKE p_topico_prefixo || '%')
    ORDER BY created_at
    LIMIT GREATEST(1, LEAST(p_limite, 200))
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

REVOKE ALL ON FUNCTION public.reivindica_eventos_da_fila(text, integer, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reivindica_eventos_da_fila(text, integer, text) TO service_role;

-- ── 4. A prova de fronteira, dentro de UMA transação ────────────────────────
--
-- No PostgreSQL `now()` é o horário de início da transação e permanece constante
-- durante toda ela. Criando os eventos e reivindicando na MESMA transação, o
-- evento em `now() + 1ms` está genuinamente no futuro em relação ao mesmo `now()`
-- que a reivindicação enxerga. É a única forma de a fronteira de 1 ms significar
-- algo: com duas viagens de rede, a latência engole a diferença.
CREATE OR REPLACE FUNCTION public.prova_de_fronteira_do_relogio(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_marca text := 'relogio-fronteira-' || extract(epoch from clock_timestamp())::bigint;
  v_antes uuid; v_limite uuid; v_depois uuid;
  v_pegos uuid[];
  v_resultado jsonb;
BEGIN
  INSERT INTO public.integration_outbox (organization_id, topic, aggregate_type, payload, available_at)
  VALUES (p_org, v_marca || '.antes', 'prova', '{"prova":true}'::jsonb, now() - interval '1 millisecond')
  RETURNING id INTO v_antes;

  INSERT INTO public.integration_outbox (organization_id, topic, aggregate_type, payload, available_at)
  VALUES (p_org, v_marca || '.limite', 'prova', '{"prova":true}'::jsonb, now())
  RETURNING id INTO v_limite;

  INSERT INTO public.integration_outbox (organization_id, topic, aggregate_type, payload, available_at)
  VALUES (p_org, v_marca || '.depois', 'prova', '{"prova":true}'::jsonb, now() + interval '1 millisecond')
  RETURNING id INTO v_depois;

  SELECT array_agg(id) INTO v_pegos
  FROM public.reivindica_eventos_da_fila('prova-fronteira', 200, v_marca);

  v_resultado := jsonb_build_object(
    'umMsAntes_reivindicado',  v_antes  = ANY(coalesce(v_pegos, ARRAY[]::uuid[])),
    'noLimite_reivindicado',   v_limite = ANY(coalesce(v_pegos, ARRAY[]::uuid[])),
    'umMsDepois_reivindicado', v_depois = ANY(coalesce(v_pegos, ARRAY[]::uuid[])),
    'totalReivindicados',      coalesce(array_length(v_pegos, 1), 0),
    'agoraDoBanco',            now()
  );

  DELETE FROM public.integration_outbox WHERE topic LIKE v_marca || '%';
  RETURN v_resultado;
END $$;

REVOKE ALL ON FUNCTION public.prova_de_fronteira_do_relogio(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prova_de_fronteira_do_relogio(uuid) TO service_role;
