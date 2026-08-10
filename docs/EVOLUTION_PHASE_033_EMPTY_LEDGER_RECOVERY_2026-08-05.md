# Fase 33 — Estado vazio com recuperação

## Objetivo

Evitar que um filtro sem resultados interrompa a investigação do gestor no Livro Executivo.

## Entrega

- O estado vazio informa qual recorte foi consultado.
- A tela oferece a ação direta “Ver todas as decisões”.
- A ação somente troca o filtro de visualização; não altera registros, responsáveis, prazos nem resultados.

## Validação

- `npm run typecheck` aprovado.
- `npm run lint` aprovado sem avisos.
- `node --test tests/contracts/assisted-interaction-governance.test.mjs` aprovado: 12 de 12.

## Impacto operacional

O usuário não precisa deduzir o próximo passo quando uma prioridade não possui registros: ele retoma o histórico completo de forma segura e imediata.
