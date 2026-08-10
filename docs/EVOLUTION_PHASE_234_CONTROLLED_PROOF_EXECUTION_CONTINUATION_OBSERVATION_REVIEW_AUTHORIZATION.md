# Fase 234 — Autorização da revisão da observação da continuação controlada

## Resultado

A Fase 234 adiciona um contrato estrito para emitir uma autorização **interna** de continuação somente quando existir uma revisão anterior aceita, assinada, válida e já registrada na memória canônica da Fase 233.

Esta fase não executa uma continuação, não publica, não acessa rede, não altera banco, não gera pacote, não faz build e não promove release.

## Artefatos

- `lib/release/controlled-proof-execution-continuation-observation-review-authorization.mjs`
- `tests/contracts/controlled-proof-execution-continuation-observation-review-authorization.test.mjs`
- `config/controlled-proof-execution-continuation-observation-review-authorization-policy.json`
- `config/controlled-proof-execution-continuation-observation-review-authorization-memory.json`
- `config/evolution-phase-234-controlled-proof-execution-continuation-observation-review-authorization.json`
- `scripts/run-controlled-proof-execution-continuation-observation-review-authorization-phase-234.mjs`
- `scripts/check-evolution-phase-234.mjs`

## Garantias do contrato

- revisão aceita, assinada e registrada é obrigatória;
- vínculo exato com revisão, observação, continuação, autorizações e execução anteriores;
- autorizador Ed25519 deve ser confiável, válido e independente de todos os atores anteriores;
- janela máxima entre revisão e autorização de 300 segundos;
- validade máxima da autorização de 300 segundos;
- uma revisão só pode ser autorizada uma vez;
- ID e nonce duplicados são recusados;
- memória é encadeada, append-only e vinculada ao head atômico;
- a autorização nasce com exatamente um consumo disponível;
- a execução subsequente permanece bloqueada nesta fase;
- todos os efeitos externos permanecem explicitamente falsos.

## Estado canônico

Nenhum autorizador, revisão ou autorização real foi inventado. A política está pronta, mas as memórias continuam vazias e a prontidão permanece aguardando evidência real futura.

## Validação

```bash
node --test tests/contracts/controlled-proof-execution-continuation-observation-review-authorization.test.mjs
npm run evolution:phase-234:assess
npm run evolution:phase-234:check
```

## Próxima fase

Fase 235 — `Controlled Proof Execution Continuation Observation Review Authorization Consumption`: consumir internamente uma autorização válida exatamente uma vez, ainda sem executar a continuação nem liberar efeitos externos.
