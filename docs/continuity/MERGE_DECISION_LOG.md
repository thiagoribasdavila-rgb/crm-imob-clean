# MERGE_DECISION_LOG — o que entrou, o que ficou de fora e por quê

Sessão: 2026-07-24 · Capacidade autorizada: 5 horas estimadas

## Alterações aplicadas (6 commits locais, nenhum push)

### 1. `0e963a82` — `feat(tema)` — validação e commit da unidade interrompida
Origem: **workspace** (trabalho pendente da sessão anterior, não do ZIP).
Conteúdo: bloco "Kanban de execução" no pipeline, cobertura clara do shell interno,
`light-layout:check`, `docs/LIGHT_LAYOUT_EVOLUTION.md`.
Validação antes do commit: `light-layout:check` ✅ · 53/53 testes · tsc 0 · eslint 0 · build exit 0.

### 2. `d48cbe24` — `test(contracts)` — 2 testes importados do ZIP
Origem: **ZIP**, importação seletiva.
Critério: só testes cujas dependências já existem no repo e que exercitam código real desta linha.
- `safe-redirect.test.mjs` → cobre `lib/auth/safe-redirect.ts` (open redirect). O repo tinha a função **sem teste**.
- `legacy-v2-compat.test.mjs` → cobre as 9 funções de `lib/compat/legacy-v2.ts`.
Verificado antes de importar: os 9 símbolos importados existem no repo. Resultado: 9/9 passaram
contra o código do repo, sem alterar nenhum módulo testado.
Rejeitados no mesmo lote: `bootstrap-public-route` (depende de `lib/bootstrap/policy.ts`
inexistente — instalação, fora de escopo), `phase-7-operational-recovery` (depende de rotas e
migration exclusivas do ZIP), 2 specs e2e (exigiriam instalar `@playwright/test`).

### 3. `916c609a` — `fix(tema)` — correção de regressão da minha própria entrega
**Auto-auditoria.** Depois de commitar a unidade 1, rodei `cc23:check` e ele caiu de 30/30
para 27/30. Causa: o check define a camada CC23 como "tudo após o marcador", e o bloco claro
foi anexado ao fim do arquivo. Três violações corrigidas:
- blur removido (era redundante — a superfície já herda o desfoque da regra base);
- drop-shadow removido (a sombra da regra base permanece);
- `--readiness-accent` virou token real em `:root`, derivado de `--primary`.
A mudança do token é **comprovadamente neutra**: resolve para `#38bdf8` no escuro e `#0b63c5`
no claro — exatamente os dois fallbacks literais que foram removidos.
Resultado: 30/30 restaurado.

### 4. `b05775e6` — `fix(release)` — defeito real do repo, achado pela comparação
`package-hostinger.mjs` gera `atlas-v3-hostinger-homologation.zip`, mas o ensaio de build limpo
e dois configs apontavam para `atlas-v3-hostinger-final.zip` (artefato de 18/jul). O ensaio
**passava** porque o ZIP antigo ainda existe em disco — validava um pacote obsoleto. Em checkout
limpo teria falhado. O próprio runbook já registrava isso como risco **R13**.
Origem da correção: **ideia do ZIP**, implementação mínima própria (usa `ATLAS_PACKAGE_NAME` com
o default do produtor, em vez das 34 linhas extras da versão do ZIP).

### 5. `e897adfe` — `fix(crm)` — 8 telas quebradas em runtime
`lib/api/core.ts:70` devolve `{ok, data, meta}`; 8 páginas faziam `setData(payload)` e guardavam
o envelope no estado tipado como o payload interno → `data.lead`, `data.summary`, `data.groups`
são `undefined` e o primeiro acesso encadeado lança TypeError. O TypeScript não pegava porque
`response.json()` é `any`.
Origem: **defeito do repo**, revelado pela comparação (a linha ZIP já lia `payload.data`).
Verificação independente: confirmei rota por rota que as 8 usam `apiSuccess`. A análise inicial
apontava 5 arquivos; a varredura própria encontrou **8**.
Duas páginas com o mesmo padrão foram **deliberadamente não alteradas** (`leads/[id]/timeline`,
`integrations/meta`): suas rotas respondem com `NextResponse.json` direto, sem envelope.

### 6. (este commit) — documentação de continuidade
`docs/continuity/*` — snapshot, inventário, matriz, decisões, testes, temas, riscos, rollback,
próximo bloco, manifesto do ZIP.

## Rejeições relevantes (com evidência)

| o que | por que não entrou |
|---|---|
| `app/globals.css` do ZIP | remove o reparo CC23 (bug real do botão `outline`) e **não tem tema claro** (0 ocorrências de `data-theme="light"` vs 71 no repo) |
| `app/(crm)/pipeline/page.tsx` do ZIP | remove toda a governança de descarte (taxonomia alinhada ao lead quality da Meta) |
| `validate` do ZIP | subconjunto — perde 9 portões de qualidade que o repo tem |
| 344 scripts de fase do ZIP | dependem de configs, símbolos e rotas inexistentes no repo |
| `components/crm/*` (30) e `lib/ai|analytics/*` (13) | duplicação semântica: criariam dois caminhos para a mesma função |
| `app/generated/prisma/**` (8) | artefato gerado |
| `app/(auth)/setup/**` + `lib/bootstrap/**` | bootstrap/instalação — excluído por instrução explícita |
| `supabase/**` (22 arquivos, 7 migrations) | **gatilho de parada**: schema/RLS exige autorização específica. Não analisadas individualmente nem aplicadas. |
| `infra/**` (Docker compose de fases) | infraestrutura ativa — gatilho de parada |
| bump `next@16.2.11`, `sharp`, `@playwright/test` | instalar dependência sem necessidade comprovada |
| docs com "Node 22+/24" | contradiriam `engines: ">=20.9 <21"` do `package.json` do repo |

## Importações pontuais identificadas mas NÃO aplicadas (falta de capacidade)

Cada uma é uma unidade pequena, verificada como plausível, para a próxima sessão:

1. **`app/api/v1/tasks/route.ts`** — o repo devolve `TASK_RECURRENCE_PENDING` ("liberada após
   homologação") enquanto a migration `20260717233000_phase_43_recurring_tasks.sql` **já está no
   repo** criando o RPC `create_recurring_task`. Feature bloqueada sem motivo aparente.
   *(Requer confirmar se o RPC existe no banco vivo — o repo tem drift de schema conhecido.)*
2. **`bulk-transfer`** — validar destino dentro do escopo hierárquico (hoje o repo confia só no
   erro do banco) + exigir `humanConfirmed`.
3. **`sales/[id]/commission`** — rollback quando o registro em `commission_events` falha.
4. **`pipeline/stages`** — adicionar `enforceRateLimit`.
5. **`lib/compat/live-hierarchy.ts`** — o repo liga **todo** corretor a `managers[0]`; o ZIP
   deriva por `team`. Corrige distorção de hierarquia.
6. **PADRÃO F** — parar de devolver `error.message` do banco ao cliente em 5 rotas.
7. **`leads/actions/page.tsx`** — o repo é stub de 281 bytes com botões inertes; o ZIP tem a
   página real.

Nenhuma foi aplicada porque a capacidade autorizada se esgotou e todas exigem verificação
individual contra o banco vivo ou contra consumidores — não são substituições mecânicas.
