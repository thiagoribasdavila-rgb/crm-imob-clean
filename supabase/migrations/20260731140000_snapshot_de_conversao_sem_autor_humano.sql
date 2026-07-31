-- ============================================================================
-- O SNAPSHOT DE CONVERSÃO NÃO TEM AUTOR HUMANO
-- ============================================================================
--
-- `conversion_feature_snapshots.created_by` é `not null` com chave estrangeira
-- para `profiles`. A tabela foi desenhada para o caso em que uma PESSOA pede
-- uma previsão na tela.
--
-- O que faltava — e é a razão de a tabela ter **0 linhas desde que existe** — é
-- o caso oposto: um worker que fotografa TODAS as leads abertas, todo dia, sem
-- ninguém pedir. É essa foto diária que, daqui a 90 dias, permite comparar o
-- que foi previsto com o que aconteceu. Sem ela, nem daqui a um ano existirá
-- base para modelo nenhum.
--
-- E um worker não tem autor. As saídas eram três:
--
--   1. gravar o id de um diretor  → atribui a uma pessoa uma decisão que ela
--                                   não tomou. É falsificar procedência.
--   2. criar um perfil "sistema"  → cria um usuário fantasma que aparece em
--                                   toda tela de gente, e que alguém um dia
--                                   tentará logar.
--   3. permitir NULL              → "sem autor humano" fica DECLARADO no dado.
--
-- A 3 é a única que não mente. `created_by is null` passa a significar, sem
-- ambiguidade, "produzido por worker".
--
-- Isto não afrouxa nada: linhas criadas por pessoa continuam obrigadas a ter
-- autor pelo caminho que as cria (a rota exige contexto de acesso). O que muda
-- é que o banco deixa de exigir uma mentira do worker.
--
-- Verificado antes de aplicar: `select count(*) from conversion_feature_snapshots`
-- = 0. Nenhuma linha existente é afetada.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--
--   delete from public.conversion_feature_snapshots where created_by is null;
--   alter table public.conversion_feature_snapshots alter column created_by set not null;
--
-- O `delete` é obrigatório no rollback: sem ele o `set not null` falha. Ele
-- apaga SOMENTE o que o worker criou.
-- ============================================================================

alter table public.conversion_feature_snapshots
  alter column created_by drop not null;

comment on column public.conversion_feature_snapshots.created_by is
  'Autor humano do snapshot. NULO significa "produzido por worker automatico, sem pessoa por tras" — nao significa autor desconhecido.';
