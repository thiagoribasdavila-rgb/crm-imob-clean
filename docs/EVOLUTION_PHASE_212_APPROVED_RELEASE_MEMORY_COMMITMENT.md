# Fase 212 — Approved Release Memory Commitment

## Objetivo

Preparar uma memória de release imutável e auditável que aceite exclusivamente uma decisão final `approved`, válida, assinada e vinculada à composição e à adjudicação exatas.

## Estado canônico

A memória permanece vazia. A política final atual não possui aprovador confiável configurado e não existe uma decisão final verificada. Registrar uma aprovação nessas condições seria fabricar evidência.

- composição: `conversion-core-candidate`;
- aprovações comprometidas: `0`;
- pacote gerado: não;
- deploy executado: não;
- release promovida: não.

## Garantias implementadas

- vínculo exato com a política e a decisão final;
- aceite exclusivo de resultado `approved` com gates aceitos;
- janela máxima de compromisso de 30 minutos;
- ledger append-only com sequência e cadeia de hashes;
- rejeição de hash de decisão, ID de aprovação e nonce duplicados;
- detecção de adulteração da entrada, resumo e memória;
- nenhuma geração automática de pacote, deploy ou promoção.

## Fluxo seguro

1. A fase 211 produz uma decisão final assinada e verificável.
2. A fase 212 revalida toda a cadeia de evidências.
3. Somente uma aprovação válida é anexada à memória.
4. O registro mantém os efeitos externos desligados.

## Validação

```bash
npm run evolution:phase-212:assess
npm run evolution:phase-212:check
node --test tests/contracts/approved-release-memory-commitment.test.mjs
```

Esta fase não altera banco, Auth, RLS, ambiente externo, memória de produção ou artefatos de implantação.
