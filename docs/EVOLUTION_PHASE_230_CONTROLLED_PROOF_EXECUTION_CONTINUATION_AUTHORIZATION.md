# Fase 230 — Autorização de continuação da prova controlada

## Resultado

A Fase 230 adiciona a autorização interna, assinada, curta e de uso único necessária antes de qualquer continuação da prova controlada. Ela não continua a prova e não executa efeitos externos.

O estado canônico permanece deliberadamente vazio: não existe observação operacional registrada nem autorizador real configurado. A prontidão só muda quando ambos forem fornecidos por evidência válida, sem inventar identidade, chave ou execução.

## Contrato implementado

- exige recibo de observação já registrado e íntegro;
- vincula exatamente observação, memória, início, executor, pacote e inventário;
- verifica a assinatura da observação antes de autorizar;
- exige autorizador Ed25519 confiável, ativo e independente do autorizador inicial, executor e observador;
- limita a emissão a 300 segundos após a observação;
- limita a validade da autorização a 300 segundos;
- permite uma única continuação por autorização;
- registra a autorização em memória append-only com vínculo atômico ao head anterior;
- rejeita reutilização da observação, id ou nonce;
- detecta adulteração de política, autorização e memória.

## O que permanece bloqueado

- continuação da prova controlada;
- acesso à rede;
- mutação de banco, Auth ou RLS;
- publicação interna ou externa;
- geração de pacote;
- build;
- deploy;
- promoção de release.

## Estado canônico

- autorizadores de continuação confiáveis: `0`;
- observações registradas: `0`;
- autorizações de continuação registradas: `0`;
- continuação executada: `false`;
- homologação de runtime: `false`.

## Validação

```bash
npm run evolution:phase-230:assess
npm run evolution:phase-230:check
node --test --test-reporter=dot tests/contracts/controlled-proof-execution-continuation-authorization.test.mjs
```

O fechamento integral também executa testes contratuais, lint, typecheck e as verificações de segredos e governança. A política do programa continua proibindo build fora do fechamento de release.

## Próxima fase

A Fase 231 poderá consumir exatamente uma autorização válida e registrar uma continuação interna. Mesmo nessa próxima etapa, rede, banco, publicação, pacote, build, deploy e promoção continuarão bloqueados.
