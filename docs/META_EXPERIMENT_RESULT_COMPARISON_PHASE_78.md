# Fase 78 — comparação agregada de experimento

Após uma observação autorizada, o Atlas compara a métrica agregada com a hipótese e confirma se a condição de parada foi cumprida. Resultado inconclusivo continua inconclusivo; ele não é convertido em “sucesso”.

A comparação exige revisão humana e não cria experimento seguinte, não altera campanhas, públicos ou produção. Não armazena payload, segredos ou dados de clientes em nível individual.

```bash
node scripts/preflight-meta-experiment-result-comparison.mjs --self-test
```
