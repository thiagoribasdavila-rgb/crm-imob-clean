# ATLAS AI OS — Fase 27/100

## Objetivo

Preparar o contrato do ledger atômico que, no futuro, impedirá uma mesma permissão manual de ser reservada ou consumida mais de uma vez.

Esta fase usa **somente em memória** um ensaio determinístico com duas tentativas sobre a mesma identidade. Ela não conecta banco, não cria tabela, não executa migration e não grava estado oficial.

## Problema resolvido

Uma permissão curta e de uso único ainda poderia ser acionada duas vezes por concorrência, clique repetido, reprocessamento ou reinício. O contrato agora exige:

- identidade composta por fingerprints do contrato, nonce, idempotência, evento e registro sintético;
- estratégia `compare-and-set` com revisão esperada `0` e proposta `1`;
- exatamente um vencedor;
- rejeição da segunda reserva;
- consumo atômico antes de qualquer ação futura;
- trilha futura append-only;
- falha fechada diante de colisão, revisão divergente ou fonte vencida.

## Ensaio local

O simulador executa duas tentativas sequenciais equivalentes a uma disputa pelo mesmo registro:

1. primeira tentativa: aceita apenas na revisão `0`;
2. segunda tentativa: rejeitada como duplicada;
3. vencedor esperado: `1`;
4. rejeição duplicada esperada: `1`.

O resultado prova apenas a regra local. Não é evidência de persistência transacional no Supabase ou em produção.

## Limites desta fase

- ledger oficial: **não persistido**;
- tabela ou migration: **não criada**;
- contrato oficial da Fase 26: **não fornecido**;
- permissão: **não emitida e não consumida**;
- evento Meta de teste ou real: **não enviado**;
- rede e banco remoto: **não acessados**;
- campanha, orçamento e público: **inalterados**;
- build: **não executado**;
- deploy: **não executado**;
- produção: **bloqueada**.

## Artefatos

- `config/meta-repeatability-sample-02-atomic-ledger-gate.json`
- `config/fixtures/meta-repeatability-sample-02-atomic-ledger-request-template.json`
- `config/fixtures/meta-repeatability-sample-02-atomic-ledger-template.json`
- `scripts/preflight-meta-repeatability-sample-02-atomic-ledger.mjs`
- `scripts/run-meta-repeatability-sample-02-atomic-ledger.mjs`
- `scripts/audit-meta-repeatability-sample-02-atomic-ledger.mjs`
- `config/meta-intelligence-phase-027.json`

## Próxima fase

A Fase 28 deve preparar o adaptador transacional durável do ledger para banco e a migration reversível correspondente, ainda sem executá-la, sem persistir reserva, sem emitir permissão e sem transmitir evento.
