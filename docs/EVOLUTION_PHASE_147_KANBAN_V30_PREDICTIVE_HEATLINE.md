# Fase 147 — Kanban V30 Predictive Heatline

## Objetivo

Reduzir ruído no Kanban e aumentar decisão operacional. A fase 147 adiciona uma heatline preditiva no quadro comercial para mostrar, em poucos segundos, quais oportunidades têm maior prioridade por SLA, score, etapa, valor e ausência de próxima ação.

## Problema resolvido

O Kanban já tinha boas informações, mas o corretor ainda precisava interpretar muitos sinais. A heatline transforma sinais dispersos em uma ordem visual: primeiro agir no lead mais quente, depois no próximo, sem sair do fluxo.

## Alterações realizadas

- Criação dos tipos `KanbanV30PrioritySignal` e `KanbanV30HeatlineItem`.
- Mapeamento de prioridade por lead com `kanbanV30PriorityIndex`.
- Novo bloco `atlas-kanban-v30-heatline` acima das decisões do dia.
- Marcação compacta nos cards com `atlas-kanban-v30-card-priority-mark`.
- Ação direta para abrir prioridade, focar etapa, ligar modo compacto e abrir preview do lead.
- Estilos responsivos para desktop e mobile.

## Impacto operacional

- Corretor: sabe por onde começar sem ler o quadro inteiro.
- Gerente: identifica rapidamente riscos e oportunidades por calor comercial.
- Diretor: vê que a operação está sendo priorizada por valor, urgência e próximo passo.

## Segurança e dados

Nenhuma alteração em banco. A fase usa apenas dados já carregados no pipeline e não cria migration, tabela, coluna ou integração externa.

## Validação

- `npm run evolution:phase-147:check`
- `npm run typecheck`
- `npm run lint`

## Próxima etapa sugerida

Fase 148 — transformar a heatline em ações em lote seguras para gerente e diretor: selecionar prioridades, atribuir responsável, criar tarefas e gerar mensagens IA sem poluir a experiência do corretor.
