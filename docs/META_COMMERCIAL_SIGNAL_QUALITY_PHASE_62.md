# Fase 62 — gate de qualidade dos sinais comerciais

Para um sinal ser elegível a feedback, o Atlas exige consentimento, confirmação humana, evidência comercial, ausência de duplicidade e coerência com a etapa do funil. Proposta e venda também exigem valor verificado.

O gate não classifica pessoas, não usa atributos protegidos e não muda orçamento ou público automaticamente. Mesmo aprovado, o feedback externo continua bloqueado por um gate separado. Esta fase não chama Meta, não acessa banco, não executa build e não cria ZIP.

```bash
node scripts/preflight-meta-commercial-signal-quality-gate.mjs --self-test
```
