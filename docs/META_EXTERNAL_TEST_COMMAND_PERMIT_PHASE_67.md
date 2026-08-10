# Fase 67 — permissão de comando externo unitário

A permissão une a decisão explicável, a dupla aprovação, o gate manual e o ensaio seco. Ela autoriza apenas um evento de teste em staging, com expiração e uso único.

Criar a permissão não executa o comando. Produção, retry, promoção automática, envio em massa, payload em logs e alterações automáticas de campanha permanecem proibidos.

```bash
node scripts/preflight-meta-external-test-command-permit.mjs --self-test
```
