# Fase 80 — expiração e revogação de memória

Antes de reutilizar um conhecimento, o Atlas confere proveniência, vencimento e pedido de revogação. Qualquer falha bloqueia o uso até revisão humana; uma revogação encerra o uso imediatamente.

O controle não usa a memória para recomendar ações, não altera campanhas ou produção e não armazena payload, segredos ou dados de clientes.

```bash
node scripts/preflight-meta-learning-memory-revocation.mjs --self-test
```
