# Fase 58 — envelope seguro de evento comercial

Cada conversão futura terá um envelope mínimo: identificador do evento, marco comercial, data, referências internas, consentimento, confirmação humana e chave de idempotência. Esse desenho permite identificar duplicidade sem transportar telefone, e-mail, nome, anotações ou credenciais.

Eventos de proposta e venda exigem valor em reais e confirmação humana. O despacho externo permanece desligado; a fase não lê banco, não chama Meta, não cria ZIP e não executa build.

```bash
node scripts/preflight-meta-commercial-event-envelope.mjs --self-test
```
