# Fase 146 — Kanban V30 Inline Preview Drawer

## Objetivo

Permitir que o corretor abra um preview rápido da oportunidade dentro do próprio Kanban, sem sair do quadro e sem abrir uma tela pesada.

## Problema resolvido

O card já tinha dados e ações, mas o usuário ainda precisava alternar entre card, contexto colapsado, Lead 360 e Copilot para tomar uma decisão mais completa.

## Alterações realizadas

- Criado estado de lead em preview no Kanban.
- Adicionado botão `Preview` no comando principal do card.
- Criado painel inline com:
  - etapa atual;
  - leitura da IA/Atlas;
  - risco, temperatura e score;
  - fatos comerciais;
  - próximos 3 passos;
  - ações rápidas para Lead 360, Copilot, contato e avanço de etapa.
- O painel fecha automaticamente se o lead sair do recorte visível.
- O visual segue o padrão V30: escuro, limpo, orientado à decisão e sem modal bloqueante.

## Impacto operacional

- Corretor entende o contexto sem perder o foco do pipeline.
- Gerente e diretor conseguem usar o Kanban como cockpit de execução.
- Menos cliques e menos ruído visual.
- Mais fluidez entre decisão, ação e registro.

## Próxima etapa recomendada

Fase 147 — Kanban V30 Decision Density: compactar ainda mais os cards por perfil de usuário, mostrando dados diferentes para corretor, gerente e diretor.

## Riscos identificados

- Nenhuma alteração em banco.
- Nenhuma alteração em API.
- Nenhuma mudança em regra de pipeline.
- O preview depende dos dados já carregados no Kanban.

## Checklist de validação

- `npm run evolution:phase-146:check`
- `npm run typecheck`
- `npm run lint`
