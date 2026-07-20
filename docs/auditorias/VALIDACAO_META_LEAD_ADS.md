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
| 6 | Distribuição RBAC (Thiago diretor > gerentes > corretores) | ✅ **RESOLVIDO (2026-07-20, aprovado pelo usuário)**: cascata hierárquica em `lib/distribution/hierarchical-cascade.ts`, ligada aos DOIS caminhos (Meta e portais) no worker. Ordem: dono padrão VALIDADO (ativo) → corretor disponível com cadeia íntegra, menor carga, dentro da capacidade (empate = há mais tempo sem receber) → gerente segura a fila → fila geral. Auditoria em lead_distribution_history + motivo explicável em leads.metadata.distribution. Testada adversarialmente: 6/6 cenários. |

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

## Decisão em aberto (RESOLVIDA)

~~Resolvida acima~~ — o usuário aprovou ("fazer, deixar 10/10") e a cascata foi implementada nos dois caminhos, com validação do dono padrão (antes atribuía às cegas a perfil possivelmente inativo).

**Nenhuma.** O código da rota e do worker está correto e defensivo; os bloqueios são de **estado de banco** (cadeia não aplicada) e **configuração externa** (deploy, painel Meta, mapeamento de fontes).
