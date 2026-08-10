# Fase 64 — aprovações independentes do teste externo

O teste externo futuro precisa de duas aprovações diferentes: diretoria e segurança. Ambas têm referência própria, validade limitada e vínculo com a mesma decisão explicável e o mesmo evento.

Mesmo aprovadas, não habilitam o teste sozinhas: a execução continua bloqueada para um operador autorizado em staging. Produção, retry, promoção automática, dados de cliente e mudanças automáticas de campanha seguem proibidos.

```bash
node scripts/preflight-meta-feedback-external-test-approval.mjs --self-test
```
