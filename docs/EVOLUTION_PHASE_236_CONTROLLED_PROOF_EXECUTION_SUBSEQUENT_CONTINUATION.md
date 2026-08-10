# Fase 236 — Controlled Proof Execution Subsequent Continuation

## Objetivo

Consolidar o contrato interno que permite uma única continuação subsequente da prova controlada somente depois que a autorização de revisão tiver sido consumida, assinada e registrada corretamente pela Fase 235.

Esta fase não observa a continuação, não publica artefatos e não produz efeitos externos. Ela apenas define e verifica as condições necessárias para uma execução futura e controlada.

## Resultado implementado

- vínculo exato com a política e a memória de consumo da Fase 235;
- exigência de recibo de consumo válido, assinado e registrado;
- executor explícito, confiável, válido e independente dos atores anteriores;
- validade da autorização original conferida no instante da continuação;
- uso único por recibo de consumo;
- recibo de continuação subsequente assinado;
- memória append-only com vínculo atômico ao cabeçalho anterior;
- rejeição de repetição, adulteração, expiração e troca de identidade;
- observação posterior, publicação, rede, banco, build, deploy, empacotamento e promoção bloqueados.

## Estado canônico

O estado versionado permanece deliberadamente vazio:

- 0 executores reais cadastrados;
- 0 consumos de autorização registrados;
- 0 continuações subsequentes executadas;
- 0 recibos de continuação registrados;
- 0 efeitos externos.

O diagnóstico, portanto, informa `awaiting_recorded_signed_consumption_and_trusted_independent_executor`. Isso é um estado seguro e não representa falha operacional.

## Arquivos principais

- `lib/release/controlled-proof-execution-subsequent-continuation.mjs`: contrato, validações, execução interna e inspeção de recibos;
- `config/controlled-proof-execution-subsequent-continuation-policy.json`: política canônica;
- `config/controlled-proof-execution-subsequent-continuation-memory.json`: memória canônica vazia e íntegra;
- `config/evolution-phase-236-controlled-proof-execution-subsequent-continuation.json`: estado da fase no programa de evolução;
- `scripts/run-controlled-proof-execution-subsequent-continuation-phase-236.mjs`: diagnóstico executável sem efeitos;
- `scripts/check-evolution-phase-236.mjs`: gate integral da fase;
- `tests/contracts/controlled-proof-execution-subsequent-continuation.test.mjs`: provas positivas, negativas e de adulteração.

## Validação

```bash
npm run evolution:phase-236:assess
npm run evolution:phase-236:check
node --experimental-strip-types --test tests/contracts/controlled-proof-execution-subsequent-continuation.test.mjs
```

O gate da Fase 236 também revalida a Fase 235, garantindo que a continuação não seja desligada da cadeia de autorização e consumo que a originou.

## Limites de segurança

Durante a Fase 236 permanecem proibidos:

- acesso de rede;
- mutação de banco, autenticação ou RLS;
- geração de pacote;
- build;
- deploy;
- publicação externa;
- promoção de release;
- observação automática da continuação.

## Próxima fase

A Fase 237 — **Controlled Proof Execution Subsequent Continuation Observation** — deverá observar somente uma continuação subsequente já executada e registrada, mantendo todos os efeitos externos bloqueados.
