# Fase 59 — fila de conversões comerciais

A outbox organiza apenas eventos já validados. Cada item preserva sua chave de idempotência para impedir duplicidade e permanece no estado `validated_not_dispatchable` até uma homologação externa explícita.

Nesta fase, envio, provedor e repetição automática estão desligados. A fila não acessa banco, não chama Meta, não publica eventos, não executa build e não cria ZIP. Segredos e dados pessoais são proibidos.

```bash
node scripts/preflight-meta-commercial-outbox.mjs --self-test
```
