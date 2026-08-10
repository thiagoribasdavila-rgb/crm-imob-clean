# Fase 76 — autorização vinculada ao plano

Uma autorização de experimento deve referenciar o plano e a permissão correspondentes, identificar o operador, expirar em prazo curto e aceitar somente uma tentativa em staging.

A autorização não abre a execução por si só: o gate de runtime continua obrigatório. Ela não altera campanhas, públicos ou produção e não aceita dados de clientes ou segredos.

```bash
node scripts/preflight-meta-experiment-execution-authorization.mjs --self-test
```
