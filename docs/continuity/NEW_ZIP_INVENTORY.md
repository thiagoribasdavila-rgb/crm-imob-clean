# NEW_ZIP_INVENTORY — ATLAS_ONE_FINAL_OPERACIONAL.zip

Data da análise: 2026-07-24 · ZIP preservado intacto, extraído em diretório isolado
(scratchpad da sessão), nunca sobre o projeto.

## Identificação

| Campo | Valor |
|---|---|
| Caminho | `~/Documents/Aplas v 3/dist/hostinger/ATLAS_ONE_FINAL_OPERACIONAL.zip` |
| Tamanho | 5.397.998 bytes (5,4 MB) |
| Data do arquivo | 2026-07-23 20:59 |
| SHA-256 | `e8b9cc3d8b2c02b95d7728b9aedd78d016374a5c68629c9f95152b07890b31f5` |
| Checksum externo | **confere** (`shasum -c` → OK) |
| Inventário interno | `RELEASE_FILES.sha256`, 2.252 linhas — **0 falhas** na verificação |
| Total de arquivos | 2.253 |
| Raiz real | raiz do próprio ZIP (sem diretório-pai; extrai direto em `app/`, `lib/`, …) |
| Projetos aninhados | nenhum |
| Metadados Git | **ausentes** — `HOSTINGER_PACKAGE.json` declara `commit: null` |
| Versão declarada | Atlas One `3.0.0-rc.2`, canal `final-homologation-candidate` |
| Fingerprint de origem | `sha256:8baf08dd…` (`sourceMode: workspace-content-hash`) |
| `sourceTimestamp` | `2034-04-20T21:21:33Z` — timestamps normalizados (build reprodutível), **não** é data real |

Cadeia de ZIPs do mesmo dia (23/07), do mais antigo ao mais novo:
`V1000_FINAL_CLEAN` (14:28) → `V1000_BOOTSTRAP_FIXED` (18:29) → `V1000_PHASE6_FINAL` (19:53)
→ **`FINAL_OPERACIONAL` (20:59)** ← o analisado, o mais recente da linha.

## Framework e configuração

Next.js 16 + Supabase + Prisma 7, igual ao repo. Diferenças de configuração relevantes:

- `tsconfig.active.json` (exclusivo do ZIP) — typecheck com escopo reduzido;
- `playwright.config.mjs` + `tests/e2e/` (exclusivos) — E2E que o repo não tem;
- `.nvmrc`, `INSTALACAO.md`, `CHECKLIST_FINAL.md`, `HOSTINGER_PACKAGE.json`, `RELEASE_FILES.sha256`
  — **artefatos de instalação/release**, próprios do empacotamento, sem valor para o repo;
- `dependencies`: só o ZIP tem `sharp@0.35.0`; só o repo tem `geist`, `shadcn`, 4 pacotes `@streamdown/*`;
- `devDependencies`: só o ZIP tem `@playwright/test`, `@electric-sql/pglite`, `shadcn`;
- versões: ZIP em `next@16.2.11` (repo `16.2.10`), `@prisma/client` pinado vs `^`.

## Varredura de segurança (executada)

- `.env` reais: **ausentes** — só `.env.example` e `.env.homologation.example`;
- `node_modules`, `.next`, `dist`, `build`, caches: **ausentes**;
- grep de padrões de segredo (`sk-…`, JWT `eyJhbGciOiJIUzI1…`, `AKIA…`, `xox[bp]-`,
  `SUPABASE_SERVICE_ROLE_KEY=ey…`): **nenhuma ocorrência**;
- `privateDataIncluded: false` declarado e **confirmado** na varredura.

Veredito: o ZIP é seguro para leitura e importação seletiva.

## Estrutura: o que o ZIP tem e o repo não (999 arquivos)

| Área | Qtd | Natureza |
|---|---|---|
| `scripts/` | 399 | máquina de fases própria da linha V1000 (meta/evolution/atlas) |
| `config/` | 259 | configs dessas fases |
| `docs/` | 236 | documentação das fases |
| `components/` | 30 | família `components/crm/*` (KanbanBoard, LeadCard, …) — **linhagem V2/legada** |
| `supabase/` | 22 | 7 migrations + 5 drafts + 6 testes SQL + `config.toml` + `seed.sql` |
| `app/` | 22 | 8 de `app/generated/prisma/**` (**artefato gerado**), fluxo `/setup` (bootstrap), rotas marketing/settings |
| `lib/` | 13 | `lib/ai/*` e `lib/analytics/*` (linhagem legada), `lib/bootstrap/*` |
| `tests/` | 6 | 4 contratos + 2 specs Playwright |
| `infra/` | 3 | `compose.yaml` de fases Meta (Docker) |
| raiz | 6 | artefatos de instalação/release |

## O que o repo tem e o ZIP não (979 arquivos)

`core/` **577** (removido do pacote de propósito: `unusedConceptualCoreIncluded: false` —
e confirmado sem consumidores: 0 imports de `@/core` tanto no repo quanto no ZIP),
`app/` 189, `lib/` 61, `scripts/` 45, `docs/` 40, `supabase/` 30, `components/` 17,
`public/` 5, incluindo **toda a linha de tema claro e `components/public/PublicPageShell.tsx`**
(o ZIP declara `legacyPrototypeRoutesIncluded: false` e não traz as páginas públicas).

## Análise de linhagem (método, para a matriz)

Cada um dos 2.253 arquivos do ZIP teve seu conteúdo hasheado (`git hash-object`) e testado
contra **toda a história** do repositório (`git cat-file --batch-check`):

- **1.127 arquivos** têm conteúdo idêntico a algum blob já existente na história do repo
  → herdados de um ancestral comum, sem divergência real;
- **1.126 arquivos** não existem em lugar nenhum da história → originais da linha ZIP;
- desses, **167 estão em caminhos que também existem no repo** → conflito real
  (as duas linhas editaram o mesmo arquivo). Esses 167 são o objeto da `MERGE_MATRIX.md`.

Esse método substitui "data de modificação" como critério — os timestamps do ZIP são
sintéticos (2034) e não carregam informação de precedência.

## Riscos identificados no ZIP

1. **`app/globals.css` do ZIP regride o reparo CC23**: remove os tokens semânticos do shadcn
   derivados da paleta Atlas (`--foreground`, `--card`, `--primary-foreground`, série `--chart-*`).
   No repo esse reparo corrigiu um defeito real e verificável (rótulo do botão `outline` sumindo
   no hover). Adotar a versão do ZIP reintroduziria o bug — e o repo tem `cc23:check` guardando isso.
2. **`validate` do ZIP é subconjunto**: não roda `cc23:check`, `legal-pages:check`,
   `campaign-approvals:check`, `ready-campaigns:check`, `meta:campaign-dispatch:check`,
   `atlas-logo:check`, `validate-deploy:check`, `arvo-spin:check`, `audience-ui:check`.
3. **`components/crm/*` e `lib/ai/*` do ZIP são duplicação semântica** de capacidades que o repo
   já tem sob outra arquitetura — importar criaria dois caminhos para a mesma função.
4. **`app/generated/prisma/**`** é artefato gerado — nunca deve entrar por cópia.
5. **`supabase/migrations` e `supabase/tests`** tocam schema/RLS → **gatilho de parada**
   declarado pelo usuário; nada foi importado, análise individual pendente de autorização.
6. **Fluxo `/setup` + `lib/bootstrap/*`**: instalação/bootstrap — excluído por instrução explícita.

## Conteúdo que NÃO deve entrar no merge (decisão firmada)

`app/generated/prisma/**` · `RELEASE_FILES.sha256` · `HOSTINGER_PACKAGE.json` ·
`CHECKLIST_FINAL.md` · `INSTALACAO.md` · `.nvmrc` · `app/(auth)/setup/**` ·
`lib/bootstrap/**` · `components/crm/**` · `lib/ai/{LeadScoreEngine,agent-ranking,insights-engine,lead-scoring}.ts` ·
`lib/analytics/**` · `supabase/**` (bloqueado por autorização) · `infra/**` (Docker de fases).
