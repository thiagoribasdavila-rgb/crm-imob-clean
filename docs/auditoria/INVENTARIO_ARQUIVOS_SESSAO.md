# INVENTÁRIO DOS ARQUIVOS DESTA SESSÃO

**Base:** `17db153e` → `6df3465b`. Gerado por `git diff --numstat`.

```
 71 files changed, 15564 insertions(+), 32 deletions(-)
```

## ARQUIVOS CRIADOS

| arquivo | linhas | categoria |
|---|---:|---|
| `app/api/v1/analytics/projecao-realizado/route.ts` | 138 | rota/página |
| `app/api/v1/atlas/gemeo-digital/route.ts` | 275 | rota/página |
| `app/api/v1/crm/acervo/route.ts` | 251 | rota/página |
| `app/api/v1/finops/cost-center/route.ts` | 371 | rota/página |
| `components/atlas/CentroDeCustoTecnologico.tsx` | 339 | outro |
| `config/migrations-equivalencias.json` | 32 | configuração |
| `docs/DIAGNOSTICO_DRIFT_MIGRATIONS.md` | 142 | documentação |
| `docs/DIAGNOSTICO_FILA_E_META.md` | 225 | documentação |
| `docs/FASE_3_ARQUITETURA.md` | 211 | documentação |
| `docs/FASE_3_BUSINESS_CASE.md` | 225 | documentação |
| `docs/FASE_3_CUSTOS.md` | 228 | documentação |
| `docs/FASE_3_RISCOS.md` | 326 | documentação |
| `docs/FASE_3_ROADMAP.md` | 250 | documentação |
| `docs/FASE_3_ROI.md` | 197 | documentação |
| `docs/MATRIZ_MIGRATIONS_REPO_BANCO.md` | 113 | documentação |
| `docs/REVISAO_MODULOS_DE_IA.md` | 105 | documentação |
| `lib/ai/modo-sombra.ts` | 278 | módulo |
| `lib/ai/niveis-de-autonomia.ts` | 307 | módulo |
| `lib/ai/previsao-aritmetica.ts` | 375 | módulo |
| `lib/ai/registro-de-modelos.ts` | 582 | módulo |
| `lib/ai/registro-de-sombra.ts` | 157 | módulo |
| `lib/atlas/gemeo-digital.ts` | 992 | módulo |
| `lib/crm/grafo-de-receita.ts` | 387 | módulo |
| `lib/deploy/autorizacao-de-instalacao.ts` | 119 | módulo |
| `lib/finops/catalogo-de-custo.ts` | 137 | módulo |
| `lib/finops/centro-de-custo.ts` | 752 | módulo |
| `lib/integrations/estado-da-prontidao.ts` | 154 | módulo |
| `lib/integrations/estado-de-credencial.ts` | 246 | módulo |
| `scripts/gera-crontab-dos-workers.mjs` | 99 | script/prova |
| `scripts/instala-crontab-no-servidor.mjs` | 149 | script/prova |
| `scripts/lib/cc23-regiao.mjs` | 140 | script/prova |
| `scripts/lib/migracoes-sem-sql.mjs` | 178 | script/prova |
| `scripts/prova-do-ledger-de-projecao.mjs` | 227 | script/prova |
| `scripts/prova-fila-e-agendador.mjs` | 186 | script/prova |
| `scripts/prova-orcamento-e-fallback.mjs` | 237 | script/prova |
| `scripts/prova-relogio-do-lease.mjs` | 161 | script/prova |
| `supabase/declaracoes-sem-sql.json` | 14 | outro |
| `supabase/migrations/20260730010000_oferta_ativa_do_acervo_de_resgate.sql` | 594 | migration |
| `supabase/migrations/20260730030000_geolocalizacao_inicial_postgis.sql` | 789 | migration |
| `supabase/migrations/20260730060000_finops_uso_de_infra.sql` | 96 | migration |
| `supabase/migrations/20260731040000_reivindicacao_atomica_da_fila.sql` | 120 | migration |
| `supabase/migrations/20260731050000_auxiliares_e_fronteira_do_relogio.sql` | 185 | migration |
| `supabase/rollbacks/20260730010000_oferta_ativa_do_acervo_de_resgate.down.sql` | 90 | outro |
| `supabase/rollbacks/20260730030000_geolocalizacao_inicial_postgis.down.sql` | 86 | outro |
| `supabase/rollbacks/20260730050000_orcamento_e_autonomia_da_ia.down.sql` | 39 | outro |
| `supabase/rollbacks/20260730060000_finops_uso_de_infra.down.sql` | 27 | outro |
| `supabase/rollbacks/20260730100000_grafo_de_oportunidade_de_receita.down.sql` | 55 | outro |
| `tests/contracts/autorizacao-de-instalacao.test.mjs` | 116 | teste |
| `tests/contracts/centro-de-custo-tecnologico.test.mjs` | 688 | teste |
| `tests/contracts/estado-da-prontidao.test.mjs` | 149 | teste |
| `tests/contracts/gemeo-digital.test.mjs` | 580 | teste |
| `tests/contracts/migration-vazia-mente.test.mjs` | 290 | teste |
| `tests/contracts/modo-sombra.test.mjs` | 227 | teste |
| `tests/contracts/niveis-de-autonomia.test.mjs` | 244 | teste |
| `tests/contracts/previsao-aritmetica.test.mjs` | 306 | teste |
| `tests/contracts/regiao-do-cc23.test.mjs` | 171 | teste |
| `tests/contracts/registro-de-modelos.test.mjs` | 340 | teste |
| `tests/contracts/rls-em-tabela-nova.test.mjs` | 451 | teste |
| `tests/contracts/troca-de-senha-nao-e-silenciosa.test.mjs` | 128 | teste |
| `tests/contracts/uma-pergunta-por-vez.test.mjs` | 231 | teste |

## ARQUIVOS MODIFICADOS

| arquivo | +linhas | −linhas |
|---|---:|---:|
| `app/api/v1/ready/route.ts` | 90 | 8 |
| `app/api/v2/outbox/process/route.ts` | 90 | 12 |
| `docs/ATLAS_ONE_SOURCE_OF_TRUTH.md` | 11 | 0 |
| `docs/AUDITORIA_FINAL.md` | 25 | 1 |
| `lib/integrations/outbox-lease.ts` | 17 | 8 |
| `next.config.ts` | 1 | 0 |
| `package.json` | 3 | 0 |
| `scripts/build.mjs` | 10 | 0 |
| `scripts/check-commit-publicado.mjs` | 10 | 1 |
| `tests/contracts/projeto-canonico.test.mjs` | 0 | 1 |
| `tests/contracts/venda-sem-valor.test.mjs` | 0 | 1 |

## POR CATEGORIA

| categoria | arquivos | linhas |
|---|---:|---:|
| módulos | 13 | 4503 |
| testes | 15 | 3921 |
| documentação | 12 | 2058 |
| migrations | 5 | 1784 |
| scripts e provas | 10 | 1397 |
| rotas e páginas | 6 | 1215 |
| outros | 9 | 654 |
| configuração | 1 | 32 |

## VERIFICAÇÕES

| verificação | resultado |
|---|---|
| artefatos gerados | **0** |
| segredos no diff | **0** |
| `security:secrets` | PASSED — 2540 arquivos, 0 credenciais |
| árvore de trabalho | 0 pendências |
| commits sem publicar | 0 |
