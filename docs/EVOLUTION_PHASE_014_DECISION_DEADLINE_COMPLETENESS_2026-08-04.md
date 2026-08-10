# Fase 14 — Completude de prazo no Livro Executivo

## Objetivo

Evidenciar decisões humanas abertas que ainda não possuem uma data de aferição, sem mudar qualquer compromisso ou criar automações.

## Entrega

- Indicador **Sem prazo** no resumo do ciclo de decisão.
- Filtro específico para decisões abertas sem prazo ou com data legada inválida.
- A janela de 24 horas agora confirma explicitamente que o prazo ocorre entre agora e as próximas 24 horas.
- Registros encerrados ou rejeitados continuam fora da fila de completude.

## Escopo preservado

- Leitura somente do Livro Executivo existente (`atlas_decisions`).
- Nenhuma tarefa, alerta externo, proprietário, decisão ou prazo foi criado ou alterado.
- Nenhuma tabela, migration, API ou integração externa foi adicionada.

## Validação manual

1. Abra **Central de Decisão → Livro Executivo**.
2. Selecione **Sem prazo**.
3. Confirme que aparecem somente decisões abertas sem data válida de aferição.
4. Selecione **Vencem em 24h** e confirme que prazos já vencidos não entram nessa fila.

## Testes automatizados

- TypeScript (`npm run typecheck`): aprovado.
- ESLint (`npm run lint`): aprovado.
- Contrato de governança: 9 de 9 aprovados.
