# Fase 26 — atualização transparente do Livro Executivo

## Objetivo

Evitar que a liderança interprete uma lista preservada em tela como uma leitura
recém-atualizada enquanto uma sincronização está em andamento.

## Entrega

- O Livro Executivo sinaliza discretamente `Atualizando…` quando já existem
  registros visíveis e uma nova leitura está sendo feita.
- A lista permanece utilizável durante a renovação, sem substituir registros por
  estado vazio.
- O primeiro carregamento continua usando o estado dedicado de carregamento.

## Limites preservados

- Sem alteração em dados, banco, API, permissões ou automações.
- O indicador descreve apenas o estado já existente da leitura.

## Validação

- `npm run typecheck`
- `npm run lint`
- `node --test tests/contracts/assisted-interaction-governance.test.mjs`
