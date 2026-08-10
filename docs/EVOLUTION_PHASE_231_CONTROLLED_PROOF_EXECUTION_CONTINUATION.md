# Fase 231 — Continuação da prova controlada

## Resultado

A Fase 231 implementa a execução interna de uma única continuação previamente autorizada da prova controlada. A continuação exige autorização íntegra, registrada, válida, ainda não consumida e vinculada ao mesmo executor externo autorizado no início da cadeia.

Nenhum executor real ou evento operacional foi criado no estado canônico. As memórias oficiais permanecem vazias até que evidências válidas sejam fornecidas por um fluxo externo autorizado.

## Contrato implementado

- exige autorização de continuação já registrada na memória append-only da Fase 230;
- verifica a assinatura Ed25519 da autorização antes da continuação;
- vincula exatamente autorização, observação, início, executor, pacote e inventário;
- exige a mesma identidade e chave pública do executor externo autorizado no início;
- rejeita autorização expirada, não registrada, adulterada ou já consumida;
- permite uma única continuação por autorização;
- assina o recibo de continuação com a chave do executor vinculado;
- registra o recibo em memória append-only com vínculo atômico ao head anterior;
- detecta replay, divergência de executor, chave privada incompatível e adulteração da memória;
- preserva a rastreabilidade integral das Fases 227 a 231.

## O que permanece bloqueado

- acesso à rede;
- mutação de banco, Auth ou RLS;
- publicação interna ou externa;
- geração de pacote;
- build;
- deploy;
- promoção de release.

## Estado canônico

- executores de continuação confiáveis: `0`;
- autorizações de continuação registradas: `0`;
- continuações registradas: `0`;
- autorizações consumidas: `0`;
- continuação executada: `false`;
- homologação de runtime: `false`.

Hashes canônicos:

- política: `0935c92bc9edfa178300d6128151294d6cc36ec94a86da7a6c79e9e6d6fa4fc0`;
- memória vazia: `c9bc2f79d403507b0149a869f096e66251cd57f0b541cfbb99992dd3ec86fc84`.

## Validação

```bash
npm run evolution:phase-231:assess
npm run evolution:phase-231:check
node --test --test-reporter=dot tests/contracts/controlled-proof-execution-continuation.test.mjs
```

A validação integral inclui a regressão de toda a suíte, lint, typecheck, governança e varredura de segredos. A política do programa continua proibindo build fora do fechamento de release.

## Próxima fase

A Fase 232 poderá observar uma continuação realmente registrada, usando um observador independente e uma nova memória append-only. Rede, banco, publicação, pacote, build, deploy e promoção continuarão bloqueados.
