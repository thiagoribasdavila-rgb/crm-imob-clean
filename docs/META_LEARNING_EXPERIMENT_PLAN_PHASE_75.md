# Fase 75 — plano de experimento mensurável

O plano de experimento exige hipótese explícita, sinal esperado, métrica, classe de amostra, janela e critério de parada. Isso permite comparar aprendizado sem confundir resultado técnico com resultado comercial.

O plano permanece documental: não libera teste externo, não altera campanhas ou produção e exige aprovação independente para qualquer execução. Nenhum payload, segredo ou dado de cliente é incluído.

```bash
node scripts/preflight-meta-learning-experiment-plan.mjs --self-test
```
