# Fase 215 — Evidência de pacote autorizado

## Resultado

A fase adiciona um compromisso criptográfico independente para provar qual ZIP foi montado, por qual autorização e com qual inventário. O compromisso usa Ed25519, encadeia a memória de montagem e é persistido numa memória append-only própria.

## Proteções

- custodiante da evidência deve ser diferente do autorizador e do montador;
- ZIP, SHA-256, tamanho e inventário precisam coincidir exatamente com o recibo de montagem;
- recibo e memória de montagem são reinspecionados antes da assinatura;
- recibo, pacote, identificador e nonce não podem ser reutilizados;
- adulteração do compromisso, assinatura ou memória invalida a prova;
- build, publicação, deploy e promoção continuam desligados.

## Estado canônico

Não existem aprovadores, autorizadores, pacotes nem custodiantes reais cadastrados. Por isso a memória de evidências permanece vazia e nenhum ZIP foi gerado nesta fase. Os testes usam chaves e arquivos temporários apenas para provar o contrato.

## Comandos

```bash
npm run evolution:phase-215:assess
npm run evolution:phase-215:check
node --test tests/contracts/authorized-package-evidence-commitment.test.mjs
```

## Próximo gate

A fase 216 poderá avaliar uma decisão explícita de publicação somente quando houver aprovação, autorização, montagem e evidência independentes reais. A presença do compromisso, isoladamente, não publica nem faz deploy.
