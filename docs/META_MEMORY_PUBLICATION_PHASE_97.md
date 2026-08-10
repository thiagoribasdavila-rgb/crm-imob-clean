# Fase 97 — publicação governada da memória

Uma proposta de memória só pode ser publicada para o Copilot após revisão independente, com escopo, motivo e validade definidos. O próprio autor da proposta não pode aprová-la.

A memória aprovada pode orientar o Copilot, mas nunca automações. Ela não contém dados de clientes, payloads de provedores ou segredos e pode expirar conforme a revisão.

```bash
node scripts/preflight-meta-memory-publication.mjs --self-test
```
