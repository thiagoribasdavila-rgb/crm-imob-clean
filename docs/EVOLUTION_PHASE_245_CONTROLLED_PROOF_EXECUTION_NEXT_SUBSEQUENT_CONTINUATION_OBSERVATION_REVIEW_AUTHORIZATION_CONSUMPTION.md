# Fase 240 — Consumo da autorização da revisão da observação da continuação subsequente

## Resultado

A Fase 240 adiciona o contrato que consome **internamente e uma única vez** uma autorização válida da Fase 239. O consumo exige autorização registrada, não expirada, assinada, de uso único e exatamente vinculada à revisão, à observação e à continuação subsequente que originaram a decisão.

Esta fase não executa a próxima continuação, não publica, não acessa rede, não altera banco, não gera pacote, não faz build, não faz deploy e não promove release.

## Artefatos

- `lib/release/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption.mjs`
- `tests/contracts/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption.test.mjs`
- `config/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption-policy.json`
- `config/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption-memory.json`
- `config/evolution-phase-245-controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption.json`
- `scripts/run-controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption-phase-245.mjs`
- `scripts/check-evolution-phase-245.mjs`

## Garantias do contrato

- autorização da Fase 239 deve estar assinada, registrada, não expirada e com exatamente um uso disponível;
- vínculo exato com autorização, revisão, observação subsequente, continuação subsequente, pacote e inventário;
- consumidor Ed25519 deve ser confiável, ativo, válido no instante do consumo e independente dos atores anteriores;
- recibo de consumo é assinado e vinculado ao head da memória anterior;
- autorização, ID de consumo e nonce duplicados são recusados;
- memória é encadeada, append-only e vinculada ao head atômico;
- depois do consumo válido restam zero usos;
- a próxima continuação permanece bloqueada nesta fase;
- todos os efeitos externos permanecem explicitamente falsos.

## Estado canônico

Nenhum consumidor, autorização ou consumo real foi inventado. As políticas e memórias canônicas permanecem vazias e vinculadas à cadeia real das Fases 236–239.

- política de autorização da Fase 239: `8c6984858eb83c45e6b55a8165e69bdb1b10f17b3bf12947a6f71903bec8bd13`;
- memória de autorização da Fase 239: `69df1c677d1be6e60f646933d328627c8039a1be1ecbb90d020e286f5ce886b2`;
- política de consumo da Fase 240: `27e9451c0392eca72882a8b7c0bce3b09568d7cea585bef40cd5d1c6c9e20ed4`;
- memória de consumo da Fase 240: `2e7181220feecb6430b36e6fc1dfdc6b4ee8a46b43b97511bdaa44344ebb2f8b`.

Os testes usam chaves Ed25519 efêmeras e dados isolados somente para provar o fluxo, a expiração, a independência e a recusa de consumo duplicado. Nenhum desses dados entra no estado canônico.

## Validação

```bash
node --test tests/contracts/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption.test.mjs
npm run evolution:phase-245:assess
npm run evolution:phase-245:check
```

## Próxima fase

Fase 246 — `Controlled Proof Execution Next Next Subsequent Continuation`: executar a próxima continuação interna somente a partir de um consumo válido, assinado e registrado, ainda sem publicação ou efeitos externos.
