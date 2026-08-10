# Fase 36 — Transferência de foco para o Livro Executivo

## Objetivo

Completar a navegação entre o resumo executivo e a lista de decisões para pessoas que usam teclado ou tecnologias assistivas.

## Entrega

- Os atalhos de prioridade continuam rolando até o Livro Executivo.
- Após a rolagem, o foco do navegador acompanha a área atualizada.
- A área da lista recebe foco programático sem entrar indevidamente na ordem normal de tabulação.
- Nenhum registro, filtro de dados ou fluxo de decisão humana foi alterado.

## Validação

- `npm run typecheck` aprovado.
- `npm run lint` aprovado sem avisos.
- `node --test tests/contracts/assisted-interaction-governance.test.mjs` aprovado: 12 de 12.

## Impacto operacional

A navegação entre métrica e detalhe fica coerente para todos os perfis de uso, sem comprometer a velocidade de análise do diretor.
