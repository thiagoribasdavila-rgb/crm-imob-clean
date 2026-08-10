# Atlas One — Fase 22 — Tarefas e Agenda orientadas à ação

## Objetivo

Reduzir competição visual na rotina diária para que atrasos, compromissos de hoje e próximas ações sejam reconhecidos imediatamente, sem retirar operações existentes.

## Alterações

- A fila comercial de tarefas passa a ocupar toda a largura disponível.
- A carga por responsável continua acessível à liderança em “Ver carga da equipe por responsável”.
- Indicadores completos, recorrências e composição da agenda permanecem disponíveis sob demanda.
- A Agenda deixa de exibir rótulos internos de fases e mostra somente o estado útil de sincronização.
- Criação, conclusão, reagendamento, filtros, navegação para a lead, realtime e períodos da agenda permanecem intactos.

## Impacto operacional

- Menos ruído antes da execução da primeira tarefa.
- Mais espaço para leitura e ação sobre a fila comercial.
- Liderança mantém a visão de carga sem transformá-la em ranking nem desviar a rotina do corretor.
- Estado técnico da agenda é traduzido em informação operacional compreensível.

## Limites da fase

Não houve alteração em API, Supabase, schema, RLS, autenticação, hierarquia, recorrência, dados reais, integrações, regras comerciais ou pacote de release.

## Validação

```bash
npm run ux:phase-022:check
node --test tests/contracts/tasks-calendar-focus.test.mjs
npm test
npm run typecheck
npm run lint
```
