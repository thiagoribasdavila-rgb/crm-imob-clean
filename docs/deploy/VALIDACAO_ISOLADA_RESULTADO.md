# Validação isolada das migrations RBAC — resultado

**Data:** 2026-07-20 · **Método:** Caminho A adaptado (sem Docker) — **PGlite** (Postgres em WASM) + schema REAL do banco oficial extraído via MCP (23 tabelas, 250 colunas, 117 constraints, 6 funções, 7 triggers) + a cadeia aplicada em ordem + queries de aceitação + o roster real pelo trigger real.
**Banco oficial `ietwopslgqxlenfyghqk`: INTOCADO** (só leitura via MCP para montar a cópia).

## Resultado: ✅ 66/66 aplicam limpo · roster aprovado pelo trigger real

- **Cadeia:** 66 migrations, todas aplicadas sem erro (`failedAt: null`).
- **Aceitação:** `profiles` com `access_role`/`commercial_role`/`reports_to`/`full_name` = **true**; `organizations.active` = **true**; `access_role` CHECK = `('admin','director_decisor','director','broker')`; triggers `validate_commercial_hierarchy` + `protect_profile_authorization_fields` presentes; 5 tabelas canônicas criadas; 93 tabelas no total.
- **Roster (prova de ouro — inserido pelo trigger real):** Thiago (director_decisor/director, raiz) ✅ · Senna/Diego/Luciano (director/manager → Thiago) ✅ · Adolfo (broker → Diego) ✅. Zero violação de hierarquia.

Evidência bruta: `docs/deploy/evidence/validacao-isolada-report.json`.

## Migrations que falharam → causa → correção

A validação rodou como um loop "aplica até o 1º erro". Nenhuma migration histórica foi editada — **todas as correções foram concentradas na migration de remediação `20260716210000_atlas_v3_canonical_base_tables.sql`**, mais reordenação/inclusão de dependências na cadeia. 6 bugs reais do repo, que teriam quebrado o apply direto no oficial:

| # | Onde quebrou | Causa raiz | Correção (na remediação) |
|---|---|---|---|
| 1 | remediação | toda a cauda usa `public.current_organization_id()`, mas o hardening `20260715032525` a removeu (só existe `private.`) | recriada como wrapper fino da privada, com revoke de anon/public |
| 2 | `atlas_level6_resilience` | policies de `feature_flags` usam `public.current_user_role()` — ninguém cria | criada (plpgsql; papel normalizado minúsculo, fallback no role legado) |
| 3 | `broker_lead_360_related_scope` (+3) | policies org-scoped sobre `activities`, mas a tabela legada V1 não tem `organization_id`/`user_id`/`metadata`/`occurred_at` | 4 colunas adicionadas + índices (0 linhas na prod → seguro) |
| 4 | `phase_17_rls_isolation_audit` | índice sobre `profiles.manager_id`, coluna **fantasma** (phases 54/55 só têm `p_target_manager_id` como parâmetro) | `manager_id` uuid FK nullable adicionada |
| 5 | roster (script) | reset lê `organizations.active`, mas a tabela só tem `status` | `active` como coluna **gerada** de `status` (read-only) |
| 6 | roster (1º insert) | `profiles_role_check` legado exige PT-BR maiúsculo; código novo + reset gravam inglês minúsculo; `official_auth_rbac` esqueceu do role legado | CHECK relaxado para a **união** PT-BR + inglês (mantém os 4 legados válidos) |

**Ordenação/dependências da cadeia (de 57 → 66):** a lista "57" estava incompleta. O apply real exige, antes da cauda: a remediação e o bridge (`full_name`) no topo; as 2 migrations de auth (`harden_auth_profile_provisioning` + `grant_auth_trigger_execution`, que criam `user_provisioning_failures` e o trigger de provisionamento); e 5 migrations foundation pré-corte (`level6_resilience`, `v2_marketing_automation`, `v3_unification`, `atlas_2030_foundation`, `atlas_2030_operational_completion`) que criam tabelas que a cauda referencia por FK (`integrations`, `conversations`, `messages`, `atlas_entities/relationships/events`, `atlas_inventory_reservations`, `idempotency_keys`, `integration_outbox`…). Ordem final em `docs/deploy/rbac-chain.txt` (66).

## Limitações honestas da cópia (desvios do lab, não do apply real)

1. **`create extension` removido** e **`'portuguese'` → `'simple'`** no text search — limitações do PGlite (pgcrypto e o dicionário pt-BR não vêm no bundle WASM). No Supabase real ambos existem; não são problema do apply.
2. **Índices não-constraint e policies RLS pré-existentes** das 23 tabelas **não** entraram na cópia (extraí colunas/PK/FK/CHECK/UNIQUE/funções/triggers). Uma colisão de NOME de índice/policy é teoricamente possível — mitigada porque as migrations usam `create index if not exists` e `drop policy if exists` antes de criar. **A confirmação final é o apply real** (ou uma branch Supabase).

## Aprovação para aplicar no oficial

✅ **Liberado para aplicar no banco oficial**, na sequência de segurança já documentada (`BACKUP_E_VALIDACAO_ANTES_DAS_MIGRATIONS.md`):
1. **Backup** (snapshot Supabase ou `pg_dump -Fc`) — obrigatório, os 17.151 leads são reais.
2. Aplicar a cadeia de `docs/deploy/rbac-chain.txt` no oficial (loop `psql`, `ON_ERROR_STOP=1`).
3. `ATLAS_AUTH_ORGANIZATION_ID=8523bec1-1bef-4395-92ee-7458becc9b3f` (Atlas AI CRM).
4. Dry-run do reset (`hierarchyValidated:true`) → criação por link.

Se o loop no oficial parar em algo que a cópia não previu (índice/policy pré-existente), me manda o arquivo+erro — é correção pontual.
