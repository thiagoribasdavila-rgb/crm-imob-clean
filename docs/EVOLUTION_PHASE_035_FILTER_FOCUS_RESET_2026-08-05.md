# Fase 35 — Foco limpo ao trocar prioridade

## Objetivo

Garantir que cada nova prioridade do Livro Executivo comece pela leitura compacta e mais relevante.

## Entrega

- A seleção de filtros foi centralizada em uma única ação de interface.
- Ao mudar de prioridade, a lista volta para a prévia das decisões prioritárias.
- A expansão anterior continua sendo apenas visual e nunca altera o conteúdo do histórico.
- Os atalhos do resumo, os filtros da lista, o estado vazio e a próxima decisão usam o mesmo comportamento seguro.

## Validação

- `npm run typecheck` aprovado.
- `npm run lint` aprovado sem avisos.
- `node --test tests/contracts/assisted-interaction-governance.test.mjs` aprovado: 12 de 12.

## Impacto operacional

O gestor não carrega o contexto visual de uma prioridade para outra e recebe primeiro as decisões que merecem atenção no novo recorte.
