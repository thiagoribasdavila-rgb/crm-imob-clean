# Fase 74 — decisão de experimento da diretoria

Uma hipótese só pode gerar um plano de experimento após decisão da diretoria identificada, com objetivo e condição de parada definidos. A aprovação é somente do plano — não habilita teste externo, campanha ou produção.

Rejeições e pedidos de mais evidência nunca preparam plano. O registro não inclui payload, segredos ou dados de clientes e não executa qualquer mudança automática.

```bash
node scripts/preflight-meta-learning-experiment-decision.mjs --self-test
```
