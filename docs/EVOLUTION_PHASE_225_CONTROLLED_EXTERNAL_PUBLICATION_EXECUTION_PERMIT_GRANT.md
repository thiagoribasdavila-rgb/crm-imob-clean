# Fase 225 — Controlled External Publication Execution Permit Grant

## Resultado

A cadeia de publicação ganhou um contrato canônico para conceder uma permissão de execução curta, assinada e de uso único somente após uma aceitação válida já estar registrada.

Esta fase **não consome a permissão**, **não concede publicação ao estado canônico vazio** e **não executa** chamada de rede, mutação de banco, geração de pacote, build, deploy ou promoção de release.

## Regras implementadas

- exige aceitação `accepted`, válida e registrada na memória da fase 224;
- vincula exatamente recibo e memória da aceitação, handoff, pacote e inventário aprovados;
- exige concedente confiável e independente do executor externo;
- assina a permissão com Ed25519 e verifica que a chave privada corresponde ao concedente;
- limita a concessão a no máximo cinco minutos após a aceitação;
- limita a validade da permissão a dois minutos e nunca além da validade do handoff;
- rejeita nova permissão para a mesma aceitação, `permitId` ou nonce;
- registra a permissão em memória append-only vinculada atomicamente ao hash da cabeça anterior;
- marca a permissão emitida como `singleUse: true`, `maximumUses: 1`, `remainingUses: 1` e `permitConsumed: false`;
- mantém `externalPublicationExecuted`, `packageGenerated`, `buildExecuted`, `deployExecuted` e `releasePromoted` como `false`.

## Estado canônico

O estado versionado permanece vazio e seguro:

- nenhum executor externo real configurado;
- nenhum concedente de permissão real configurado;
- nenhum handoff ou aceite real registrado;
- nenhuma permissão real emitida ou consumida;
- nenhuma credencial, endpoint ou URL externa armazenada;
- nenhum efeito externo executado.

## Verificação

```bash
npm run evolution:phase-225:assess
npm run evolution:phase-225:check
node --test --test-reporter=dot tests/contracts/controlled-external-publication-execution-permit-grant.test.mjs
```

## Próxima fase

A fase 226 poderá consumir atomicamente uma permissão registrada, vigente e de uso único. O consumo continuará separado da publicação efetiva e não publicará, acessará rede, gerará pacote, executará build, deploy ou promoção.
