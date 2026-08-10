# Fase 137 — Kanban V30 Stage Command Header

## Objetivo

Transformar cada coluna do Kanban em uma orientação de decisão. Em vez de mostrar apenas números, a etapa passa a dizer qual ação comercial merece atenção agora.

## O que foi implementado

- Novo modelo `KanbanV30StageCommand`.
- Função `kanbanV30StageCommand` para converter a saúde da etapa em comando prático.
- Comandos possíveis:
  - `Recuperar agora` para SLA ou próxima ação vencida.
  - `Remover gargalo` para leads parados.
  - `Agendar próximo passo` para leads sem compromisso.
  - `Acelerar conversão` para oportunidades quentes.
  - `Manter ritmo` para etapa saudável.
- Cabeçalho compacto por coluna com label, motivo e botão de foco.
- Botão que aplica o filtro certo no Kanban sem mover leads automaticamente.

## Impacto operacional

O corretor não precisa interpretar urgência, score, atraso e próximos passos separadamente. A coluna mostra o comando mais importante e permite focar a visão em um clique. Isso reduz ruído, acelera rotina comercial e aproxima o Kanban do padrão V30 de decisão assistida por IA.

## Segurança

- Não altera banco.
- Não movimenta lead automaticamente.
- Não dispara mensagem.
- Não conclui tarefa.
- Não cria automação invisível.

## Validação

- `npm run evolution:phase-137:check`
- `npm run typecheck`
- `npm run lint`
