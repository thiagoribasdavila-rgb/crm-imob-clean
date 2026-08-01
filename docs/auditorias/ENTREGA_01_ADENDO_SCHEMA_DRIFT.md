# Adendo à Entrega 01 — Drift de Schema Confirmado (verificação independente)

**Data:** 2026-07-19 · **Gatilho:** verificação decisiva pedida antes de avançar para a Entrega 2, para não confiar cegamente no framework de auditoria não commitado de outra sessão.

## Resumo em uma frase

O banco de produção conectado (`atlas-ai-crm-v1` / `ietwopslgqxlenfyghqk`) tem **23 tabelas reais**; o repositório define **127 tabelas/migrations**, das quais só **33 foram aplicadas** — e **nenhuma das 33 aplicadas existe como arquivo em nenhuma branch deste git** (verificado em `main`, `develop/atlas-v3`, `feat/v3-legacy-conversion-lote1`). O schema vivo foi construído por fora do histórico de migrations deste repositório.

## O que isso muda na Entrega 01

Vários vereditos "real, ~85% funcional" da Entrega 01 foram baseados em **leitura de código**, não em verificação contra o banco vivo. Agora verificado: as migrations que criam as tabelas abaixo **existem no repo, prontas, mas não aplicadas**:

| Tabela ausente no banco vivo | Migration que a cria (não aplicada) | Área afetada |
|---|---|---|
| `conversations`, `campaign_events`, `messages` | `20260711120000_atlas_v2_marketing_automation.sql` | Cliente 360 (timeline), WhatsApp |
| `commercial_simulations` | `20260717003022_commercial_simulations_and_proposals.sql` | Cliente 360 |
| `lead_copilots` | `20260717000240_exclusive_lead_copilot_and_safe_messaging.sql` | Copilot IA (memória estruturada) |
| `lead_transfer_items` | `20260716212459_commercial_hierarchy_and_bulk_transfer.sql` | Cliente 360, hierarquia |
| `portal_lead_sources`, `portal_lead_events` | `20260720000000_portal_lead_ingestion.sql` | Portal de Incorporadoras |
| `meta_lead_sources`, `meta_lead_events` | `20260716222643_meta_lead_closed_loop.sql` | Integração Meta |
| `integration_outbox`, `dead_letter_events` | `20260711060000_atlas_level6_resilience.sql` | **Todo o padrão outbox/DLQ** (workers, cron, confiabilidade) |
| `lead_visits` | `20260717213000_phase_36_visit_sla.sql` | Agenda |
| `pipeline_stage_settings` | `20260717183000_phase_31_canonical_pipeline_stages.sql` | Pipeline/Kanban settings |
| `roles`, `permissions`, `role_permissions`, `user_roles`, `audit_logs` | `20260720010000_rbac_enterprise_foundation.sql` | RBAC |

**Conclusão honesta:** o design está feito e é coerente — não há "código inventado sem plano". O que falta é **aplicar as migrations**. Até lá, boa parte do que classifiquei como "real e funcional" na Entrega 01 vai **falhar em runtime contra este banco específico** (erro de tabela inexistente), mesmo com o código perfeito.

## Por que eu não apliquei as migrations agora

Isto é uma **alteração de banco com 17.151 leads reais em produção** — gatilho explícito da sua Regra 9 ("⚠️ alteração irreversível no banco"). Além disso, minhas ferramentas de escrita no Supabase (`apply_migration`/`execute_sql`) são bloqueadas por permissão — não é só prudência, é um limite físico da minha configuração nesta sessão.

## O que recomendo (decisão sua)

**Aplicar as ~94 migrations pendentes é a ação de maior alavancagem de todo o roadmap** — maior que qualquer entrega individual (2 a 11), porque destrava simultaneamente Cliente 360, Copilot, Meta, WhatsApp, Portal, RBAC e o padrão outbox/DLQ inteiro. Sugiro:

1. Rodar `supabase db push` (ou aplicar via SQL Editor) num **ambiente de staging/branch do Supabase primeiro** — não direto em produção com dado real — para detectar conflitos de nomenclatura (ex.: `crm_projects` vs `developments` citado pela auditoria não commitada) antes de tocar o banco vivo.
2. Fazer backup/snapshot antes de aplicar em produção.
3. Depois de aplicado, eu re-verifico cada área do roadmap contra o schema real (não apenas leitura de código) e corrijo os vereditos da Entrega 01.

## O que fiz nesta sessão em vez de mexer no banco

Sigo para a **Entrega 2 (Cliente 360)** trabalhando apenas em correções de código que não dependem de tabelas ausentes, deixando explícito no relatório da Entrega 2 o que continua bloqueado até a decisão acima.
