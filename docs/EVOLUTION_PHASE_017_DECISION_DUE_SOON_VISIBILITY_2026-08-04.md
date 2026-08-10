# Fase 17 — Visibilidade da janela de 24 horas

## Objetivo

Transformar o indicador de prazo próximo em informação legível dentro de cada registro do Livro Executivo.

## Entrega

- Selo **Vence em 24h** nas decisões abertas que entram na janela preventiva.
- Uma única regra de cálculo aplicada ao resumo, ao filtro e à lista de decisões.
- Prazos vencidos, ciclos encerrados e decisões rejeitadas não recebem o selo preventivo.

## Escopo preservado

- Nenhum alerta, tarefa, contato ou prazo foi criado.
- A mudança é somente de leitura, priorização visual e acessibilidade da informação existente.

## Testes automatizados

- TypeScript (`npm run typecheck`): aprovado.
- ESLint (`npm run lint`): aprovado.
- Contrato de governança: 12 de 12 aprovados.
