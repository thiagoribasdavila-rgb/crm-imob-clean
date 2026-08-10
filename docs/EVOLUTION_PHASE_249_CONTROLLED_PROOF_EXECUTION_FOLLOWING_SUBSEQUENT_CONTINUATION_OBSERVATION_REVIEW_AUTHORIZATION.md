# Fase 249 — Autorização da revisão da observação da próxima continuação subsequente

## Resultado

A Fase 249 adiciona um contrato estrito para emitir uma autorização **interna** de próxima continuação subsequente somente quando existir uma revisão da observação da próxima continuação subsequente aceita, assinada, válida e já registrada na memória canônica da Fase 248.

Esta fase não executa uma continuação, não publica, não acessa rede, não altera banco, não gera pacote, não faz build e não promove release.

## Artefatos

- `lib/release/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization.mjs`
- `tests/contracts/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization.test.mjs`
- `config/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-policy.json`
- `config/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-memory.json`
- `config/evolution-phase-249-controlled-proof-execution-following-subsequent-continuation-observation-review-authorization.json`
- `scripts/run-controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-phase-249.mjs`
- `scripts/check-evolution-phase-249.mjs`

## Garantias do contrato

- revisão aceita, assinada e registrada é obrigatória;
- vínculo exato com a revisão da Fase 248 e com toda a cadeia de observação, continuação, autorizações e execução das Fases 227–242;
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

Nenhum autorizador, revisão ou autorização real foi inventado. A política canônica está vinculada aos hashes reais das Fases 237 e 238; as memórias continuam vazias e a prontidão permanece aguardando evidência real futura.

- política de revisão da Fase 248: `31614cc65f006a9c2505e4bbc3ab03871b2a77bd926d767756cba25489d41098`;
- memória de revisão da Fase 248: `abb7653a6d048ccaffc7433a4baa6a9f4caa6fe91c6ee84a4e18d4da4dbba881`;
- política de autorização da Fase 249: `54f7578031ee72b8adf864c761b5259741001de432119d78f084e33af0280e0d`;
- memória de autorização da Fase 249: `e44da39220429f801180c5df25814b60aecebf2c3bb2e40d00868bc099fb513a`.

## Validação

```bash
node --test tests/contracts/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization.test.mjs
npm run evolution:phase-249:assess
npm run evolution:phase-249:check
```

## Próxima fase

Fase 245 — `Controlled Proof Execution Following Subsequent Continuation Observation Review Authorization Consumption`: consumir internamente uma autorização válida exatamente uma vez, ainda sem executar a continuação nem liberar efeitos externos.
