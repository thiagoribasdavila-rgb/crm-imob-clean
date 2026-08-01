# Fase 43 — Tarefas recorrentes

## Resultado

Tarefas podem repetir diariamente, semanalmente ou mensalmente. Toda recorrência exige data final e limite de 2 a 100 ocorrências. A primeira tarefa e a regra nascem na mesma transação.

## Execução segura

O worker da Hostinger usa segredo operacional, bloqueio concorrente e chave única por ocorrência. Ao atingir data ou quantidade máxima, a regra é encerrada explicitamente. A lead mantém seu corretor único.

## Homologação

Aplicar a migration, configurar o cron e validar todas as cadências, virada mensal, concorrência, limite, término, lead transferida e dois tenants. Execute `npm run recurring-tasks:check`.
