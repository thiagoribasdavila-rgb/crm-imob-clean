# Fase 53 — vínculo entre prontidão e release

O fechamento do `ATLAS_AI_OS_RELEASE_v1.zip` agora exige um recibo de prontidão validado além dos gates já existentes. O arquivo esperado é `config/atlas-real-use-readiness-decision.json`, ou outro caminho indicado em `ATLAS_READINESS_DECISION_FILE`.

## Ordem obrigatória

1. Coletar evidências seguras da homologação em staging isolado (Fase 51).
2. Revisar e registrar a decisão humana, sem liberar execução (Fase 52).
3. Marcar todos os gates independentes da release como aprovados.
4. Só então executar o único build de fechamento e gerar o ZIP.

Sem recibo válido, o processo para antes do build. Esta fase não acessa banco, Meta, staging ou produção; não cria ZIP, não executa build e não publica.

## Proteções

- O recibo precisa manter `buildAllowed`, `packageAllowed` e `deploymentAllowed` como `false`.
- A aprovação humana não substitui os oito gates de release.
- O artefato continua sem segredos e sem dados de clientes.
