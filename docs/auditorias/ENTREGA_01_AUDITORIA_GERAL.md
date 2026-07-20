# Entrega 01 — Auditoria Geral

**Branch:** `claude/atlas-v3-entregas` · **Data:** 2026-07-19 · **Autor:** Claude (Engenheiro de Implementação) · **Revisor:** ChatGPT (arquitetura)

---

## Objetivo

Mapear o estado real do Atlas v3 antes de qualquer implementação, por regra do protocolo ("nunca reconstrua, nunca duplique"). Cobre as 10 áreas de entrega futuras (Cliente 360 até Produção/Homologação) e produz uma linha de base auditável.

## Método

Leitura direta de código (git, filesystem) + 3 agentes de exploração paralelos (somente leitura, sem edição) cobrindo as 10 áreas do roadmap + Supabase MCP (estado vivo do banco) + `lint`/`typecheck`/`build` reais.

---

## 🔴 Achado crítico nº1 — 48 arquivos não commitados, de outra sessão

Ao rodar `git status` antes de criar a branch, encontrei **48 arquivos não rastreados** (criados hoje entre 02:30–15:05, antes do trabalho desta conversa) que eu não gerei:

- `config/meta-intelligence-phase-001.json` … `-010.json`
- `docs/META_ASSET_INVENTORY.md` + 9 outros `docs/META_*.md`
- `scripts/audit-meta-*.mjs` (8), `scripts/check-meta-intelligence-phase-*.mjs` (10), `scripts/preflight-meta-*.mjs`, `scripts/compare-meta-bridge-remote-snapshot.mjs`, `scripts/validate-meta-rls-staging-evidence.mjs`, `scripts/sql/`
- `app/api/v1/integrations/meta/backfill/route.ts`
- `lib/atlas/scoring-engine.ts`

**Caracterização (li o conteúdo, não assumi):** não é código de feature — é um **programa de auditoria fail-closed de 10 fases**. Cada fase JSON declara `mode: "read_only"/"audit_only"/"specification_only"` e `governance: { databaseMutation: false, campaignMutation: false, budgetMutation: false }`. Os scripts só fazem `.select()`, nunca `insert/update/delete` (confirmado por grep), e têm auto-guarda contra padrões de mutação.

**O que ele revela (achado real, não fabricado por mim):**
- Fase 1 testou o Graph API da Meta no ambiente local: token retornou `401`/erro `190` (inválido/expirado); tabelas `meta_lead_sources`/`meta_lead_events`/`meta_conversion_configs` retornaram `PGRST205` (ausentes no cache PostgREST do banco auditado). Ou seja: **"Configurado" no `.env.local`, não comprovado Operacional.**
- A partir da Fase 4, o foco muda de Meta para **schema drift do banco**: *"o ledger remoto tem 33 migrations aplicadas; o repositório contém 123 arquivos... 90 migrations ainda não reconciliadas"*, e o banco ativo usa `crm_projects`/`marketing_campaigns` enquanto parte do código espera `developments`/`campaigns`. Fases 5–10 estão todas em `status: blocked`/`verified_with_blockers` (falta helper `private.can_view_lead`, RLS sem hierarquia completa, `search_path` não vazio numa função `SECURITY DEFINER`, ausência de projeto de staging isolado).
- `lib/atlas/scoring-engine.ts` é um refactor de consolidação (declarado no próprio arquivo: substitui `lib/ai/LeadScoreEngine.ts` e `lib/ai/lead-scoring.ts`) mas **não está importado em nenhum lugar** — inacabado, órfão.

**Não commitei nada disso.** Por Regra 1 ("leia antes de alterar", "nunca duplique"), isso precisa da sua decisão antes de eu tocar em Meta (Entrega 6) ou em scoring (relevante a Cliente 360/Dashboard):

> **Pergunta para você (ou para o ChatGPT, se ele autorizou essa auditoria):** esse material deve ser (a) preservado e commitado como um artefato de auditoria válido, (b) descartado/ignorado por ora, ou (c) usado como guia para priorizar a reconciliação de schema **antes** de qualquer nova feature? Recomendo (c) — o achado de 90 migrations não reconciliadas é maior que qualquer item individual do roadmap de 11 entregas.

---

## Áreas 1–10: o que existe de verdade

| # | Área | Completude | Real vs simulado |
|---|---|---|---|
| 1 | **Cliente 360** | ~85% | Real. Não existe entidade "cliente" separada — decisão de design explícita: `/customers` lista leads e linka para `/leads/{id}` ("Lead 360"), que consolida timeline, score, propostas, IA — tudo via Supabase, sem mock. |
| 2 | **Command Center** | ~70% | O painel operacional real está em `/dashboard` + `/api/v1/governance/command-center` (rotulado "Abrir Command Center" na UI) — funcional, com Realtime. Mas **7 arquivos em `core/command-center/*.ts` estão vazios (0 bytes)**, não referenciados — a arquitetura documentada (`docs/ATLAS_COMMAND_CENTER_ENTERPRISE_SPEC.md`) diverge da implementação real. `lib/atlas/evolution-phases.ts` expõe **percentuais de progresso hardcoded** (`92`, `98`, `91`...) exibidos como métrica objetiva na UI. |
| 3 | **Pipeline/Kanban** | ~85% no fluxo principal | `/pipeline` real (drag-and-drop, PATCH com controle otimista, grava `pipeline_history`). Mas `pipeline/hot|warm|cold|[stage]` são **código morto/órfão** — HTML sem estilo, tipos `any`, camada de serviço legada desconectada da navegação real, com nomes de estágio que não batem com o funil canônico. |
| 4 | **Agenda** | ~55% | Tarefas/follow-ups e agendamento de visita por lead são reais. **Bug de produção encontrado:** `app/api/v1/calendar/route.ts:40` tem `const visitRows = []` hardcoded — a categoria "Visitas" no hub de agenda sempre mostra 0, mesmo com visitas reais no banco. **Confirma sua suspeita:** integração Google/Microsoft Calendar não tem nenhum fluxo OAuth real (zero uso de `googleapis`/`google-auth-library` em todo o repo) — é só uma tela de "pré-configuração" honesta (a própria UI avisa que não conecta nada ainda). |
| 5 | **Integração Meta** | Código real e coerente; operacionalidade não comprovada | Webhook (`app/api/webhooks/meta/route.ts`) com HMAC, dedupe, fila — real. Ver achado crítico nº1 acima: não há evidência de lead real recebido/importado no ambiente auditado. |
| 6 | **WhatsApp Business** | Funcional (inbound+outbound+NLU opt-in) | Pipeline real ponta a ponta, `ATLAS_WHATSAPP_NLU_ENABLED=false` por padrão (confirmado). Existe também scaffolding decorativo morto e sem link de navegação (`core/communication/WhatsAppEngine.ts` vazio; `WhatsAppAgent.reply()` retorna string fixa) — não confundir com o real. |
| 7 | **Copilot IA** | Real e interativo | `AtlasCopilotDock` + `/api/ai/copilot` — chat contextual de verdade, multi-provider (`lib/ai/provider-router.ts`), guardrails, memória estruturada persistente. **Risco de confusão:** existe um clone de nome quase idêntico (`SalesCopilot.tsx`/`NextBestAction.tsx`) 100% mock, em rota órfã sem link de navegação — não é o Copilot em produção. |
| 8 | **Dashboard Executivo** | Real, com lacunas | `director-daily` e afins fazem queries agregadas reais. Comissão e ROAS de marketing hardcoded em `0`/`null`. **Achado crítico:** 9 páginas em `/analytics/*` (`enterprise`, `sales`, `leads`, `source`, `conversion`, `marketing`, `performance`, `funnel`, `realtime`) são **100% dado fictício** (ex.: "VGV R$250 milhões", corretores inventados) sem nenhum fetch — não estão no menu, mas continuam acessíveis por URL direta a qualquer usuário logado. |
| 9 | **Portal de Incorporadoras** | Ingestão de leads completa; portal externo não existe | `lib/integrations/portals/normalize.ts` + webhook + worker funcionam ponta a ponta. Mas **não existe área logada externa para incorporadoras** (`app/portal/**` não existe, sem `developer_users`/login). O papel `incorporadora` está no catálogo RBAC mas não é resolvido para nenhum perfil real. Não há UI para cadastrar fontes de portal — só SQL direto. |
| 10 | **RBAC** | Catálogo pronto, enforcement parcial | `lib/auth/permissions.ts` (39 permissões, 7 papéis) existe. **Achado crítico:** `requirePermission()` **não é chamado por nenhuma rota** (grep confirma 0 usos) — todo enforcement real hoje é via `requireAccessContext` (99 rotas) + `requireApiIdentity` (22 rotas) = 121/148 (~82%). As 27 rotas restantes majoritariamente têm proteção própria (secret de cron, assinatura de webhook) ou são legitimamente públicas. **Não existe UI de administração de papéis.** Migration `20260720010000_rbac_enterprise_foundation.sql` **ainda não aplicada** no banco vivo (reconfirmado agora via Supabase MCP: 33 migrations aplicadas, as mesmas de antes). |

---

## Autoauditoria (Regra 7)

- **Código duplicado?** Sim — duas camadas de scoring (`lib/atlas/scoring-engine.ts` novo vs `LeadScoreEngine.ts`/`lead-scoring.ts` órfãos); dois "copilotos" (real vs `SalesCopilot`/`NextBestAction` mock); dois pipelines de lead (real vs `hot/warm/cold/[stage]` legado).
- **Botão sem ação?** Não encontrado (busca por `onClick={() => {}}`, `console.log`, `href="#"` — vazio).
- **Tela apenas visual?** Sim — 9 páginas `/analytics/*` + `atlas-v3/agents` (barras de progresso calculadas como `35+index*7%`, decorativas).
- **Dado fictício como real?** Sim — as 9 páginas de analytics acima, mais o percentual de "% evolução" hardcoded em `evolution-phases.ts`.
- **Erros de TypeScript?** Não — `tsc --noEmit` limpo (exit 0).
- **Problemas de permissão?** Sim — `requirePermission()` morto; 27 rotas sem os 3 helpers padrão (maioria com proteção própria, vale checagem manual pontual).
- **Código morto?** Sim — listado nas áreas 2, 3, 6, 7, 10 acima; total de ~15 arquivos/rotas órfãos identificados.
- **Melhoria simples possível agora?** Sim, mas fora do escopo desta entrega (Regra 2 — uma entrega por vez): corrigir `visitRows = []` pertence à Entrega Agenda; remover dead code pertence a cada entrega correspondente; não apliquei nenhuma correção nesta auditoria para não misturar escopos.

---

## Testes executados (Regra 5)

```
git status --porcelain      → 52 entradas (48 não rastreadas de outra sessão + 4 arquivos do usuário em edição, intocados)
git diff --stat main...HEAD → 1184 files changed, 92836 insertions(+), 5850 deletions(-)
git log -5 --oneline        → ebfd1520 fix(deploy)... 3fbac01a launch... adda66d0 docs... e56e5091 deploy... 828d88d9 chore...
npm run lint                → exit 0 (eslint . --max-warnings=0)
npm run typecheck           → exit 0 (tsc --noEmit)
npm run build                → exit 0 (node scripts/build.mjs)
Supabase (MCP list_migrations) → 33 aplicadas, mesmas desde a última checagem — as 4 pendentes (portais/RBAC/WhatsApp/security fix) seguem não aplicadas
```

## Pendências (dependem de decisão/credencial humana)

1. **Decisão sobre os 48 arquivos não commitados** (Meta Intelligence audit + scoring-engine.ts) — ver achado crítico nº1.
2. Aplicar as 4 migrations pendentes no Supabase vivo (bloqueador de deploy já conhecido).
3. Token Meta Graph API expirado/inválido — precisa de credencial nova para a Entrega 6 ser testável de ponta a ponta.
4. Decidir se as 90 migrations "não reconciliadas" citadas pelo framework de auditoria são reais ou um artefato de comparação incorreta — requer revisão humana do relatório `docs/META_SCHEMA_COMPATIBILITY_PLAN.md`.

## Riscos

- **Alto:** 9 páginas de analytics com dado fabricado continuam publicamente acessíveis (por URL direta) a qualquer usuário logado — risco de um gestor tomar decisão com número inventado achando que é real.
- **Médio:** RBAC granular (39 permissões) existe só no papel — enforcement real é por papel largo, não por permissão fina; se alguém assumir que `requirePermission` está ativo, há uma lacuna de segurança percebida vs real.
- **Médio:** dívida de schema (90 migrations não reconciliadas, segundo o framework de auditoria não commitado) pode invalidar suposições de outras entregas do roadmap.
- **Baixo:** código morto/órfão identificado não representa risco funcional (não está em rotas navegáveis), mas aumenta custo de manutenção e risco de confusão (nomes duplicados como Copilot/SalesCopilot).

## Próxima entrega

**Entrega 2 — Cliente 360.** Já é a área mais madura (~85%), então o trabalho tende a ser fechamento de lacunas pontuais, não construção do zero. Vou aguardar sua decisão sobre o achado crítico nº1 antes de avançar, já que ele pode mudar a prioridade (schema drift pode ser mais urgente que seguir a ordem literal do roadmap).
