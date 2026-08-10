# Fase 66 — ensaio seco do teste externo

Antes do teste externo, o Atlas executa uma simulação local de seis passos: gate manual, evento único, staging, ausência de payload em logs, despacho desligado e comando externo separado.

O ensaio seco não lê segredos, não toca produção, não acessa banco, não chama Meta, não executa build e não cria ZIP. Ele apenas confirma que o próximo comando continua bloqueado e precisa de autorização própria.

```bash
node scripts/preflight-meta-external-test-dry-run.mjs --self-test
```
