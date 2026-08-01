# ANÁLISE DO DIFF DA BRANCH

**2026-07-31.** Nada foi apagado. Este documento mede e classifica; a decisão de
remover é do dono.

---

## OS DOIS NÚMEROS QUE ESTAVAM SENDO CONFUNDIDOS

| medida | valor |
|---|---|
| **Divergência histórica** — `claude/atlas-v3-entregas` vs `main` | **2021 arquivos · 236.839 inserções · 17.262 remoções** |
| Commits de divergência | **893** |
| **Alterações desta sessão** — `17db153e..HEAD` | **70 arquivos · 15.511 inserções · 31 remoções** |
| Alterações do dia inteiro (30–31/07) | 179 arquivos · 36.746 inserções · 775 remoções |

As 236 mil linhas **não** são desta sessão: são 893 commits acumulados contra `main`.
É a visão que o GitHub mostraria num PR, e é por isso que ela assusta.

---

## A. DIVERGÊNCIA HISTÓRICA, POR ÁREA

| área | linhas | arquivos |
|---|---:|---:|
| `app/` | 64.243 | 425 |
| `lib/` | 36.735 | 213 |
| `scripts/` | 34.050 | 351 |
| `docs/` | 25.243 | 323 |
| `tests/` | 19.785 | 103 |
| `package-lock.json` | 17.762 | 1 |
| `supabase/migrations/` | 13.709 | 163 |
| `config/` | 11.388 | 235 |
| `components/` | 10.925 | 127 |
| raiz e outros | 2.999 | 78 |

Distribuição coerente com trabalho de produto: código, testes, scripts de
verificação e documentação. `package-lock.json` responde por 7,5% sozinho, o que é
normal.

## B. ESTA SESSÃO — 70 arquivos

Correção do comparador · seis estados da prontidão · relógio do lease · instalador de
cron com porteiro · versionamento dos 43 arquivos locais · scripts operacionais ·
documentação. Detalhe em `INVENTARIO_ARQUIVOS_SESSAO.md`.

## C. ARQUIVOS GERADOS — **zero**

Nenhum `node_modules`, `.next`, `dist`, `build`, `coverage`, cache, dump, zip,
backup ou arquivo de editor rastreado. O `.gitignore` cobre os nove padrões.

## D. ⚠️ ARQUIVOS DUPLICADOS — 414 arquivos VAZIOS

Achado desta análise: **414 arquivos rastreados têm ≤ 2 bytes**. Aparecem como
"duplicados" porque compartilham o mesmo hash de conteúdo vazio.

| diretório | vazios |
|---|---:|
| `core/ai-engine/agents/lead-agent` | 27 |
| `core/memory-system` | 13 |
| `core/ai-engine/agents/orchestrator` | 12 |
| `core/marketing-intelligence` | 11 |
| `core/data-layer` · `core/crm` | 11 · 11 |
| `core/workflow-engine` · `core/sales-intelligence` | 10 · 10 |
| e outros | — |

Também vazios: `components/core/DataTable.tsx`, `LoadingSkeleton.tsx`,
`StatCard.tsx`, `components/ui/input.tsx`, `modal.tsx`, `search-input.tsx`.

**Nenhum é importado por código vivo** — verificado nos 20 primeiros por busca de
`@/<caminho>`.

É o esqueleto de uma arquitetura `core/` que nunca foi preenchida. Não é risco de
segurança nem de execução: é ruído que faz o repositório parecer maior e mais
completo do que é. Um `components/ui/input.tsx` vazio sugere um design system que
não existe.

**Recomendação: remover em commit próprio**, separado desta auditoria, depois de
confirmar um a um. Não removi: apagar 414 arquivos no meio de um checkpoint de
auditoria misturaria limpeza com correção, e a regra desta rodada é não ampliar
escopo.

## E. ALTERAÇÕES SEM RELAÇÃO COM A AUDITORIA — **zero nesta sessão**

## F. CORREÇÕES INDISPENSÁVEIS

Comparador de migrations (109 → 0) · relógio do lease · escalação de privilégio em
RPC · motivo do descarte que era destruído · `/pipeline/discards` sobre tabela vazia.

## G. DOCUMENTAÇÃO — 25.243 linhas históricas, 323 arquivos

Volume alto. Há sobreposição entre relatórios de fase antigos; a consolidação está
em `INDICADORES_OFICIAIS.md`, que passa a ser a fonte única de números.

## H. SCRIPTS OPERACIONAIS — 9 novos em `scripts/operations/`

## I. POSSÍVEIS SEGREDOS — **zero**

| varredura | resultado |
|---|---|
| conteúdo do diff da sessão | **0** ocorrências de JWT, `sk-`, `sb_secret_`, `EAA`, connection string |
| histórico dos últimos 20 commits | **0** |
| portão oficial `security:secrets` | **PASSED — 2540 arquivos, 0 credenciais** |
| `.env.example` · `.env.production.example` | 87 e 64 variáveis, **65 e 44 sem valor**, nenhum padrão real |
| `.env.local` | **removido** da branch; ignorado no `.gitignore:54` |

## J. NÃO DEVEM ENTRAR NO GIT — nada pendente

---

## MAIORES ARQUIVOS RASTREADOS

| arquivo | linhas |
|---|---:|
| `package-lock.json` | 21.035 |
| `app/globals.css` | 10.288 |
| `app/(crm)/command-center/page.tsx` | 4.013 |
| `components/AtlasCopilotDock.tsx` | 2.677 |
| `app/(crm)/integrations/meta/page.tsx` | 2.577 |
| `app/(crm)/leads/page.tsx` | 2.294 |
| `app/(crm)/leads/[id]/page.tsx` | 1.936 |

`globals.css` com 10.288 linhas e três páginas acima de 2.000 são candidatos a
divisão — **fora do escopo desta auditoria**, e registrados aqui para não se perderem.

---

## VEREDITO

O diff é grande porque a branch tem 893 commits de trabalho real, não porque carrega
lixo. **Nenhum artefato gerado, nenhum segredo, nenhuma dependência duplicada.**

O único achado que merece ação é a **remoção dos 414 arquivos vazios** — em commit
próprio, fora deste checkpoint.
