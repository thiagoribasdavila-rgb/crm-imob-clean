# Atlas One — Fase 23 — Linha do tempo operacional do Lead 360

## Objetivo

Reunir próxima ação, tarefas abertas, visitas e acompanhamentos recentes em uma leitura operacional única no Lead 360, reutilizando os dados já entregues pela API canônica.

## Alterações

- O bloco de próxima ação agora apresenta uma linha do tempo compacta da rotina.
- Tarefas vencidas aparecem primeiro, seguidas das próximas ações e do histórico recente.
- Tarefas concluídas e canceladas deixam de competir por atenção nessa leitura curta.
- Visitas são identificadas no próprio contexto da linha do tempo.
- O corretor continua podendo abrir a gestão completa de tarefas, registrar um acompanhamento e consultar todo o histórico.

## Impacto operacional

- O corretor identifica rapidamente se há atraso, compromisso ou contexto recente antes do contato.
- Tarefa, agenda, follow-up e memória deixam de parecer fontes separadas dentro do Lead 360.
- A profundidade continua disponível sem ocupar permanentemente a primeira leitura.

## Fontes preservadas

- `leads.next_action_at`
- `tasks`
- `activities`
- `lead_events`

Não foi criada nova tabela, API, automação ou regra de sincronização.

## Limites da fase

Não houve alteração em Supabase, migrations, RLS, autenticação, RBAC, dados reais, integrações ou pacote de release.

## Validação

```bash
npm run ux:phase-023:check
node --test tests/contracts/lead-operational-timeline.test.mjs
npm test
npm run typecheck
npm run lint
```
