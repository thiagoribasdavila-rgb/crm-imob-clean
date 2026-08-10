# Atlas One — Fase 10: faixa global de comando

## Objetivo

Reduzir a competição visual no topo sem remover busca, criação contextual, Copilot, notificações, perfil, densidade ou atalhos de teclado.

## Alteração aplicada

- Busca global vem primeiro e mantém `⌘/Ctrl K`.
- A criação contextual é a única ação primária da faixa.
- Copilot e notificações formam um grupo utilitário secundário.
- O estado seguro continua anunciado por tecnologia assistiva, sem virar um selo decorativo.
- Em desktop, o Copilot abre pelo topo e o lançador flutuante duplicado fica oculto.
- Em celular, o lançador existente permanece para preservar acesso rápido.

## Garantias

Nenhuma API, tabela, RLS, sessão, integração, dado real ou rota foi alterada. Os eventos existentes continuam sendo o contrato de abertura das superfícies globais.

## Validação

Executar `npm run ux:phase-010:check`, `npm test`, `npm run typecheck` e `npm run lint`.
