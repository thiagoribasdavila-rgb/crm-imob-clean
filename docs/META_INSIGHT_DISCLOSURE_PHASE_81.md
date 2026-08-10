# Fase 81 — transparência de insights no Command Center

Todo insight de Meta exibido no Atlas deve revelar classe, confiança, qualidade da evidência, validade e necessidade de revisão humana. Assim, o usuário entende o limite da sugestão antes de decidir.

Evidência fraca, conflitante, expirada ou revogada fica somente em visualização. O insight não executa ações, não altera campanhas ou produção e não mostra payload, segredos ou dados de clientes.

```bash
node scripts/preflight-meta-insight-disclosure.mjs --self-test
```
