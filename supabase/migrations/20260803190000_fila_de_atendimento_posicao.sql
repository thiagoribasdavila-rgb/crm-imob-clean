-- FILA DE ATENDIMENTO — a ordem do rodízio.
--
-- `distribution_roster` já dizia QUEM participa da fila de cada empreendimento e
-- de cada campanha. Não dizia EM QUE ORDEM, porque a escolha era por menor carga
-- e ordem não fazia falta.
--
-- Com o rodízio (lib/distribution/fila-de-atendimento.ts) a ordem passa a ser a
-- regra: a próxima lead vai para quem vem depois de quem recebeu por último. A
-- liderança precisa poder dizer quem é 1º, 2º, 3º.
--
-- ── O QUE NÃO ENTRA AQUI, E POR QUÊ ─────────────────────────────────────────
--
-- NÃO existe coluna de "último a receber" nem de ponteiro. Seria uma segunda
-- verdade: bastaria uma lead atribuída à mão, por transferência ou por cobertura
-- de ausência, para o ponteiro apontar para um lugar que a operação não viveu.
-- O ponteiro é derivado de `lead_distribution_history` cruzado com o escopo da
-- lead, que é o registro do que aconteceu de fato.
--
-- ── SEGURANÇA DESTA MIGRATION ───────────────────────────────────────────────
--
-- ADITIVA, IDEMPOTENTE e NULÁVEL. Uma coluna nova numa tabela existente; nada é
-- alterado, renomeado nem apagado. `posicao` nula significa "nunca foi ordenado
-- à mão" e o rodízio manda essa pessoa para o fim da fila, na ordem em que
-- entrou — ou seja, uma base inteira sem `posicao` preenchida funciona.

alter table public.distribution_roster
  add column if not exists posicao smallint;

comment on column public.distribution_roster.posicao is
  'Ordem no rodízio da fila de atendimento (1 = primeiro da vez). NULL = nunca ordenado à mão; vai para o fim, na ordem de entrada. O ponteiro de quem recebeu por último NÃO mora aqui — é derivado de lead_distribution_history.';

-- A leitura quente é "a fila deste escopo, na ordem". O índice parcial de busca
-- que já existe filtra por escopo; este acrescenta a ordenação para não pagar
-- sort a cada lead que entra.
create index if not exists distribution_roster_ordem
  on public.distribution_roster (organization_id, escopo, escopo_id, posicao)
  where ativo;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
--   drop index if exists public.distribution_roster_ordem;
--   alter table public.distribution_roster drop column if exists posicao;
--
-- Sem a coluna, `montarFila()` recebe `posicao: null` para todo mundo e ordena
-- pela data de entrada na fila — continua um rodízio válido, só sem ordem
-- escolhida à mão. Nenhuma lead deixa de ser distribuída por causa disso.
