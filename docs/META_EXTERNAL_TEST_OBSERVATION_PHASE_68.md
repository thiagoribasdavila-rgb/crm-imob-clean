# Fase 68 — observação controlada do teste externo

Após o teste unitário, o Atlas aceita somente uma observação: uma tentativa, permissão consumida, chamada observada, resultado técnico resumido e retorno obrigatório para revisão humana.

O observador bloqueia repetição, produção, retry e promoção automática. Não armazena payload, resposta bruta do provedor ou dados de clientes.

```bash
node scripts/preflight-meta-external-test-observation.mjs --self-test
```
