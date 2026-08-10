# Fase 224 — Controlled External Publication Execution Acceptance

## Resultado

A cadeia de publicação ganhou um contrato canônico para o executor externo direcionado aceitar ou rejeitar formalmente um handoff já registrado.

Esta fase **não concede permissão para executar publicação** e **não executa** chamada de rede, mutação de banco, geração de pacote, build, deploy ou promoção de release.

## Regras implementadas

- exige handoff válido, ainda vigente e já registrado na memória da fase 223;
- aceita decisão terminal `accepted` ou `rejected` somente do executor indicado no handoff;
- vincula exatamente o recibo e a memória do handoff, o pacote e o inventário aprovados;
- assina o recibo de decisão com Ed25519 usando a identidade do executor direcionado;
- limita a decisão à validade do handoff e a no máximo cinco minutos da emissão;
- rejeita segunda decisão para o mesmo handoff, `acceptanceId` ou nonce;
- registra a decisão em memória append-only vinculada atomicamente ao hash da cabeça anterior;
- mantém `publicationExecutionPermitted`, `externalPublicationExecuted`, `buildExecuted`, `deployExecuted` e `releasePromoted` como `false`.

## Estado canônico

O estado versionado permanece vazio e seguro:

- nenhum executor externo real configurado;
- nenhum handoff real registrado;
- nenhuma aceitação ou rejeição real registrada;
- nenhuma credencial, endpoint ou URL externa armazenada;
- nenhuma permissão de execução concedida;
- nenhum efeito externo executado.

## Verificação

```bash
npm run evolution:phase-224:assess
npm run evolution:phase-224:check
node --test --test-reporter=dot tests/contracts/controlled-external-publication-execution-acceptance.test.mjs
```

## Próxima fase

A fase 225 poderá emitir uma permissão de execução assinada e de uso único somente a partir de uma aceitação registrada. A emissão continuará separada da execução efetiva e não publicará, acessará rede, gerará pacote, executará build, deploy ou promoção.
