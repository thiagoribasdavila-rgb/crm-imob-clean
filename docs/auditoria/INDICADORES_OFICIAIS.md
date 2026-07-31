# INDICADORES OFICIAIS

**Fonte única de números do ATLAS ONE.** Quando qualquer outro documento divergir
desta tabela, **esta prevalece** — e o outro está obsoleto.

Verificação: **2026-07-31**. Commit: `15851336`.

---

## MIGRATIONS

| indicador | valor | fonte | comando | confiança |
|---|---:|---|---|---|
| No repositório | **177** | `supabase/migrations/*.sql` | `ls supabase/migrations/*.sql \| wc -l` | **alta** |
| Registradas no banco | **223** | `supabase_migrations.schema_migrations` | `select count(*)` | **alta** |
| Nomes distintos no banco | **218** | idem | `count(distinct name)` | **alta** |
| Reaplicações | **30 nomes**, 5 linhas extras | idem | agrupamento por nome | **alta** |
| Pareadas por nome normalizado | **173** | ambos | `/api/v1/ready` → `migrations` | **alta** |
| Equivalências declaradas | **4** | `config/migrations-equivalencias.json` | leitura do arquivo | **alta** |
| Somente no banco | **15** | ambos | diferença de conjuntos | **alta** |
| Somente no repositório, sem objeto | **0** | schema real | `pg_proc`, `pg_views`, `information_schema` | **alta** |
| Ambíguas (tocam GRANT/RLS/trigger) | **4** das 15 | leitura dos `statements` | — | **média** |
| **DRIFT REAL DE SCHEMA** | **0** | objeto por objeto | ver `MATRIZ_MIGRATIONS_REPO_BANCO.md` | **alta** |

## TESTES

| indicador | valor | fonte | confiança |
|---|---:|---|---|
| Executados | **1114** | `npm run test:contracts` | **alta** |
| Aprovados | **1105** | idem | **alta** |
| Falharam | **0** | idem | **alta** |
| **Pulados** | **9** | idem | **alta** |
| Arquivos de contrato | **95** | `ls tests/contracts/` | **alta** |
| Criados nesta sessão | **15** | `git diff --diff-filter=A` | **alta** |
| Dependentes de `.env.local` | **8** | grep por credencial | **alta** |
| Portões de verificação | **220/220** | `npm run portoes:todos` | **alta** |

> **Os 9 pulados não são aprovados.** São a PARTE A de
> `geolocalizacao-em-metros`, que exercita PostGIS no banco real e pula quando o
> ambiente não traz credencial. A PARTE B (SQL do repositório) roda sempre. Contar
> 1114 como "tudo verde" esconderia 9 asserções sobre comportamento de banco
> que **nunca rodam** na cadeia padrão.

## MÓDULOS DE IA

| indicador | valor | confiança |
|---|---:|---|
| Total | **8** | **alta** |
| A. funcional e habilitado | **0** | **alta** |
| B. funcional e desligado | **2** — `registro-de-modelos`, `gemeo-digital` | **alta** |
| C. parcialmente conectado | **1** — `previsao-aritmetica` | **alta** |
| D. órfão | **5** | **alta** |
| E. somente estrutura · F. inseguro | **0** · **0** | **alta** |
| Com provider de IA | **0** | **alta** |
| Que escrevem em `leads` | **0** | **alta** |
| Com feature flag | **0** | **alta** |
| Custo de IA (30 d) | **USD 0,011459** em 43 eventos | **alta** |

## CÓDIGO E DIFF

| indicador | valor | confiança |
|---|---:|---|
| Divergência vs `main` | **236.839 +** · 17.262 − · 2021 arquivos | **alta** |
| Commits vs `main` | **893** | **alta** |
| Alterações desta sessão | **15.511 +** · 31 − · 70 arquivos | **alta** |
| Artefatos gerados rastreados | **0** | **alta** |
| Segredos (conteúdo + histórico) | **0** | **alta** |
| `security:secrets` | PASSED — 2540 arquivos | **alta** |
| **Arquivos vazios rastreados** | **414** | **alta** |
| Vazios importados por código vivo | **0** | **média** — amostra de 20 |
| Árvore de trabalho | 0 pendências | **alta** |

## OPERAÇÃO

| indicador | valor | confiança |
|---|---|---|
| Fila: entregues · falhados | **6** · **2** | **alta** |
| Os 2 falhados são lead real? | **NÃO** — IDs sintéticos | **alta** |
| Cron instalado no servidor | **NÃO** | **alta** |
| Produção declara `build.commit` | **NÃO** — build antigo | **alta** |
| Estado da prontidão em produção | **desconhecido** — campo ausente | **alta** |
| Leads · com primeiro contato | **482** · **11** | **alta** |
| Perfis ativos reais | **6** | **alta** |
| Anúncios ativos · página que o CRM lê | **19** · **outra** | **alta** |

---

## ATUALIZAÇÃO 2026-07-31 (rodada F3–F8) — o que mudou de número

Cada linha abaixo foi medida DEPOIS das entregas desta rodada. Onde o número
anterior continua correto, ele não aparece aqui.

| indicador | antes | agora | como medir de novo |
|---|---:|---:|---|
| linhas em `marketing_spend` | 0 | **94** | `select count(*) from marketing_spend` |
| investimento registrado | R$ 0 | **R$ 3.612,01** | `select sum(amount) from marketing_spend` |
| campanhas em `marketing_campaigns` | 1 | **8** | `select count(*) from marketing_campaigns` |
| linhas em `ai_shadow_decisions` | 0 | **20** (todas retidas, 0 executadas) | `select count(*), count(*) filter (where retido) from ai_shadow_decisions` |
| linhas em `conversion_feature_snapshots` | 0 | **370** | `select count(*) from conversion_feature_snapshots` |
| módulos de IA órfãos | 5 (medido errado) | **1** — só `grafo-de-receita` | ver FP-07 |
| workers agendados | 11 | **13** | `config/workers-schedule.json` |
| rotas de worker no contrato | 17 | **19** | `config/api-security-contract.json` |
| contratos executados | 1.114 | **1.191** | `npm run test:contracts` |
| contratos aprovados | 1.105 | **1.182** | idem |
| contratos **pulados** | 9 | **9** | idem — continuam os mesmos 9 de PostGIS |
| portões | 220/220 | **220/220** | `npm run portoes:todos` |
| falsos positivos registrados | 6 | **7** | `REGISTRO_FALSOS_POSITIVOS.md` |

### O número que NÃO mudou, e é o mais importante

**Leads atribuídas às 7 campanhas que gastaram R$ 3.612,01: ZERO.**

As 24 leads com campanha de origem vêm de `120251113236400624`, que **não
pertence** à conta de anúncios `act_2169318190556460` configurada no CRM — a
Graph API recusa a consulta dela com `(#10) Application does not have
permission`, e ela não está entre as 10 campanhas daquela conta.

Existem pelo menos **duas contas de anúncio**, e a que o CRM lê não é a que
produziu as leads que o CRM tem. Custo por lead **não é calculável** hoje, e o
produto passa a dizer isso em vez de estampar R$ 150,50.

### Estado da produção — inalterado

`/api/v1/ready` continua **sem declarar** `build`, `estado`, `filas` nem
`migrations`. Nada desta rodada está no ar. Medir com:

```bash
npm run commit-publicado:check
```
