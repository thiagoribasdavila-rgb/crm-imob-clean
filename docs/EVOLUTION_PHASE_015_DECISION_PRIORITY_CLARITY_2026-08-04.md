# Fase 15 — Ordem operacional da próxima decisão

## Objetivo

Evitar que uma decisão aberta sem data de aferição apareça antes de um compromisso com prazo real.

## Entrega

A ordem de leitura do Livro Executivo passa a ser:

1. Prazo vencido.
2. Resultado pendente com prazo válido, do mais próximo ao mais distante.
3. Resultado pendente sem prazo válido.
4. Histórico encerrado ou rejeitado.

O card **Próxima decisão** também informa quando a pendência prioritária precisa, antes de tudo, receber uma data de aferição.

## Escopo preservado

- Somente ordenação e apresentação do livro existente.
- Não cria prazos, tarefas, alertas, contatos ou automações.
- Não altera decisões, responsáveis ou resultados humanos já registrados.

## Testes automatizados

- TypeScript (`npm run typecheck`): aprovado.
- ESLint (`npm run lint`): aprovado.
- Contrato de governança: aprovado, incluindo a prioridade entre prazo real e registro sem prazo.
