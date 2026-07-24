# MERGE_MATRIX — repo canônico × pacote Atlas One

Data: 2026-07-24 · Base canônica: `/Users/thiagoribasdavila/atlas-v3`
Fonte seletiva: `ATLAS_ONE_FINAL_OPERACIONAL.zip` (nunca base, nunca importação em massa)

## Método de decisão

Ordem de prioridade aplicada (não data, não tamanho, não nome):
comportamento testado > correção comprovada > implementação mais completa **sem remover
funcionalidade existente** > menor risco de regressão > consistência arquitetural.

Linhagem determinada por hash de conteúdo contra toda a história do Git — ver
`NEW_ZIP_INVENTORY.md`. Classificação feita por três análises independentes cobrindo
`app/` (64), `scripts/`+`config/` (64) e `components/`+`lib/`+`docs/`+raiz (39),
com verificação manual dos itens que viraram alteração de código.

## Veredito quantitativo

| classificação | qtd | ação |
|---|---|---|
| IDÊNTICO (herdado de ancestral comum) | 1.087 | nenhuma |
| EXCLUSIVO DO REPO | 979 | preservado integralmente |
| EXCLUSIVO DO ZIP | 999 | não importado em massa; 2 importados (testes de contrato) |
| CONFLITO — REPO MANTÉM | 118 | repo permanece; ZIP descartado com justificativa |
| CONFLITO — IMPORT PONTUAL | 8 aplicados | 4 na 1ª rodada + 4 scripts classe A; ver MERGE_DECISION_LOG.md |
| CONFLITO MANUAL GRANDE | 21 | **resolvidos** — classificados A–F, ver seção adiante |
| FORMATAÇÃO | 4 | ignorado (sem valor funcional) |
| ARTEFATO GERADO | 8 | nunca copiar (`app/generated/prisma/**`) |
| ARTEFATO DE INSTALAÇÃO | 6 | fora do escopo do repo |
| DUPLICAÇÃO SEMÂNTICA | 43 | rejeitado (`components/crm/*`, `lib/ai/*`, `lib/analytics/*`) |
| BLOQUEADO POR AUTORIZAÇÃO | 22 | `supabase/**` — gatilho de parada |

## Os 3 conflitos de 3 camadas (workspace × ZIP × HEAD)

### 1. `app/(crm)/pipeline/page.tsx`

| campo | conteúdo |
|---|---|
| WORKSPACE | 865 linhas — HEAD + bloco "Kanban de execução" (a unidade interrompida) |
| NOVO ZIP | 3.392 linhas — reescrita completa com radar de gargalos e lentes por papel |
| ÚLTIMO COMMIT | 821 linhas (`b3d268df`) |
| DIFERENÇA | O ZIP **remove toda a governança de descarte**: `DISCARD_REASONS`, `DiscardDraft`, `DiscardReportSummary`, `DiscardReportStatus` |
| VERSÃO RECOMENDADA | **WORKSPACE** |
| PRESERVAR | bloco de prontidão + microcopy + a taxonomia de descarte alinhada ao lead quality da Meta |
| DESCARTAR | reescrita do ZIP inteira |
| CONFLITO | sim, resolvido |
| DECISÃO | repo mantém; nada importado |
| JUSTIFICATIVA | A cadeia Meta×Andromeda depende do descarte estruturado; adotar o ZIP apagaria uma entrega commitada e o elo de atribuição até a venda. Critério "não remove funcionalidade" é decisivo. |
| TESTE | `light-layout:check` ✅ · build ✅ |
| RISCO | baixo |
| ROLLBACK | `git revert 0e963a82` |

### 2. `app/globals.css`

| campo | conteúdo |
|---|---|
| WORKSPACE | 8.352 linhas — HEAD + camada clara do shell/Kanban |
| NOVO ZIP | 14.471 linhas — camada V30/kanban própria |
| ÚLTIMO COMMIT | 8.107 linhas |
| DIFERENÇA | 9.845 linhas divergentes. O ZIP **remove o reparo CC23 dos semânticos do shadcn** e **não tem tema claro** (`data-theme="light"`: 71 ocorrências no repo, **0** no ZIP). O ZIP também apaga as classes `cc6-*`, das quais 42 arquivos do repo dependem. |
| VERSÃO RECOMENDADA | **WORKSPACE** |
| PRESERVAR | reparo CC23, tema claro inteiro, camada `cc6-*` |
| DESCARTAR | camada V30 do ZIP |
| CONFLITO | sim, resolvido |
| DECISÃO | repo mantém; nada importado |
| JUSTIFICATIVA | O ZIP reintroduziria um bug corrigido e verificável (rótulo do botão `outline` sumindo no hover) e destruiria a linha de tema claro inteira. `cc23:check` (30 controles) guarda exatamente isso. |
| TESTE | `cc23:check` 30/30 ✅ · `light-layout:check` ✅ · 27 pares de contraste sem reprovação |
| RISCO | baixo |
| ROLLBACK | `git revert 916c609a 0e963a82` |

### 3. `package.json`

| campo | conteúdo |
|---|---|
| WORKSPACE | 280 scripts + `light-layout:check` |
| NOVO ZIP | 610 scripts (fases até 164 vs 101 no repo) |
| ÚLTIMO COMMIT | 280 scripts |
| DIFERENÇA | 344 scripts só no ZIP (192 `meta:*`, 63 `evolution:*`, 60 `atlas:*`); 14 só no repo; 4 divergentes (`test`, `typecheck`, `validate`, `release:prebuild-check`) |
| VERSÃO RECOMENDADA | **WORKSPACE + 1 importação pontual** |
| PRESERVAR | `validate` do repo (o do ZIP é **subconjunto**: perde `cc23:check`, `legal-pages:check`, `campaign-approvals:check`, `ready-campaigns:check`, `meta:campaign-dispatch:check`, `atlas-logo:check`, `validate-deploy:check`, `arvo-spin:check`, `audience-ui:check`); `typecheck` amplo (o do ZIP usa `tsconfig.active.json`, escopo reduzido) |
| IMPORTAR | a **ideia** do `test` do ZIP: rodar também `tests/contracts/*.test.mjs`. Implementado como `test:unit` + `test:contracts`, sem trocar o runner do repo |
| DESCARTAR | os 344 scripts de fase (dependem de configs/scripts que não existem no repo); `sharp`; bump de `next` |
| CONFLITO | sim, resolvido |
| DECISÃO | repo mantém + `test` encadeia as duas suítes |
| JUSTIFICATIVA | Adotar o `validate` do ZIP afrouxaria os portões de qualidade. A suíte de contratos é complementar, não concorrente. |
| TESTE | 53 + 16 = **69 testes, 0 falhas** |
| RISCO | baixo |
| ROLLBACK | `git revert d48cbe24` |

## Conflitos com decisão REPO MANTÉM — evidências principais

| arquivo | por que o repo permanece |
|---|---|
| `lib/atlas/navigation.ts` | ZIP tem 19 itens canônicos e 14 taskActions; `check-evolution-phase-093` exige `===16` e `check-evolution-phase-027` exige `===15`. O repo bate exatamente; o ZIP quebraria 2 portões. |
| 26 scripts/configs de fase | Carregam a reconciliação **CC-6** (comentários `// CC-6:` justificando cada re-baseline). O ZIP tem **zero** ocorrências de CC-6 e afirma contagens antigas. |
| `app/api/ai/briefing/route.ts` | ZIP remove `enforceRateLimit` e o cache de 60s. |
| `app/api/v1/team/route.ts` | ZIP remove 3 chamadas de `recordAuditLog`. |
| `check-evolution-phase-{065,066,067,082,086}` | ZIP remove a asserção negativa anti-`getSupabaseAdmin` — afrouxa a garantia de RLS. |
| `.env.example` / `config/environment-variables.json` | ZIP apaga `ANTHROPIC_API_KEY`, `META_CAPI_*`, `META_PAGE_ID`, `ATLAS_WHATSAPP_NLU_ENABLED`, `ATLAS_IDENTITY_CACHE_TTL_MS` — todas em uso no código do repo. |
| `eslint.config.mjs` | ZIP relaxa o portão (ignora `lib/ai`, `lib/auth`, `components/crm`…) e deixa de ignorar `.claude/**`. |
| `proxy.ts` | ZIP remove `/privacy`, `/terms`, `/data-deletion` — reprovaria o App Review da Meta. |
| `components/atlas/topbar.tsx` | ZIP remove o `ThemeToggle` (o próprio alternador de tema) e o botão do Copiloto. |
| `app/layout.tsx` | ZIP remove as fontes Geist. |
| `app/api/v1/search/route.ts` | ZIP troca `ilike` no banco por carregar 5.000 leads e filtrar em memória. |
| `app/api/v1/developments/[id]/materials/route.ts` | ZIP remove upload de vídeo com checagem de magic bytes. |
| `lib/atlas/evolution-500.ts` e afins | ZIP "corrige" `/properties/mtching`→`matching`, mas a pasta real do repo é `mtching` — geraria 404. |

## CONFLITO MANUAL GRANDE — RESOLVIDOS em 2026-07-24

Os 21 foram analisados individualmente e classificados. **Nenhum ficou pendente por falta de
análise.** Resultado:

| classe | qtd | itens |
|---|---|---|
| **A — resolvível tecnicamente** | 5 | `scripts/{build,doctor,preflight-production,measure-navigation-baseline}.mjs` **(importados)** · `analytics/manager-daily` |
| **B — repo preservado** | 6 | `ai/briefing` (ZIP remove rate limit e cache) · `crm/reactivation` (remove guarda anti-vazamento entre organizações) · `inventory-navigation-architecture` (quebra: lê arquivo que não existe) · `POST_DEPLOY_CHECKLIST` (ZIP tem 3 KB contra 14,7 KB) · `dashboard/page.tsx` (repo é a consolidação intencional) · `leads/page.tsx` |
| **C — importação parcial** | 6 | `analytics/{broker-daily,dashboard,team-sla}` · `productivity/{daily,weekly}` · `team` — todos exigem trecho cirúrgico porque o ZIP remove algo (Fase 100, `cacheHeaders`, `recordAuditLog`, filtro por dono). **Não aplicados: dependem de migrations.** |
| **D — duplicação semântica** | 0 | as duplicações estavam nos exclusivos, não nos conflitos |
| **E — decisão de produto** | 4 | `governance/{rollback,executive-acceptance}` · `legacy-route-paths` · `evolution-program-3000` → ver `PRODUCT_DECISIONS_REQUIRED.md` |
| **F — investigação adicional** | 1 | `leads/[id]/route.ts` — a troca de cliente admin por cliente do usuário só se justifica depois dos 11 cenários de RLS da Fase 8, nunca executados |

### O que foi de fato importado dos conflitos

4 scripts classe A. Os 6 de classe C **não foram aplicados**: cada um depende de colunas,
tabelas ou RPCs das migrations não aplicadas — aplicá-los hoje trocaria uma recusa honesta por
erro em runtime. Ficam mapeados com o trecho exato para quando o banco subir.

### Lista original (para rastreio)

`app/(crm)/dashboard/page.tsx` (repo = redirect, ZIP = dashboard completo) ·
`app/(crm)/leads/[id]/page.tsx` · `app/(crm)/leads/page.tsx` ·
`app/api/v1/leads/[id]/route.ts` (ZIP troca cliente admin por cliente do usuário — **relevante para RLS**) ·
`app/api/v1/analytics/{broker-daily,dashboard}/route.ts` · `app/api/v1/crm/distribution/route.ts` ·
`app/api/v1/productivity/{daily,weekly}/route.ts` · `app/api/v1/team/route.ts` ·
`app/api/v1/governance/{executive-acceptance,rollback}/route.ts` ·
`scripts/{package-hostinger,verify-hostinger-package}.mjs` ·
`scripts/{measure-navigation-baseline,inventory-navigation-architecture}.mjs` ·
`scripts/legacy-route-paths.mjs` · `config/{environment-variables,evolution-program-3000}.json` ·
`docs/POST_DEPLOY_CHECKLIST.md` (415 linhas divergentes, conteúdo único dos dois lados)

## NÃO VERIFICADO

Nenhum arquivo em conflito ficou sem classificação. Não foram abertos individualmente
os 1.087 idênticos (dispensável: hash idêntico) nem os 979 exclusivos do repo
(preservados por definição).
