# Fase 77 — gate de runtime do experimento

Antes de qualquer despacho futuro, o Atlas confere plano, autorização ativa, integridade, ambiente staging e tentativa número um. Uma divergência bloqueia a execução antes de qualquer contato com a Meta.

Mesmo aprovado, o gate exige despacho manual posterior. Ele não altera campanhas ou produção e não aceita payload, segredos ou dados de clientes.

```bash
node scripts/preflight-meta-experiment-runtime-gate.mjs --self-test
```
