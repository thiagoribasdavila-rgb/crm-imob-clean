# Fase 251 — Controlled Proof Execution Further Subsequent Continuation

## Objetivo

Permitir exatamente uma próxima continuação interna a partir de um consumo de autorização válido, assinado e já registrado pela Fase 240. A fase não publica, não gera pacote, não executa build, não faz deploy e não altera banco, autenticação ou RLS.

## Estado canônico

- consumidores de autorização registrados na Fase 240: `0`;
- executores confiáveis configurados: `0`;
- próximas continuações registradas: `0`;
- autorizações consumidas pela próxima continuação: `0`;
- continuação executada: `false`;
- continuação observada: `false`;
- todos os efeitos externos: `false`.

O estado vazio é intencional. Nenhum recibo, executor ou execução real foi inventado para avançar a fase.

## Contrato de segurança

Uma continuação só é aceita quando:

1. o consumo de autorização consta na memória canônica da Fase 240;
2. recibo, policy, memória, revisão, observações e continuações anteriores mantêm seus hashes exatos;
3. o executor possui papel, chave e janela de validade compatíveis;
4. o executor é independente dos atores anteriores exigidos pelo contrato;
5. a autorização ainda está válida no momento da continuação;
6. o consumo ainda não foi usado por outra próxima continuação;
7. o novo recibo é assinado com Ed25519 e anexado de forma atômica à memória append-only.

Reutilização, adulteração, expiração, chave divergente, executor não confiável ou quebra do head da memória são rejeitados.

## Artefatos

- `lib/release/controlled-proof-execution-further-subsequent-continuation.mjs`
- `config/controlled-proof-execution-further-subsequent-continuation-policy.json`
- `config/controlled-proof-execution-further-subsequent-continuation-memory.json`
- `config/evolution-phase-251-controlled-proof-execution-further-subsequent-continuation.json`
- `scripts/run-controlled-proof-execution-further-subsequent-continuation-phase-251.mjs`
- `scripts/check-evolution-phase-251.mjs`
- `tests/contracts/controlled-proof-execution-further-subsequent-continuation.test.mjs`

## Validação

```bash
npm run evolution:phase-251:assess
npm run evolution:phase-251:check
node --test tests/contracts/controlled-proof-execution-further-subsequent-continuation.test.mjs
npm test
npm run typecheck
npm run lint
```

Build, ZIP, deploy e mutações externas não pertencem ao escopo desta fase.
