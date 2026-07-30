-- O MOTIVO DO DESCARTE PASSA A SER GRAVADO.
--
-- ── O DEFEITO, MEDIDO EM 2026-07-30 ─────────────────────────────────────────
--
-- O produto EXIGE o motivo do descarte do corretor: mover uma lead para
-- `perdido` sem `discardReason` devolve 400 `DISCARD_REASON_REQUIRED`
-- (app/api/v1/pipeline/route.ts:321), e uma chave fora da taxonomia devolve 400
-- `INVALID_DISCARD_REASON`. A guarda entrou em 20/07/2026 (commit 6ef8fe23).
--
-- E o motivo era jogado fora antes de qualquer escrita. A linha 398 passava à
-- RPC apenas `p_reason: followUpDescription`; a chave da taxonomia e as notas
-- morriam ali. O único caminho que gravava `lead_discarded` vive DEPOIS de um
-- `return` que sempre acontece (o caminho atômico retorna na linha 438; o
-- compensatório a partir da 472 só roda se a RPC não existir — e ela existe).
--
-- Resultado medido na organização real:
--
--   104 saídas do funil registradas entre 27/07 e 30/07
--   102 movimentos para `perdido`, TODOS com `reason` nulo
--     0 eventos `lead_discarded` em `lead_events` (que tem 66 linhas, em 6 tipos)
--     0 linhas em `pipeline_history` no banco INTEIRO (2 inserts na vida, 2 apagados)
--
-- As 104 saídas são POSTERIORES à guarda. Ou seja: o corretor escolheu o motivo
-- 102 vezes e o sistema descartou 102 vezes. A tela /pipeline/discards mostra
-- tudo zerado sobre uma operação que perdeu 110 de 482 leads, e quem lê conclui
-- que o time não usa a ferramenta — quando o time usou e a ferramenta perdeu.
--
-- ── POR QUE DUAS COLUNAS, E NÃO REUSO DE `reason` ───────────────────────────
--
-- `reason` já carrega texto livre de follow-up (as 2 únicas saídas preenchidas
-- são `comprou_outro` com "Cliente comprou na Melo Alves" e afins). Enfiar a
-- chave da taxonomia no mesmo campo obrigaria a decodificar texto livre depois,
-- e a primeira nota que contivesse a palavra de uma chave viraria classificação
-- falsa. Chave é dado tipado; nota é texto. Colunas separadas.
--
-- ── O QUE ESTA MIGRATION DELIBERADAMENTE NÃO FAZ ────────────────────────────
--
-- 1. NÃO altera `move_pipeline_lead`. Acrescentar parâmetro exigiria DROP+CREATE
--    (CREATE OR REPLACE com assinatura diferente cria SOBRECARGA, e o PostgREST
--    passa a errar por ambiguidade). O motivo é gravado por um `update` próprio
--    logo após a RPC — exatamente o padrão que `sale_value_brl` já usa na mesma
--    rota (linhas 429-434), com a justificativa registrada lá desde antes.
--    Se esse update falhar, o resultado é uma saída sem motivo: o estado de
--    HOJE, que a tela já rotula "não medido". Falhar para esse lado é seguro.
--
-- 2. NÃO cria CHECK contra a lista de chaves. A taxonomia vive em
--    lib/atlas/discard-reasons.ts (11 chaves) e é validada na rota. Repeti-la no
--    banco criaria duas versões que divergem no dia em que alguém editar uma —
--    a doença mais cara deste repositório.
--
-- 3. NÃO faz backfill, porque é IMPOSSÍVEL. Medido: `leads.metadata` com
--    'discardReason' = 0; metadata com 'reasonKey' = 0; `atlas_events.payload`
--    não carrega motivo; `activities.description` é "Etapa alterada: X → Y".
--    Os 102 motivos não existem em lugar nenhum do banco. Eles ficam NULL e a
--    tela os rotula "não medido" — jamais "Outro motivo", que é escolha
--    explícita do corretor e um balde diferente.
--
-- 4. NÃO apaga nem altera uma linha sequer. É estritamente aditiva.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
--   ALTER TABLE public.pipeline_stage_moves
--     DROP COLUMN IF EXISTS discard_reason_key,
--     DROP COLUMN IF EXISTS discard_notes;
--   DROP INDEX IF EXISTS idx_psm_discard_reason;
--
-- Reverter é seguro: nenhum dado pré-existente depende destas colunas, e o
-- código volta a gravar nada — que é o comportamento de hoje.

ALTER TABLE public.pipeline_stage_moves
  ADD COLUMN IF NOT EXISTS discard_reason_key text,
  ADD COLUMN IF NOT EXISTS discard_notes text;

COMMENT ON COLUMN public.pipeline_stage_moves.discard_reason_key IS
  'Chave da taxonomia de descarte (lib/atlas/discard-reasons.ts). NULL = não medido, e NÃO é o mesmo que a chave motivo_nao_classificado, que é a escolha explícita "Outro motivo" feita pelo corretor.';

COMMENT ON COLUMN public.pipeline_stage_moves.discard_notes IS
  'Observação livre que o corretor escreveu junto do motivo. Separada de `reason`, que carrega a descrição de follow-up.';

-- Índice parcial: só as linhas classificadas interessam à agregação por motivo,
-- e hoje elas são 0 de 104. Índice parcial não paga por NULL.
CREATE INDEX IF NOT EXISTS idx_psm_discard_reason
  ON public.pipeline_stage_moves (organization_id, discard_reason_key)
  WHERE discard_reason_key IS NOT NULL;
