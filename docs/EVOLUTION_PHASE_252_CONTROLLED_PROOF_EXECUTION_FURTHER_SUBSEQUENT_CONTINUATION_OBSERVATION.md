# Fase 247 — Controlled Proof Execution Further Subsequent Continuation Observation

## Objetivo

Consolidar o contrato interno que observa a próxima continuação da prova controlada somente quando o recibo da Fase 246 estiver íntegro, assinado e previamente registrado na memória canônica.

Esta fase não revisa a observação, não publica artefatos e não produz efeitos externos. Ela apenas registra, de forma verificável, que uma próxima continuação já executada foi observada por um ator independente.

## Resultado implementado

- vínculo exato com a política, o recibo e a memória da Fase 246;
- vínculo somente aos hashes que efetivamente integram o recibo observado;
- exigência de próxima continuação válida, assinada e previamente registrada;
- observador explícito, confiável, ativo e independente de todos os atores encontrados na cadeia anterior;
- verificação Ed25519 do recibo original e do novo recibo de observação;
- janela máxima de 300 segundos entre a continuação e a observação;
- uma única observação por próxima continuação;
- memória append-only com vínculo atômico ao cabeçalho anterior;
- rejeição de repetição, adulteração, atraso, troca de identidade, colisão profunda de identidade e observação de evento não registrado;
- revisão posterior, publicação, rede, banco, build, deploy, empacotamento e promoção bloqueados.

## Correções preventivas do contrato

Durante a auditoria do molde anterior foram eliminadas três fontes de falsa aprovação:

1. a lista de hashes passou a validar somente campos realmente presentes no recibo da Fase 246;
2. a janela temporal foi alinhada ao instante real da continuação registrada;
3. a independência do observador passou a examinar toda a cadeia anterior, inclusive identidades aninhadas no histórico.

## Estado canônico

O estado versionado permanece deliberadamente vazio:

- 0 observadores reais cadastrados;
- 0 próximas continuações registradas;
- 0 observações registradas;
- 0 próximas continuações marcadas como observadas;
- 0 efeitos externos.

O diagnóstico, portanto, informa `awaiting_valid_recorded_next_subsequent_continuation_and_trusted_independent_observer`. Isso é um estado seguro e não representa falha operacional.

## Arquivos principais

- `lib/release/controlled-proof-execution-further-subsequent-continuation-observation.mjs`: contrato, validações, observação interna e inspeção dos recibos;
- `config/controlled-proof-execution-further-subsequent-continuation-observation-policy.json`: política canônica;
- `config/controlled-proof-execution-further-subsequent-continuation-observation-memory.json`: memória canônica vazia e íntegra;
- `config/evolution-phase-247-controlled-proof-execution-further-subsequent-continuation-observation.json`: estado da fase no programa de evolução;
- `scripts/run-controlled-proof-execution-further-subsequent-continuation-observation-phase-247.mjs`: diagnóstico executável sem efeitos;
- `scripts/check-evolution-phase-247.mjs`: gate integral da fase;
- `tests/contracts/controlled-proof-execution-further-subsequent-continuation-observation.test.mjs`: provas positivas, negativas e de adulteração.

## Validação

```bash
npm run evolution:phase-247:assess
npm run evolution:phase-247:check
node --test tests/contracts/controlled-proof-execution-further-subsequent-continuation-observation.test.mjs
```

O gate da Fase 247 também revalida a Fase 246, garantindo que a observação não seja desligada da continuação registrada que a originou.

## Limites de segurança

Durante a Fase 247 permanecem proibidos:

- acesso de rede;
- mutação de banco, autenticação ou RLS;
- geração de pacote;
- build;
- deploy;
- publicação externa;
- promoção de release;
- revisão automática da observação.

## Próxima fase

A Fase 248 — **Controlled Proof Execution Further Subsequent Continuation Observation Review** — deverá revisar internamente somente uma observação já assinada e registrada, mantendo todos os efeitos externos bloqueados.
