# ÍNDICE DA ENTREGA — ATLAS ONE

**2026-07-31.** Onde está cada coisa, e o que ela responde.

## COMECE POR AQUI

| se você quer… | leia |
|---|---|
| saber se está aprovado | `SCORECARD_FINAL_ATLAS_ONE.md` — **veredito: REPROVADO, média 78,6** |
| instalar na Hostinger | `HOSTINGER_DEPLOY.md` → `HOSTINGER_ENV_CHECKLIST.md` → `HOSTINGER_POST_DEPLOY_CHECKLIST.md` |
| saber o que **não** funciona | `LISTA_DE_LIMITACOES_CONHECIDAS.md` |
| saber o que depende de você | `BLOQUEIOS_EXTERNOS.md` |
| conferir o pacote | `RELATORIO_VALIDACAO_ZIP.md` |

## AS MEDIÇÕES

| documento | o número principal |
|---|---|
| `RELATORIO_PERFORMANCE.md` | LCP **2.712 / 3.472 / 4.080 ms** — as 3 rotas reprovam |
| `RELATORIO_RESPONSIVIDADE.md` | 0 overflow em 3 viewports · **104 alvos < 24 px** |
| `RELATORIO_ACESSIBILIDADE.md` | 786 `aria-*` · 0 `<img>` sem `alt` · WCAG 2.5.8 **reprovado** |
| `RELATORIO_SEGURANCA.md` | 0 segredos · **12 vulnerabilidades, 9 altas** |
| `RELATORIO_TESTES.md` | 1.196 executados · **9 pulados**, nomeados |
| `RELATORIO_E2E.md` | **não executado** — Playwright ausente |
| `RELATORIO_DESIGN_SYSTEM.md` | **1.359 cores cravadas** em 80 arquivos |
| `AUDITORIA_DE_CONSISTENCIA_FINAL.md` | **0 componentes duplicados** |

## OPERAÇÃO

`MIGRATION_PLAN.md` — 180 migrations, drift real **0**, e por que `db push` está fora
`docs/continuity/ROLLBACK_PLAN.md` — reversão
`INTEGRATIONS_CHECKLIST.md` — estado de cada integração

## A SESSÃO

`CHANGELOG_FINAL.md` · `RELEASE_NOTES_v1.0.0.md` ·
`docs/auditoria/INDICADORES_OFICIAIS.md` (**fonte única de números**) ·
`docs/auditoria/REGISTRO_FALSOS_POSITIVOS.md` (**7 registrados**) ·
`docs/auditoria/DECISION_LOG.md`

## O QUE NÃO FOI FEITO

`RELATORIO_DE_TESTE_COM_USUARIOS.md` e `RELATORIO_E2E.md` dizem **NÃO EXECUTADO**
na primeira linha. Estão aqui porque a ausência declarada é informação; a ausência
silenciosa é armadilha.
