# Fase 70 — cápsula de aprendizado controlado

Depois da revisão humana, o Atlas pode preparar uma cápsula mínima para análise: classe do resultado, qualidade da evidência e recomendação. A cápsula não altera campanhas, públicos, eventos da Meta ou produção.

Toda recomendação exige nova aprovação humana. Não armazena payload, resposta bruta do provedor, segredos ou dados de clientes.

```bash
node scripts/preflight-meta-external-test-learning-capsule.mjs --self-test
```
