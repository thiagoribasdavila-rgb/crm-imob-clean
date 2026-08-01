-- ============================================================================
-- PROBABILIDADE DE EVENTO RARO NÃO PODE SER ARREDONDADA ATÉ VIRAR CERTEZA
-- ============================================================================
--
-- `conversion_feature_snapshots.predicted_probability` era `numeric(5,2)` com
-- CHECK (0..100) — ou seja, um PERCENTUAL com duas casas. A escala 2 é
-- suficiente para "37,25%" e é destrutiva para o que este produto precisa medir.
--
-- MEDIDO em 2026-07-31, na primeira gravação real: das 370 leads fotografadas,
-- **363 ficaram com 0.00**. Não porque o cálculo deu zero — o menor valor
-- calculado foi 0,0294% — mas porque a coluna arredondou.
--
-- Zero, aqui, não é um número pequeno: é a afirmação "esta lead NUNCA vai
-- converter". O código se recusa explicitamente a afirmar isso (a probabilidade
-- é presa no intervalo aberto, nunca 0 nem 1) — e o banco afirmava por ele, em
-- silêncio, em 98% das linhas.
--
-- A operação tem taxa base medida de 0,21%. Um evento raro vive todo dentro da
-- primeira casa decimal do percentual. Escala 2 apaga a diferença entre a
-- melhor e a pior lead da base.
--
-- ── O que muda, e o que NÃO muda ───────────────────────────────────────────
--
-- Muda: `numeric(5,2)` → `numeric(9,6)`. Seis casas seguram 0,000001% sem
-- perder resolução, e 9 dígitos totais continuam cobrindo 100,000000.
--
-- NÃO muda: a unidade. A coluna é PERCENTUAL (0..100), como o CHECK sempre
-- disse e como `app/api/v1/analytics/conversion-dataset/route.ts` já lia
-- (`predictedProbability / 100`). O nome da coluna diz "probability" e o
-- conteúdo é percentual — é uma divergência de nome que este arquivo NÃO
-- resolve por renomeação, porque renomear quebraria o leitor existente. Fica
-- documentada no comentário da coluna, que é onde quem for usar vai olhar.
--
-- O CHECK (0..100) é preservado: ele é o que ancora a unidade.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--
--   alter table public.conversion_feature_snapshots
--     alter column predicted_probability type numeric(5,2);
--
-- Reverter volta a arredondar: os valores existentes perdem as casas extras.
-- ============================================================================

alter table public.conversion_feature_snapshots
  alter column predicted_probability type numeric(9,6);

comment on column public.conversion_feature_snapshots.predicted_probability is
  'PERCENTUAL de 0 a 100 (nao e fracao de 0 a 1), como o CHECK da coluna sempre exigiu. Escala 6 porque a taxa base medida da operacao e 0,21%: com escala 2, 98% das linhas eram gravadas como 0.00 — que nao e "probabilidade baixa", e "certeza de que nao converte".';
