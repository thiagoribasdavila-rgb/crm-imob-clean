# Fase 223 — Controlled External Publication Execution Handoff

## Resultado

A cadeia de publicação ganhou um contrato canônico para preparar e registrar o repasse de uma autorização externa já consumida a um executor externo específico e independente.

Esta fase **não aceita a execução** e **não executa** publicação, chamada de rede, mutação de banco, geração de pacote, build, deploy ou promoção de release.

## Regras implementadas

- exige recibo de consumo válido, positivo e já registrado na memória da fase 222;
- vincula exatamente o recibo, a memória de consumo, o pacote e o inventário aprovados;
- exige emissor do handoff e executor externo distintos de todos os papéis anteriores;
- exige emissor do handoff e executor externo distintos entre si;
- assina o handoff com Ed25519 e o direciona a um único executor;
- limita a validade do handoff a no máximo cinco minutos;
- rejeita reutilização do mesmo consumo, `handoffId` ou nonce;
- registra o handoff em memória append-only vinculada atomicamente ao hash da cabeça anterior;
- mantém `executionAccepted`, `externalPublicationExecuted`, `buildExecuted`, `deployExecuted` e `releasePromoted` como `false`.

## Estado canônico

O estado versionado permanece vazio e seguro:

- nenhum emissor real configurado;
- nenhum executor externo real configurado;
- nenhum consumo real registrado;
- nenhum handoff real registrado;
- nenhuma credencial, endpoint ou URL externa armazenada;
- nenhum efeito externo executado.

## Verificação

```bash
npm run evolution:phase-223:assess
npm run evolution:phase-223:check
node --test tests/contracts/controlled-external-publication-execution-handoff.test.mjs
```

## Próxima fase

A fase 224 poderá definir a aceitação ou rejeição assinada do handoff pelo executor direcionado. Essa aceitação continuará separada da execução efetiva e não autorizará automaticamente publicação, rede, build, deploy ou promoção.
