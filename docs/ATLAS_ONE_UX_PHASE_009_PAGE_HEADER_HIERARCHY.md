# Atlas One — Fase 9: hierarquia única de cabeçalhos

Data: 04/08/2026

## Objetivo

Fazer a primeira leitura de cada área responder, na mesma ordem: onde estou, qual é a decisão da tela e qual ação principal posso executar.

## Alterações

- O cabeçalho compartilhado passou a declarar explicitamente o contrato decisório e o limite de ação principal.
- Leads, Pipeline, Tarefas, Clientes 360 e Projetos aderem ao mesmo contrato sem perder controles secundários, filtros, sinais ou operações existentes.
- O título do Pipeline passou de `h2` para `h1`, corrigindo a hierarquia semântica da página.
- A orientação decisória opcional ganhou estilo próprio, menos ruidoso que o título e mais evidente que texto auxiliar.
- A ação primária recebeu ênfase consistente; ações secundárias continuam disponíveis sem disputar a primeira decisão.

## Impacto operacional

O usuário reconhece mais rapidamente o propósito e a ação dominante das áreas mais usadas. Nenhum CRUD, evento, permissão, dado ou integração foi alterado.

## Validação

Execute `npm run ux:phase-009:check`, seguido da suíte de contratos, typecheck e lint.

## Próxima fase

Coordenar busca, criação rápida, notificações e Copilot como superfícies sob demanda, evitando quatro focos simultâneos no shell.
