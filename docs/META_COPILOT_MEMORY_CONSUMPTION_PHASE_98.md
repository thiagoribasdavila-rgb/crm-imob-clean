# Fase 98 — consumo seguro da memória pelo Copilot

O Copilot só pode usar uma memória quando o escopo solicitado coincide com o escopo publicado e a validade ainda está ativa. A resposta informa a origem e apresenta o conteúdo como orientação, nunca como fato comprovado.

O uso da memória não executa ações nem alimenta automações. Ele não utiliza dados de clientes, payloads de provedores ou segredos.

```bash
node scripts/preflight-meta-copilot-memory-consumption.mjs --self-test
```
