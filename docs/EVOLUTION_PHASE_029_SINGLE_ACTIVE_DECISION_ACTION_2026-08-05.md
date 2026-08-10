# Fase 29 — uma ação humana por vez

## Objetivo

Reduzir ruído e prevenir o preenchimento de uma decisão no contexto errado.

## Entrega

- Ao abrir o registro de uma decisão, qualquer formulário de resultado é
  recolhido.
- Ao abrir o resultado de uma decisão, qualquer formulário de nova decisão é
  recolhido.
- A informação do Livro Executivo continua preservada; apenas o foco visual é
  alternado.

## Limites preservados

- Sem mudança em banco, API, regras de validação, permissões ou automações.
- Nenhum registro é descartado: o ajuste afeta somente formulários ainda não
  confirmados.

## Validação

- `npm run typecheck`
- `npm run lint`
- `node --test tests/contracts/assisted-interaction-governance.test.mjs`
