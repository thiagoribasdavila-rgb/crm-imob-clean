# Plano de Implementação — Criação Autônoma de Campanha Meta pelo Atlas (onda V4.7 / SALTO)

> Gerado por mapeamento paralelo do subsistema Meta. Âncora: `docs/campaigns/spin-mood/campaign-spec.json`.

## 1. Objetivo e escopo da 1ª campanha
Publicar, de forma autônoma-mas-supervisionada, a campanha `spin-mood-vila-madalena-2026-07`:
`LEAD_GENERATION` → `INSTANT_FORM`, 3 criativos de vídeo 9:16 (2 morador + 1 investidor),
formulário "Receba a tabela de valores do Spin Mood" com qualificador `renda`, geo São Paulo raio 10 km,
`budget.daily_brl: 60` (teto máx 80). O Atlas monta a spec, faz upload dos vídeos, cria tudo **PAUSED**
na Meta e só ativa após aprovação de diretor. Mínimo: **1 campanha, 1 ad set, 3 ads, 1 leadgen_form**.
Fora de escopo agora: otimização automática de público/orçamento (fica manual/proposta).

## 2. Arquitetura — reusar vs criar
**REUSAR (sem tocar):**
- `lib/meta/graph.ts`: `metaGraphVersion()`, `metaGraphUrl()`, `parseMetaGraphError`/`describeMetaGraphFailure` — endpoint-agnósticos, servem `act_<id>/campaigns|adsets|ads|adcreatives|leadgen_forms`.
- `lib/meta/conversions.ts` (CAPI via `integration_outbox` topic `meta.conversion.send`) para o feedback de conversão.
- Ingestão inteira: `app/api/webhooks/meta/route.ts` → `meta_lead_sources`/`meta_lead_events` → outbox `meta.lead.fetch`.
- Cascata `resolveLeadOwner` + score `predictConversionDetailed` (`atlas-predictive-v2`) — pós-lead, já com `requiresHumanReview`.
- Governança: `approval_requests` + `POST /api/v2/approvals/[id]` (gate de diretor já cobre `meta_budget_change`) + contrato `ActionProposalPayload` de `lib/ai/action-proposals.ts`.
- `andromeda-learning-loop.ts` para prontidão do sinal (não fecha ação — de propósito).
- Connector Windsor `facebook` (`execute_action`) como caminho de escrita (create/pause + set budget).

**CRIAR:**
- Módulo `lib/meta/marketing/` (novo): `builder.ts` (spec JSON → campaign/adset/ad/creative/form), `publish.ts` (orquestra create em ordem, tudo `status:"PAUSED"`, upload de vídeo), e helper **`metaGraphPost(path, form, token)`** com idempotência (hash do `draft_payload`) — hoje `graph.ts` só monta GET.
- Novo env **`META_ADS_MANAGEMENT_TOKEN`** (System User, escopo `ads_management`), separado do read `META_ADS_ACCESS_TOKEN`.
- Extensão do hint map de erro para criação: `200`/`1487xxx`/`spend_cap`.
- Migration: estender `public.campaigns` com `created_by`, `origin ∈ (atlas_ai,human)`, `approval_status`, `approved_by/at`, `budget_cap_daily/lifetime`, `draft_payload jsonb`, e status `DRAFT,PENDING_APPROVAL`. Seed do flag `meta.autonomous_campaigns` em `feature_flags` (org-scoped) **e ler no código** antes de qualquer escrita.
- Rotas: `POST /api/v1/integrations/meta/campaigns` (gera DRAFT + `approval_requests` `request_type:"meta_campaign_launch"`, `entity_type:"meta_campaign"`); ramo de execução em `app/api/v2/approvals/[id]/route.ts` que, no `approved`, valida teto e publica.

## 3. Fluxo passo a passo
1. **Spec** validada; confirmar `inventory_summary` (unidades vendidas: 307/309/313/314/407/611).
2. **Build** — `builder.ts` traduz spec → payloads; `publish.ts` cria **DRAFT/PAUSED**: campaign (`special_ad_category: HOUSING` se exigido) → adset (`daily_budget` capado + `spend_cap`) → leadgen_form → creatives (upload vídeos de `~/Downloads/Spin-Mood-Campanha`) → ads. IDs gravados em `campaigns.draft_payload` + `external_campaign_id`, `approval_status:"pending"`.
3. **Aprovação humana** — pending aparece na Caixa de Aprovações; diretor revisa `payload.action` (objetivo, dailyBudget, criativos, adAccountId).
4. **Publicação** — no `approved`, seguindo o padrão-ouro de `action-proposals.ts` (**executa primeiro, marca approved depois**): valida `dailyBudget ≤ orgCap` (senão 422), flip `PAUSED→ACTIVE`. Só com sucesso marca `approved` + audita em `audit_logs` + `lead_events`. Falha → 502, fica `pending` (retryável).
5. **Monitor** — `buildMetaCampaignIntelligence` + `detectCampaignAnomalies` sobre os leads que entram.
6. **CAPI/otimização** — leads → score → cascata; ao atingir `qualificacao`/`contrato`, emitir `QualifiedLead/ConvertedLead` via `conversions.ts`. Scale para Lookalike 1–3% vira **proposta** (nova `approval_requests`), nunca automático.

## 4. Guardrails
- **Aprovação antes de publicar**: nasce `PAUSED`; ativação só na rota de decisão de diretor.
- **Teto de orçamento**: `budget_cap_daily` na migration + `spend_cap` no ad set; validação `≤ orgCap` (422 se estourar).
- **Auditoria por ação**: cada create/pause/budget em `audit_logs`.
- **Kill-switch**: flag `meta.autonomous_campaigns` por org lido antes de toda escrita.
- **Escopo de token**: `ads_management` só no `META_ADS_MANAGEMENT_TOKEN`.

## 5. Do dono vs meu
**Do dono:** token System User Marketing API com `ads_management` (App Review), `META_AD_ACCOUNT_ID`, conta Business Manager, aprovação da categoria `HOUSING`, e aprovar cada launch/budget na Caixa.
**Meu:** builder/publish, migration, rotas, mapeamento de erro, seed do flag, integração com approvals/CAPI/cascata, e propor (nunca decidir) scale.

## 6. Faseamento incremental
- **F0** — env `META_ADS_MANAGEMENT_TOKEN`, migration de `campaigns`, seed do flag, `metaGraphPost`.
- **F1** — `builder.ts` + dry-run (monta payload, sem rede), espelhando o dry-run de `capi-export`.
- **F2** — `publish.ts` cria DRAFT/PAUSED real + upload vídeos; grava `draft_payload`.
- **F3** — rota de proposta + ramo `approved` com teto → ativa. **1ª campanha vai ao ar aqui.**
- **F4** — CAPI de desfecho + monitor/anomalias. **F5** — proposta de scale Lookalike (gated).

## 7. Riscos honestos
- **Token/App Review** é o gargalo real: sem `ads_management` aprovado, nada publica.
- **`special_ad_category: HOUSING`** restringe idade/gênero/segmentação — pode invalidar `age_min 27`/geo; testar cedo.
- **Estoque desatualizado**: publicar com unidades vendidas gera lead enganoso — checar disponibilidade viva.
- **`execute_action` (Windsor) vs Graph direto**: escolher UM caminho de escrita p/ evitar drift de idempotência.
- **`feature_flags` hoje não é lido por ninguém** — o kill-switch só existe se F0 realmente ler o flag.
- **Schema drift** (23 tabelas vivas vs 127 migrations): confirmar que `campaigns`/`approval_requests`/`audit_logs` existem no banco vivo antes de assumir.

Arquivos-âncora: `lib/meta/graph.ts`, `lib/meta/conversions.ts`, `lib/ai/action-proposals.ts`, `app/api/v2/approvals/[id]/route.ts`, `app/api/webhooks/meta/route.ts`.
