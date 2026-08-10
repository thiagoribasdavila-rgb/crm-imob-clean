# Fase 235 — Consumo da autorização da revisão da observação da continuação controlada

## Resultado

A Fase 235 adiciona o contrato que consome **internamente e uma única vez** uma autorização válida da Fase 234. O consumo exige autorização registrada, ainda válida, assinada, de uso único e exatamente vinculada a toda a cadeia de evidências anterior.

Esta fase não executa a continuação subsequente, não publica, não acessa rede, não altera banco, não gera pacote, não faz build e não promove release.

## Artefatos

- `lib/release/controlled-proof-execution-continuation-observation-review-authorization-consumption.mjs`
- `tests/contracts/controlled-proof-execution-continuation-observation-review-authorization-consumption.test.mjs`
- `config/controlled-proof-execution-continuation-observation-review-authorization-consumption-policy.json`
- `config/controlled-proof-execution-continuation-observation-review-authorization-consumption-memory.json`
- `config/evolution-phase-235-controlled-proof-execution-continuation-observation-review-authorization-consumption.json`
- `scripts/run-controlled-proof-execution-continuation-observation-review-authorization-consumption-phase-235.mjs`
- `scripts/check-evolution-phase-235.mjs`

## Garantias do contrato

- autorização anterior deve estar assinada, registrada, não expirada e com exatamente um uso disponível;
- vínculo exato com autorização, revisão, observação, continuação, execução inicial, pacote e inventário;
- consumidor Ed25519 deve ser confiável, ativo, válido no instante do consumo e independente dos atores anteriores;
- recibo de consumo é assinado e vinculado ao head da memória anterior;
- autorização, ID de consumo e nonce duplicados são recusados;
- memória é encadeada, append-only e vinculada ao head atômico;
- após o consumo, restam zero usos;
- a continuação subsequente permanece bloqueada nesta fase;
- todos os efeitos externos permanecem explicitamente falsos.

## Estado canônico

Nenhum consumidor, autorização ou consumo real foi inventado. A política está pronta, mas as memórias permanecem vazias e a prontidão aguarda uma autorização real registrada, válida e um consumidor independente confiável.

Os testes do contrato usam chaves Ed25519 efêmeras e dados isolados apenas para provar o fluxo e as recusas. Esses dados não entram no estado canônico nem produzem efeitos externos.

## Validação

```bash
node --test tests/contracts/controlled-proof-execution-continuation-observation-review-authorization-consumption.test.mjs
npm run evolution:phase-235:assess
npm run evolution:phase-235:check
```

## Próxima fase

Fase 236 — `Controlled Proof Execution Subsequent Continuation`: executar uma continuação interna subsequente somente a partir de um consumo válido, assinado e registrado, ainda sem publicação ou efeitos externos.
