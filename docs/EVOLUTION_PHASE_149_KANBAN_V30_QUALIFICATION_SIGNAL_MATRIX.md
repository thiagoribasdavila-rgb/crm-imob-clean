# Fase 149 — Kanban V30 Qualification Signal Matrix

## Objetivo

Melhorar o Kanban como ferramenta de decisão comercial, mostrando no lote prioritário quais sinais de qualificação ainda faltam antes da próxima abordagem.

## O que foi entregue

- Matriz de lacunas comerciais baseada no lote selecionado.
- Cobertura percentual de memória comercial do lote.
- Perguntas sugeridas para objetivo, investimento, região e tipologia.
- Indicação de impacto operacional de cada lacuna.
- Atalho contextual para a área de qualidade de dados.

## Impacto operacional

O corretor deixa de abrir o cliente “no escuro”. Antes de ligar, mandar WhatsApp ou avançar etapa, ele enxerga quais informações faltam para:

- qualificar mais rápido;
- melhorar score;
- personalizar abordagem;
- alimentar melhor a memória da IA;
- gerar sinais mais úteis para Meta/Andromeda.

## Segurança

Nenhuma alteração em banco, migration, API externa ou disparo automático foi feita. A fase apenas organiza sinais já disponíveis na interface.

## Validação

- `npm run evolution:phase-149:check`
- `npm run typecheck`
- `npm run lint`
