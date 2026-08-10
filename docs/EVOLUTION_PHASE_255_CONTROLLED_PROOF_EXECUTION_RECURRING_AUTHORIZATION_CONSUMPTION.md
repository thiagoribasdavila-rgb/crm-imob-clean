# Fase 255 — Consumo de autorização recorrente

O gate de consumo único foi consolidado no motor recorrente. Ele exige ator Ed25519 confiável, validade temporal, vínculo exato com a autorização da fase 254, sequência correta e memória append-only. A memória canônica permanece vazia: nenhum consumo real foi alegado.

Validação: `npm run evolution:phase-255:check`.
