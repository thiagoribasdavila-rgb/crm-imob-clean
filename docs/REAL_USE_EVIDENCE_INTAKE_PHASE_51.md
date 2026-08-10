# Fase 51 — Coleta governada de evidências para uso real

Esta fase cria a porta de entrada para evidências de homologação. Ela não lê segredos, sessões, clientes, banco, Meta ou produção.

Para iniciar a decisão de release, o responsável registra somente referências seguras para: commit aprovado, staging isolado, consistência do banco, ambiente, testes críticos, jornada comercial mínima e decisão da diretoria. URLs, tokens, dados pessoais e conteúdo de clientes são rejeitados.

Mesmo uma entrada completa não cria ZIP, não executa build nem publica. Ela gera apenas a evidência que poderá ser revisada na próxima fase.

Validação local:

```bash
node scripts/preflight-atlas-real-use-evidence-intake.mjs --self-test
```
