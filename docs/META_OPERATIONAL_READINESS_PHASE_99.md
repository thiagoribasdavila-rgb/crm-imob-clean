# Fase 99 — gate de prontidão operacional

O Atlas consolida governança, memória, aprovações humanas e limites do Copilot em um gate único. A homologação controlada pode avançar quando esses controles estão válidos, mas a produção continua bloqueada por padrão.

Para a futura liberação operacional, são obrigatórias evidências reais e independentes: teste completo de entrada e retorno de lead, confirmação de recebimento dos sinais pelo Meta, teste de rollback e monitoramento de produção. Evidência ausente nunca é presumida como aprovada.

Este gate não realiza mudanças externas e não utiliza dados de clientes, payloads de provedores ou segredos.

```bash
node scripts/preflight-meta-operational-readiness.mjs --self-test
```
