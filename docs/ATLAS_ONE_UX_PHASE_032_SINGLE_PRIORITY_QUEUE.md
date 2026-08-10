# ATLAS ONE — Fase 32: fila única e curta de prioridades

## Objetivo

Reduzir a carga cognitiva acima do Kanban e fazer o corretor começar pelas poucas decisões que mais alteram o resultado comercial.

## Alterações

- a fila `Comece por aqui` passou a ser a única fila prioritária visível;
- o limite de três decisões ficou explícito e testável;
- a ordenação agora deriva da fila contextual do Kanban, que considera a lente do perfil, SLA, ação atrasada, temperatura, score, valor e etapa;
- o cabeçalho mostra quantas decisões estão expostas e quantas oportunidades continuam disponíveis no quadro;
- filtros redundantes foram retirados do cabeçalho da fila, pois o controle canônico já existe no workspace do pipeline;
- análises amplas continuam acessíveis por divulgação progressiva.

## Impacto operacional

O corretor recebe no máximo três decisões imediatas, sem interpretar uma segunda grade de filtros. Gerente e diretor continuam com a priorização coerente com suas lentes, e nenhuma oportunidade é escondida do quadro.

## Preservado

- arrastar e soltar;
- mudança por seletor;
- desfazer movimento;
- Lead 360;
- tarefas, Copilot e contato;
- filtros e análises do pipeline;
- contratos de API, autenticação, RLS e banco.

## Validação

```bash
npm run ux:phase-032:check
npm run typecheck
npm run lint
npm test
```

Não houve migration, alteração de dados, build, ZIP ou deploy nesta fase.
