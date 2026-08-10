# Fase 24 — orientação no registro de resultado

## Objetivo

Reduzir tentativas incompletas e tornar o fechamento de uma decisão comercial
mais rápido para a liderança.

## Entrega

- Campos de resultado e qualidade agora têm rótulos explícitos.
- A anotação orienta o operador com um exemplo factual, sem sugerir dados.
- A interface informa caracteres restantes até a validação e o limite máximo de
  texto.

## Limites preservados

- O requisito de oito caracteres continua aplicado no cliente e no fluxo já
  existente.
- Nenhuma mudança foi feita em banco, API, permissões ou registros.

## Validação

- `npm run typecheck`
- `npm run lint`
- `node --test tests/contracts/assisted-interaction-governance.test.mjs`
