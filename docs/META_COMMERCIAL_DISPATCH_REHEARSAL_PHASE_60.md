# Fase 60 — ensaio controlado de conversão

O Atlas está preparado para solicitar um ensaio de um único evento de teste, em staging isolado e somente após autorização separada. A solicitação aponta para a outbox já validada, sem transportar credenciais ou dados pessoais.

Esta fase não faz chamada ao Meta. O provedor fica vazio, o envio permanece desligado e produção é proibida. Nenhum retry, otimização automática, build ou ZIP é executado.

```bash
node scripts/preflight-meta-commercial-dispatch-rehearsal.mjs --self-test
```
