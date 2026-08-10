# Fase 114 — Kanban Card Command

Esta fase melhorou o miolo dos cards do Kanban para deixar a operação mais rápida, limpa e orientada à próxima ação.

## Objetivo

Transformar cada card em uma pequena central de decisão:

- o que fazer agora;
- por que isso importa;
- qual projeto e potencial estão em jogo;
- como agir sem procurar outro botão.

## O que foi alterado

- Criado o `KanbanCardEssentials` para consolidar urgência, potencial, projeto e canal de contato.
- Adicionado o bloco `atlas-kanban-card-command` como primeira decisão visível do card.
- Adicionado o bloco `atlas-kanban-card-essentials` para mostrar só os dados comerciais essenciais.
- Substituída a ação primária antiga por `atlas-kanban-card-actions-compact`.
- O roteiro rápido da IA passou para `atlas-kanban-playbook-shell`, fechado por padrão.

## Impacto operacional

O corretor consegue bater o olho no card e entender:

1. se precisa agir agora;
2. qual abordagem usar;
3. qual valor/projeto está associado;
4. onde clicar para executar.

Isso reduz leitura repetida e deixa o Kanban mais próximo de uma mesa de operação comercial.

## Validação

- `npm run evolution:phase-114:check`
- `npm run typecheck`
- `npm run lint`

## Próxima etapa sugerida

Fase 115 — microinterações de movimento do Kanban: feedback visual ao mover etapa, confirmação suave e proteção contra movimentação acidental.
