# Fase 25 — transparência da leitura rápida

## Objetivo

Manter o Livro Executivo focado nas decisões prioritárias sem criar a impressão
de que registros adicionais foram ocultados ou descartados.

## Entrega

- A lista continua exibindo no máximo doze decisões para preservar a leitura
  operacional.
- Quando o filtro contém mais registros, a interface informa quantos itens estão
  na prévia e quantos permanecem no mesmo filtro.
- A priorização, os filtros e o histórico não foram alterados.

## Limites preservados

- Sem paginação nova, banco, API, automação ou alteração de decisão.
- O limite é exclusivamente visual e os registros continuam preservados.

## Validação

- `npm run typecheck`
- `npm run lint`
- `node --test tests/contracts/assisted-interaction-governance.test.mjs`
