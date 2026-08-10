# Fase 56 — manifesto final de evidências

O manifesto consolida o commit aprovado, os sete controles operacionais e a cadeia de hashes do recibo auditável. Ele só é válido se todos os controles forem comprovados e se os identificadores forem os mesmos do vínculo de auditoria.

Mesmo validado, o manifesto não executa build, não cria ZIP e não publica. A execução continua limitada ao único comando final, depois dos gates independentes.

```bash
node scripts/preflight-atlas-release-evidence-manifest.mjs --self-test
```
