# Atlas One — Fase 33: painel secundário de análise

## Objetivo

Reduzir o ruído do Pipeline sem remover briefing, diagnóstico, indicadores, radar, mapas ou ações em lote. O Kanban permanece como área principal de trabalho e a fila curta de três decisões continua sendo o único ponto de prioridade aberto antes do quadro.

## Alteração realizada

As sete áreas de análise do Pipeline agora compartilham o grupo `pipeline-secondary-analysis`. O navegador coordena os painéis: ao abrir uma análise, a análise anteriormente aberta é fechada. Assim, o usuário examina um contexto por vez e não acumula grandes blocos simultâneos na tela.

Foram reunidos no mesmo comportamento:

- diagnóstico e clareza do pipeline;
- briefing ampliado do Kanban;
- atalhos de análise;
- saúde e indicadores;
- resumo das etapas;
- lentes, fila inteligente e radar de gargalos;
- mapas preditivos e ações em lote seguras.

## O que foi preservado

- fila curta `Comece por aqui`, limitada a três decisões;
- Kanban completo;
- filtros e lentes por perfil;
- arrastar e soltar, seletor de etapa e desfazer;
- Lead 360, tarefas, contatos e Copilot;
- radares, mapas e ações em lote;
- APIs, banco, RLS e contratos existentes.

## Segurança da mudança

Esta fase não cria migration, não altera dados, não muda integrações e não gera release. A coordenação usa o comportamento nativo de painéis nomeados, com marcação explícita para auditoria e teste automatizado.

## Resultado operacional

O corretor trabalha primeiro na fila curta e no Kanban. Gerente e diretor abrem somente a análise necessária para a decisão atual. Toda a profundidade anterior continua disponível, mas deixa de disputar atenção simultaneamente.
