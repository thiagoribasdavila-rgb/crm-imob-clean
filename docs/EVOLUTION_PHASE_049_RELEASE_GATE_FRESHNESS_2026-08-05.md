# Fase 49 — atualidade da leitura do gate

## Objetivo

Evitar que uma resposta mais lenta de uma consulta anterior sobrescreva a leitura mais recente do gate de liberação.

## Alteração aplicada

- Cada carregamento recebe uma referência interna de atualização.
- Apenas a última solicitação em curso pode alterar o status, as evidências ou a mensagem de indisponibilidade exibida.
- Uma tentativa anterior que termine depois é descartada silenciosamente.

## Impacto operacional

Ao atualizar o gate repetidamente, a Diretoria passa a decidir sempre sobre a leitura mais atual da evidência, sem risco de uma resposta antiga restaurar um estado ultrapassado.

## Validações

- Typecheck e lint.
- Contratos de governança, medição antes/depois e gate de release.
- Sem alteração de banco, dados comerciais, feature flags remotas, build, ZIP ou deploy.
