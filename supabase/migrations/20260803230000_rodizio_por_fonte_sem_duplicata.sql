-- Uma pessoa entra UMA vez por formulário.
--
-- `source_round_robin` nasceu só com a PK em `id`. Sem esta unicidade, dois
-- cliques no botão criam duas linhas e o corretor aparece em dobro no rodízio —
-- e como a vez sai de "quem tem menos leads desta fonte", aparecer duas vezes
-- não duplica a chance, mas suja a contagem e a ordem de desempate.
--
-- É o mesmo cuidado que `distribution_roster_unico` já aplica ao elenco por
-- escopo, e a razão de ele existir lá está escrita na migration daquele: "dois
-- cliques no botão criariam duas linhas e o corretor apareceria em dobro na
-- contagem do elenco".
--
-- A tabela está VAZIA (medido em 03/08/2026), então a criação não pode falhar
-- por dado pré-existente.
--
-- ── SEGURANÇA ───────────────────────────────────────────────────────────────
--
-- ADITIVA e IDEMPOTENTE. Nada é alterado nem apagado.
--
-- ROLLBACK:
--   drop index if exists public.source_round_robin_unico;
--
-- Sem o índice, o produto continua funcionando — a rota faz upsert e passaria a
-- depender só do `onConflict`, que sem a unicidade correspondente vira insert.

create unique index if not exists source_round_robin_unico
  on public.source_round_robin (source_id, profile_id);

comment on index public.source_round_robin_unico is
  'Uma pessoa por formulário no rodízio. Sem isto, dois cliques criam duas linhas e o corretor aparece em dobro.';
