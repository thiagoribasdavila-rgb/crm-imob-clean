# Fase 16 — Resiliência de prazo da revisão de IA

## Objetivo

Manter a revisão humana da IA compreensível quando um registro legado tiver prazo ausente ou inválido.

## Entrega

- A revisão pendente passa a orientar a definição da data de aferição quando não há prazo válido.
- Datas inválidas não são exibidas como texto técnico ou data quebrada.
- O estado do ciclo continua derivado exclusivamente do Livro Executivo existente.

## Escopo preservado

- Sem alterações no banco, prazos, responsáveis, decisões ou resultados.
- Sem automações, integrações ou chamadas de IA.

## Testes automatizados

- TypeScript (`npm run typecheck`): aprovado.
- ESLint (`npm run lint`): aprovado.
- Contrato de governança: 11 de 11 aprovados.
