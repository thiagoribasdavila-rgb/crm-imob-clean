# TEST_RESULTS — execução real, 2026-07-24

Todos os números abaixo foram **reexecutados nesta sessão**. Nada foi herdado do registro anterior.

## Correção do registro anterior

O screenshot da sessão interrompida dizia "~53 testes passando". **Confirmado como verdadeiro
naquele momento** — a reexecução no estado `b3d268df` deu exatamente 53/53. Depois da importação
seletiva dos contratos do pacote Atlas One e da nova suíte do scanner, o total passou a **69**.

## Resultado final

| suíte | comando | testes | passaram | falharam | ignorados |
|---|---|---|---|---|---|
| unitária | `npm run test:unit` (`node --test "tests/*.test.ts"`) | 53 | **53** | 0 | 0 |
| contratos | `npm run test:contracts` | 16 | **16** | 0 | 0 |
| **total** | `npm test` | **69** | **69** | **0** | **0** |

- 9 suítes na unitária, 0 canceladas, 0 `todo`.
- Novos testes nesta execução: 7 (suíte do scanner de segredos). Acumulado da unificação: 16. Removidos: 0.
- Motivo da diferença 53 → 69: importação de `tests/contracts/{safe-redirect,legacy-v2-compat}.test.mjs` (9) + a suíte nova `tests/contracts/secret-scan.test.mjs` (7).

## Portões de qualidade

| portão | comando | resultado |
|---|---|---|
| typecheck | `tsc --noEmit` | **exit 0** |
| lint | `eslint . --max-warnings=0` | **exit 0** |
| build produção | `npm run build` | **exit 0** |
| fundação CC23 | `npm run cc23:check` | **30/30** |
| fundação layout claro | `npm run light-layout:check` | **✅** |
| release Hostinger fase 100 | `node scripts/check-final-hostinger-release.mjs` | **18 controles ✅** |
| regressão do pacote | `node scripts/check-final-regression-package.mjs` | **23 controles ✅** |
| deploy | `npm run validate-deploy:check` | **exit 0** |
| contraste WCAG (27 pares) | script próprio | **0 reprovações AA** |

## Regressão encontrada e corrigida dentro da própria sessão

`cc23:check` passou de **30/30 → 27/30** depois do commit `0e963a82` (minha entrega) e voltou a
**30/30** com `916c609a`. Encontrada por auto-auditoria — o check não faz parte de `npm test`
nem do build, então só apareceu porque foi executado deliberadamente após o commit.

**Lição registrada:** `npm test`, `tsc`, `eslint` e `build` passando **não** significam que os
portões de design passaram. Os `*:check` são um conjunto separado e precisam ser rodados
explicitamente. Ver KNOWN_RISKS (R-04).

## Cadeia `validate` completa (executada nesta sessão)

Pela primeira vez a cadeia avançou além do primeiro passo: **64 de 80 portões verdes**
(eram 56 antes). Os 16 vermelhos estão categorizados em `CURRENT_STATE.md` — 12 dependem de
migrations não aplicadas no banco vivo.

## O que não foi executado

- Testes E2E (Playwright) — não existem no repo; os 2 specs do ZIP exigiriam instalar
  `@playwright/test`, o que a instrução desta etapa proíbe sem necessidade comprovada.
- Testes de banco (`supabase/tests/database/*.sql` do ZIP) — exigiriam conexão e schema;
  bloqueados pelo gatilho de parada.
- Captura de tela dos temas — sem navegador headless disponível.
