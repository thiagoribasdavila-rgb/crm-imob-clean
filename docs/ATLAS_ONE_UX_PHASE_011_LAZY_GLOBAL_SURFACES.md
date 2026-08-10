# Atlas One — Fase 11: superfícies globais sob demanda

## Objetivo

Reduzir o JavaScript necessário na entrada de cada rota do CRM sem remover recursos ou atrasar os serviços que protegem a operação.

## Alterações

- Busca global, notificações, criação rápida, feedback e Copilot passaram a usar `next/dynamic` no cliente.
- A primeira interação é armazenada e repetida depois que o painel termina de carregar; o clique, atalho e contexto do Copilot não são perdidos.
- Lançadores leves mantêm Copilot e criação rápida acessíveis antes do download dos painéis completos.
- Identidade e permissões continuam chegando à busca global pela mesma fonte segura do shell.
- System Pulse, memória de navegação e presença comercial permanecem montados desde o início porque executam monitoramento contínuo.

## Impacto operacional

O corretor recebe uma entrada mais leve nas telas de rotina. Recursos avançados só consomem processamento quando usados, mantendo os mesmos atalhos e ações.

## Limites da fase

Nenhuma alteração de banco, RLS, autenticação, integração ou release. Build e ZIP permanecem reservados ao fechamento definido pelo projeto.

## Validação

Executar `npm run ux:phase-011:check`, `npm test`, `npm run typecheck` e `npm run lint`.
