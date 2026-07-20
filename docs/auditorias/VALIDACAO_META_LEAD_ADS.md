# Validação — Integração Meta Lead Ads

**Data:** 2026-07-20 · **Método:** leitura do código (rota→outbox→worker→lead), presença de env (sem expor valores), testes funcionais reais contra o dev server local (mesmo código do deploy), cruzamento com o banco oficial. **Nada de arquitetura foi alterado.**

## Veredito por item

| # | Item | Veredito |
|---|---|---|
| 1 | Rota `/api/webhooks/meta` em produção | ⚠️ **Produção ainda não existe** (deploy Tier-1 pendente; sem URL pública para a Meta chamar). Localmente, mesmo código: **GET handshake ✅** (200 + eco do challenge; 403 com token errado). POST hoje → 503 (item 4). |
| 2 | `META_WEBHOOK_VERIFY_TOKEN` correta | ✅ Presente no env e **provada em funcionamento** — o handshake real passou usando o valor do env (valor nunca exibido). |
| 3 | `META_LEAD_ACCESS_TOKEN` configurada | ✅ Presente no env; é usada pelo worker (`/api/v2/outbox/process`) no fetch ao Graph API (retry+timeout). A validade junto à Meta só se prova com chamada real (não fiz chamada externa). |
| 4 | Processamento do leadgen | ✅ Código correto e defensivo: assinatura HMAC-SHA256 (`META_APP_SECRET`), rate-limit local + distribuído, dedupe (23505), `unmapped` honesto, outbox. ❌ **Hoje bloqueado no banco**: o guard distribuído chama a RPC `consume_api_rate_limit` (phase_19) que **não existe** no oficial → **POST responde 503** (falha-fechado, comprovado no teste assinado). Destravado o guard, cairia em `unmapped` (tabela `meta_lead_sources` inexistente + nenhum mapeamento cadastrado). |
| 5 | Criação automática do lead | ✅ Código: cron 2min → worker consome `integration_outbox` (`meta.lead.fetch`) → Graph API → cria em `leads` (dedupe por `metadata.meta.externalLeadId`) + `campaign_events`; falha vai a `dead_letter_events` com `last_error`. ❌ **Hoje impossível**: depende de `meta_lead_events`, `integration_outbox`, `campaign_events`, `dead_letter_events` e da coluna `leads.metadata` — **nenhum existe no oficial**. |
| 6 | Distribuição RBAC (Thiago diretor > gerentes > corretores) | ⚠️ **Gap de design (não de bug)**: o caminho Meta atribui apenas `meta_lead_sources.default_owner_id` (dono padrão por página/formulário) ou **null** (fila geral). **Não há cascata hierárquica automática** neste fluxo. A distribuição hierárquica (respeitando `reports_to`, capacidade, presença) existe como RPCs (`balanced_project_lead_distribution` etc.) usadas em outros fluxos/ações. Ligar o engine ao worker = mudança de arquitetura → **não fiz** (instrução sua); ver "Decisão em aberto". |

## Testes executados (dev server local)

```json
[
 { "teste": "GET handshake token correto",  "status": 200, "ecoOk": true },
 { "teste": "GET token errado",             "status": 403 },
 { "teste": "POST leadgen assinado (HMAC)", "status": 503, "corpo": { "error": "Proteção contra abuso indisponível." } },
 { "teste": "POST assinatura inválida",     "status": 503 }
]
```
O 503 nos dois POSTs vem do guard fail-closed **antes** da checagem de assinatura — comportamento seguro (nada entra sem o rate-limit distribuído funcional), e a causa é a RPC ausente no banco, não o código.

## Causa raiz única

**Todas as pendências convergem para a cadeia de 66 migrations já validada em cópia isolada** (`docs/deploy/VALIDACAO_ISOLADA_RESULTADO.md`). Conferido item a item: `meta_lead_sources`/`meta_lead_events` ← `meta_lead_closed_loop` ✓ na cadeia; `integration_outbox`/`dead_letter_events` ← `level6_resilience` ✓; `campaign_events` ← `marketing_automation` ✓; `leads.metadata` ← bridge ✓; RPC `consume_api_rate_limit` ← `phase_19_abuse_protection` ✓.

## O que falta para "funcionando em produção" (em ordem)

1. **Aplicar a cadeia 66 no oficial** (com backup — já aprovada). Destrava POST, persistência, worker e lead.
2. **Deploy da app na URL pública** (Tier-1 do runbook) — sem isso a Meta não tem endereço.
3. **Configurar o webhook no painel da Meta**: URL `https://<dominio>/api/webhooks/meta`, verify token = `META_WEBHOOK_VERIFY_TOKEN`, campo `leadgen` — o handshake vai passar (provado).
4. **Cadastrar `meta_lead_sources`** (page_id → organização → `default_owner_id`): sem mapeamento, todo lead cai em `unmapped` (por design, sem retry infinito).
5. **Cron dos workers ativo** no VPS (`run-workers.mjs` a cada 2min — o go-live já configura).

## Decisão em aberto (sua)

**Distribuição hierárquica no caminho Meta:** hoje o lead entra com o dono padrão da fonte (ou fila). Se quiser a cascata automática (diretor→gerentes→corretores por capacidade/presença), o ponto de integração natural é o worker chamar a RPC de distribuição quando `default_owner_id` for null — **mudança pequena porém de arquitetura**, que só faço com seu OK explícito.

## Correções de código necessárias encontradas

**Nenhuma.** O código da rota e do worker está correto e defensivo; os bloqueios são de **estado de banco** (cadeia não aplicada) e **configuração externa** (deploy, painel Meta, mapeamento de fontes).
