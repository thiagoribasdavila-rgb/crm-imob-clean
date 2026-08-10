# Fase 57 — sinais comerciais para aprendizado de campanhas

O Atlas passa a ter um contrato único para registrar os marcos que realmente importam: lead recebido, qualificação, contato concluído, visita agendada, proposta enviada e venda confirmada. O objetivo é medir o caminho até a receita, e não apenas formulários preenchidos.

Nesta fase não há chamada externa: o envio permanece desligado. Para qualquer ativação futura, são obrigatórios consentimento, processamento no servidor, hash de identificadores, chave de idempotência e confirmação humana nos sinais financeiros.

O contrato não guarda segredos no cliente, não registra dados pessoais em logs e não promete otimização automática.

```bash
node scripts/preflight-meta-commercial-signal-contract.mjs --self-test
```
