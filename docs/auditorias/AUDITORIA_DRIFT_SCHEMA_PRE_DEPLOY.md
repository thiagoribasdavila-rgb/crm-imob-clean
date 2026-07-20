# Auditoria de drift de schema — pré-deploy

**Data:** 2026-07-20
**Banco vivo:** `atlas-ai-crm-v1` (`ietwopslgqxlenfyghqk`) · Postgres 17.6 · região us-west-2
**HEAD auditado:** `742716e4`
**Método:** somente leitura (MCP Supabase `list_tables`/`list_migrations` + grep no repo). Nenhuma alteração executada.

---

## 1. Números do drift

| Eixo | Repo (HEAD) | Banco vivo | Gap |
|---|---|---|---|
| Migrations (versões distintas) | 124 | 33 aplicadas | **124 não aplicadas** |
| Corte do histórico aplicado | — | `20260716083708` (16/07) | tudo depois é cauda nova |
| Tabelas públicas | ~139 criadas por migrations | **23** | ~116 ausentes |
| Tabelas consultadas no código do HEAD | 129 distintas | 13 existem | **116 quebram em runtime** |
| Leads reais no banco | — | **17.151** | (dado histórico já presente) |

As 124 migrations não aplicadas se dividem em:
- **110 pós-corte** — o build inteiro de 16/07 (noite) → 20/07: waves 6+, phases 40–99, portais, RBAC enterprise, WhatsApp, meta/andromeda, developments, importação de inventário, etc.
- **14 pré-corte** — as foundation `20260711*` + `20260712000000_atlas_ai_memory`. **Nunca foram registradas no histórico**, mas as tabelas-base que elas criam (leads, profiles, organizations, lead_events…) **já existem** no banco. Ou seja: o banco foi construído por um caminho que não gravou essas migrations no histórico.

## 2. Superfície de quebra (o que importa para o deploy)

O código do HEAD consulta **129 tabelas**; **116 não existem** no banco vivo. Impacto por área:

- **Funciona hoje (23 tabelas):** login → dashboard → leads → pipeline → command-center → import_batches → marketing_campaigns/spend → knowledge. O **núcleo do CRM opera** (os 17.151 leads são reais).
- **Quebra se navegado (ausentes):** inteligência de marketing/robô Meta (`meta_*`, `campaigns`, `creative_*`, `conversion_*`), portais (`portal_lead_*`), WhatsApp/mensageria (`whatsapp_*`, `messages`, `conversations`), RBAC admin (`roles`, `permissions`, `user_roles`), developments/imóveis (`developments`, `properties`, `developers`, `inventory_import_*`), aprovações/integrações/auditoria (`approval_requests`, `integrations`, `audit_logs`), reativação/transferência de leads, e toda a camada de IA avançada (`ai_*`, `atlas_*`, `prediction_drift_reports`).

**Tradução:** um deploy contra o banco atual entrega um **CRM-núcleo funcional**, mas ~116 telas novas dariam erro 500 por tabela inexistente.

## 3. Segurança da sincronização (verificado linha a linha na cauda de 110)

| Verificação | Resultado |
|---|---|
| `drop table` | **0** |
| `drop column` | **0** |
| `truncate` real | **0** (o único match era `REVOKE ... truncate ...`, uma concessão de privilégio) |
| `delete from` fora de função | **0** (os 5 deletes estão dentro de corpos de RPC, sobre tabelas efêmeras: `messaging_suppressions`, `idempotency_keys`, `api_rate_limit_buckets`, `lead_identity_registry`) |
| Toques na tabela `leads` | só `add column if not exists` + `add/drop constraint if exists` + RLS. **Aditivos.** |
| `create table` | 108 (98 com `if not exists`; 10 "bare", mas de tabelas novas → sem conflito na 1ª aplicação) |

**Veredito:** a cauda é **aditiva e não-destrutiva** aos 17.151 leads. O risco não é perda de dados — é **falha/estado parcial** se um statement não-idempotente encontrar objeto inesperado ou uma dependência de ordem quebrar.

## 4. ⚠️ `supabase db push` simples NÃO funciona aqui

Como o histórico aplicado (33) não bate com o repo (124), um `db push` tentaria aplicar **todas** as 124 faltantes **a partir de `20260711040000_atlas_v3_foundation`** — que faz `create table public.leads (...)` sem `if not exists`. Como `leads` já existe → erro `relation already exists` → **push aborta no primeiro arquivo**. Portanto o mecanismo de sync precisa ser deliberado (reparar histórico, ou aplicar em base limpa), não um push cego.

## 5. Regra de ouro desta operação

- **Backup antes de qualquer aplicação.** Banco atual preservado para rollback.
- **Aplicação de migrations é ação do usuário** (minhas ferramentas de escrita em banco estão fora de escopo por protocolo). Eu preparo comandos, lista ordenada e checklist; valido por leitura depois.
- Nada destrutivo. Nenhuma planilha importada nesta fase.

## 5-bis. 🔴 ACHADO CRÍTICO — o repo NÃO reconstrói o banco do zero

Ao validar a cadeia para "apply do zero" (premissa da homologação limpa), dois fatos derrubam essa mecânica:

1. **A foundation é um stub de comentário.** `20260711040000_atlas_v3_foundation.sql` tem 11 linhas, **zero DDL**. O schema-base (`organizations`, `profiles`, `leads`, `customers`, `tasks`, `activities`…) foi aplicado **direto num projeto Supabase diferente** (`crm-imob-clean` / `pvvdfqbkqhfifylzgbkq`) e **não está reproduzível** por nenhum arquivo do repo. Ele só existe hoje dentro do banco vivo.

2. **A cadeia tem FKs pendentes (dangling).** Migrations das phases (17→20/07) referenciam por FK tabelas que **nenhuma migration cria e a prod não tem**: **`developments`, `campaigns`, `properties`, `opportunities`, `ai_insights`, `units`**. Ex.: `... references public.developments(id)` em phase_57/63/64; `... references public.campaigns(id)` em lead_attribution_touches. Um apply real pararia nesses FKs.

**Consequência:** as ~110 migrations pós-corte foram **escritas mas nunca aplicadas a Postgres real algum** (coerente com o histórico aplicado parar em 16/07). Elas não formam um schema válido e auto-contido.

### Mecânica corrigida para "homologação limpa"
Aplicar o repo num banco vazio **falha** (sem base + FKs pendentes). O caminho fiel e seguro é:

- **Homolog = restauração de um dump do schema da produção atual** (`pg_dump` do `ietwopslgqxlenfyghqk`), não replay das migrations. Assim o homolog reflete exatamente o que funciona hoje (23 tabelas, RLS, funções), numa nova URL, com **produção 100% intocada**. Isso satisfaz "garantir banco, tabelas e CRM-núcleo funcionando".
- **Ligar as 116 tabelas de feature é um projeto de remediação** (na minha alçada, no repo): criar as 6 tabelas-base ausentes (`developments`, `campaigns`, `properties`, `opportunities`, `ai_insights`, `units`) com as colunas que os FKs exigem, resolver as pendências, e validar a cadeia inteira contra um Postgres real **antes** de aplicar em qualquer lugar. Não é `apply` mecânico.

## 6. Manifesto

Lista completa das 124 migrations faltantes (110 pós-corte + 14 pré-corte) gerada em
`scratchpad/migrations-faltantes.txt` — vira anexo do plano de sync assim que o alvo do banco for decidido.
