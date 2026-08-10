# Fase 237 — Controlled Proof Execution Subsequent Continuation Observation

## Objetivo

Consolidar o contrato interno que observa uma continuação subsequente da prova controlada somente quando o recibo da Fase 236 estiver íntegro, assinado e previamente registrado na memória canônica.

Esta fase não revisa a observação, não publica artefatos e não produz efeitos externos. Ela apenas registra, de forma verificável, que uma continuação subsequente já executada foi observada por um ator independente.

## Resultado implementado

- vínculo exato com a política, o recibo e a memória da Fase 236;
- exigência de continuação subsequente válida, assinada e previamente registrada;
- observador explícito, confiável, ativo e independente dos atores da cadeia anterior;
- verificação Ed25519 do recibo original e do novo recibo de observação;
- janela máxima de 300 segundos entre a continuação e a observação;
- uma única observação por continuação subsequente;
- memória append-only com vínculo atômico ao cabeçalho anterior;
- rejeição de repetição, adulteração, atraso, troca de identidade e observação de evento não registrado;
- revisão posterior, publicação, rede, banco, build, deploy, empacotamento e promoção bloqueados.

## Estado canônico

O estado versionado permanece deliberadamente vazio:

- 0 observadores reais cadastrados;
- 0 continuações subsequentes registradas;
- 0 observações registradas;
- 0 continuações marcadas como observadas;
- 0 efeitos externos.

O diagnóstico, portanto, informa `awaiting_valid_recorded_subsequent_continuation_and_trusted_independent_observer`. Isso é um estado seguro e não representa falha operacional.

## Arquivos principais

- `lib/release/controlled-proof-execution-subsequent-continuation-observation.mjs`: contrato, validações, observação interna e inspeção dos recibos;
- `config/controlled-proof-execution-subsequent-continuation-observation-policy.json`: política canônica;
- `config/controlled-proof-execution-subsequent-continuation-observation-memory.json`: memória canônica vazia e íntegra;
- `config/evolution-phase-237-controlled-proof-execution-subsequent-continuation-observation.json`: estado da fase no programa de evolução;
- `scripts/run-controlled-proof-execution-subsequent-continuation-observation-phase-237.mjs`: diagnóstico executável sem efeitos;
- `scripts/check-evolution-phase-237.mjs`: gate integral da fase;
- `tests/contracts/controlled-proof-execution-subsequent-continuation-observation.test.mjs`: provas positivas, negativas e de adulteração.

## Validação

```bash
npm run evolution:phase-237:assess
npm run evolution:phase-237:check
node --test tests/contracts/controlled-proof-execution-subsequent-continuation-observation.test.mjs
```

O gate da Fase 237 também revalida a Fase 236, garantindo que a observação não seja desligada da continuação registrada que a originou.

## Limites de segurança

Durante a Fase 237 permanecem proibidos:

- acesso de rede;
- mutação de banco, autenticação ou RLS;
- geração de pacote;
- build;
- deploy;
- publicação externa;
- promoção de release;
- revisão automática da observação.

## Próxima fase

A Fase 238 — **Controlled Proof Execution Subsequent Continuation Observation Review** — deverá revisar internamente somente uma observação já assinada e registrada, mantendo todos os efeitos externos bloqueados.
