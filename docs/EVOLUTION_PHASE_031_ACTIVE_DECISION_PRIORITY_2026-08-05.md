# Fase 31 — Prioridade ativa sincronizada

## Objetivo

Eliminar a ambiguidade entre o resumo executivo e o filtro aberto no Livro Executivo.

## Entrega

- Os cartões acionáveis do resumo passam a indicar visualmente qual prioridade está aberta na lista.
- A semântica de acessibilidade usa `aria-pressed` para comunicar o estado selecionado.
- O filtro continua sendo somente uma visualização: nenhum registro, prazo, responsável ou resultado é alterado ao usar o atalho.

## Validação

- `npm run typecheck` aprovado.
- `npm run lint` aprovado sem avisos.
- `node --test tests/contracts/assisted-interaction-governance.test.mjs` aprovado: 12 de 12.

## Impacto operacional

Quem consulta o Command Center enxerga imediatamente a prioridade em análise e mantém contexto ao navegar da métrica para a lista de decisões.
