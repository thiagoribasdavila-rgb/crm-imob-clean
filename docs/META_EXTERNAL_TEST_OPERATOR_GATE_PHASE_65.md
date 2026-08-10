# Fase 65 — gate manual do operador

Depois das aprovações, o ensaio ainda requer confirmação manual do operador, escopo de staging e uma janela máxima de trinta minutos. O gate valida a solicitação, mas não liga o despacho — o comando externo continua separado.

Não há produção, retry automático, múltiplos eventos, segredo no pedido ou payload de cliente em logs. Esta fase não chama Meta, não acessa banco, não executa build e não cria ZIP.

```bash
node scripts/preflight-meta-external-test-operator-gate.mjs --self-test
```
