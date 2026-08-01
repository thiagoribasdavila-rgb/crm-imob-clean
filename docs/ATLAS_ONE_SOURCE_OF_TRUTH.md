# ATLAS ONE — FONTE ÚNICA DE VERDADE

> **Números oficiais:** `docs/auditoria/INDICADORES_OFICIAIS.md`. Quando este
> documento e aquela tabela divergirem, **a tabela prevalece** — ela carrega o
> comando de reprodução e a data de cada número. Os falsos positivos corrigidos
> estão em `docs/auditoria/REGISTRO_FALSOS_POSITIVOS.md`, com o mecanismo de cada um.

**Estabelecido em 2026-07-30.** Cada afirmação deste documento foi medida, e o comando
que a produziu está ao lado. Onde não foi possível medir, está escrito **não medido** —
que é diferente de zero.

> Este documento existe porque a doença dominante deste repositório é **duas verdades
> para o mesmo fato, calculadas em lugares diferentes**. Ela já apareceu em: `developments`
> × `crm_projects`, RPC × fallback divergindo na chave, `pipeline_history` ×
> `pipeline_stage_moves`, e três painéis do centro de comando somando a mesma lista.
> Quando este documento e o código discordarem, **meça antes de acreditar em qualquer
> um dos dois**.

---

## 1. IDENTIFICAÇÃO OFICIAL

| O quê | Valor | Como foi medido |
|---|---|---|
| **Repositório** | `github.com/thiagoribasdavila-rgb/crm-imob-clean` | `git remote -v` |
| **Branch oficial** | `claude/atlas-v3-entregas` | `git rev-parse --abbrev-ref HEAD` |
| **Commits na branch** | 2.577 | `git rev-list --count HEAD` |
| **Commits sem publicar** | **0** | `git rev-list --count origin/...HEAD` |
| **Projeto Supabase** | `pozbrcsfthnhmnebfoxv` | `.env.local` |
| **Organização real** | `7c8c71c1-e963-464c-be5c-ff8c7936f51a` | maior contagem de leads |
| **Deploy** | PM2 via `ecosystem.config.cjs` | arquivo presente no repo |
| **Variáveis de ambiente** | 86 chaves em `.env.local` | `grep -c '=' .env.local` |

### ⚠️ CORREÇÃO 2026-07-31 — o drift de migrations reportado era falso

Uma versão anterior deste documento tratou o descompasso entre repositório e banco
como drift grande. **Era defeito do comparador**, que normalizava só um dos lados
dos nomes. Medido corretamente: **4** migrations do repositório sem registro, e as
**4 têm seus objetos no schema** — drift de schema **zero**.

O que resta de verdade: **15 migrations existem só no banco**, sem arquivo no
repositório. É por elas que um clone limpo ainda não reconstrói a base — não por
"109". Ver `DIAGNOSTICO_DRIFT_MIGRATIONS.md`.

### ⚠️ O nome do projeto Supabase mente

O projeto se chama **`atlas-v3-homologacao`** e **é produção**. Não existe ambiente de
homologação separado. Toda medição, toda prova comportamental e todo usuário descartável
desta sessão rodaram contra a base viva.

**Consequência prática:** não existe rede de segurança. `supabase db push` está **fora**
— com 171 migrations no repo contra o schema real, ele não é reconstrução, é roleta.

---

## 2. O ESTADO ANTES DE QUALQUER ALTERAÇÃO

### Backup lógico (feito em 2026-07-30 20:52)

```
~/atlas-v3-backups/atlas-v3-20260730-205204.bundle      9,2 MB
~/atlas-v3-backups/nao-rastreados-20260730-205204.tar.gz  196 KB (53 entradas)
```

Bundle verificado com `git bundle verify`: **"The bundle records a complete history."**

**Restauração:**
```bash
git clone ~/atlas-v3-backups/atlas-v3-20260730-205204.bundle atlas-v3-restaurado
cd atlas-v3-restaurado && git checkout claude/atlas-v3-entregas
tar -xzf ~/atlas-v3-backups/nao-rastreados-20260730-205204.tar.gz
```

O tar é **obrigatório** na restauração. Sem ele o clone não tem 20% dos testes nem
seis módulos de IA — ver seção 3.

---

## 3. ⚠️ ACHADO CRÍTICO: 43 ARQUIVOS EXISTEM SÓ NESTA MÁQUINA

Medido com `git status --porcelain | grep '^??'`.

### 3.1 Os testes verdes não são todos reais

**~217 chamadas de `test()` vivem em 11 arquivos fora do git.** A suíte reporta
**1087 testes, 0 falhas** — e cerca de **20% deles não existem num clone limpo**.

O número "1087 verdes" só vale nesta máquina. Qualquer pessoa que clone o repositório
roda uma suíte menor e não sabe disso.

Arquivos: `centro-de-custo-tecnologico`, `gemeo-digital`, `migration-vazia-mente`,
`modo-sombra`, `niveis-de-autonomia`, `previsao-aritmetica`, `regiao-do-cc23`,
`registro-de-modelos`, `rls-em-tabela-nova`, `troca-de-senha-nao-e-silenciosa`,
`uma-pergunta-por-vez` — todos em `tests/contracts/`.

### 3.2 A governança de IA foi construída, não versionada e nunca ligada

Seis módulos, **zero consumidores rastreados** (`git ls-files | xargs grep -l "@/<módulo>"`):

| Módulo | O que é | Consumidores |
|---|---|---|
| `lib/ai/modo-sombra.ts` | **Shadow Mode** | 0 |
| `lib/ai/niveis-de-autonomia.ts` | níveis de autonomia da IA | 0 |
| `lib/ai/registro-de-modelos.ts` | registro/versionamento de modelos | 0 |
| `lib/ai/previsao-aritmetica.ts` | baseline preditivo | 0 |
| `lib/atlas/gemeo-digital.ts` | gêmeo digital de carteiras | 0 |
| `lib/crm/grafo-de-receita.ts` | grafo de oportunidade de receita | 0 |

Shadow Mode, níveis de autonomia e registro de modelos são exatamente os controles que
qualquer decisão automática de IA exige **antes** de ser ligada. Eles existem. Estão
fora do repositório. Ninguém os chama.

### 3.3 Três migrations e cinco rollbacks fora do git

`20260730010000_oferta_ativa_do_acervo_de_resgate`,
`20260730030000_geolocalizacao_inicial_postgis`,
`20260730060000_finops_uso_de_infra` — mais 5 arquivos em `supabase/rollbacks/`.

Um clone limpo não consegue reproduzir o schema.

**Ação obrigatória antes de qualquer entrega nova:** versionar os 43 arquivos (depois de
conferir que não carregam segredo) ou removê-los conscientemente. Trabalho fora do git é
trabalho a uma falha de disco de desaparecer, e um número verde que não se sustenta.

---

## 4. O BANCO — O QUE TEM DADO E O QUE ESTÁ VAZIO

Medido em 2026-07-30, sempre filtrando `organization_id`.

### Com dado real

| Tabela | Linhas | Observação |
|---|---|---|
| `leads` | **482** | 336 nunca saíram de "novo"; 11 com primeiro contato |
| `pipeline_stage_moves` | **160** | **o ledger tem 4 dias**: 27/07 a 30/07 |
| `lead_events` | 66 | 6 tipos; **nenhum** `lead_discarded` |
| `activities` | 161 | `pipeline_stage_changed` |
| `atlas_events` | 295 | `lead.stage_changed` |
| `properties` | 30 | inventário |
| `ai_usage_events` | 43 em 30 dias | custo total **USD 0,011459** |
| `profiles` ativos | **6** reais | 3 broker · 1 director · 2 manager |

### Vazias — e o código lê algumas delas

| Tabela | Linhas | Quem lê, e o que acontece |
|---|---|---|
| `pipeline_history` | **0 no banco inteiro** | `director-daily` calcula capacidade e devolve zero como medição |
| `lead_events` (`lead_discarded`) | **0** | a CAPI da Meta lê daqui para `LeadDisqualified` |
| `opportunities` | 0 | alimentava prontidão e risco da lead (corrigido hoje) |
| `commercial_simulations` | 0 | ninguém nunca simulou |
| `lead_experience_signals` | 0 | sem escritor |
| `marketing_spend` · `campaigns` · `meta_daily_reports` · `product_budgets` | **0** | **CPL, ROAS e comparação de campanha são irrespondíveis** |
| `conversion_feature_snapshots` | 0 | sem base para treinar modelo |
| `broker_capacity_limits` | 0 | coluna "teto aplicado" morta em 100% das telas |

**Leitura honesta:** metade dos indicadores que uma plataforma imobiliária premium
mostraria **não tem dado do outro lado**. A resposta certa é a tela dizer isso, não
preencher com número de exemplo.

---

## 5. FONTE ÚNICA DE MOVIMENTAÇÃO — DECIDIDO EM 2026-07-30

**`public.pipeline_stage_moves` é a fonte canônica.**

O critério não é preferência: é **ser escrita na mesma transação que `leads.status`**. A
RPC `move_pipeline_lead` grava `pipeline_stage_moves`, atualiza `leads`, e grava
`activities` e `atlas_events` — tudo atômico (`pg_get_functiondef`). `lead_events` e
`pipeline_history` eram escritas de aplicação, best-effort, **depois de um `return` que
sempre acontece**. Escrita fora da transação pode falhar sozinha e produzir lead movida
sem registro. Por construção, não pode ser a verdade.

Regras que valem para qualquer tela nova:

- `perdido` **e** `comprou_outro` contam como saída. Separá-las faz uma tela divergir da outra.
- Contagem **líquida de reversão**: conta se o `id` não aparece como `reversal_of` de outro.
- A coluna de tempo é **`occurred_at`** — não existe `created_at` nessa tabela.
- O ledger começa em **2026-07-27 13:55**. 8 leads em estado de saída são anteriores e
  **declaradas à parte**. Reconciliação: 104 + 8 = 112.

**Pergunta em aberto:** `pg_stat_user_tables` mostra 332 inserts e **149 deletes** em
`pipeline_stage_moves`, e 11 `atlas_events` apontam um `moveId` inexistente. **Não há
`DELETE` dessa tabela em arquivo nenhum do repositório.** Até isso ser explicado, nenhuma
tela pode afirmar auditoria imutável.

---

## 6. INTEGRAÇÕES — ESTADO MEDIDO

| Integração | Estado | Evidência |
|---|---|---|
| **Meta — ingestão de leads** | funciona | 195 leads com `source=meta_ads` |
| **Meta — CAPI `LeadDisqualified`** | **CEGA** | lê `lead_events/lead_discarded` = **0 linhas**. A Meta nunca recebeu sinal de lead desqualificada — o algoritmo dela otimiza sem saber quais leads foram ruins |
| **Meta — página do anúncio** | **BLOQUEADA** | 15 anúncios ativos publicam na página `1115087091694606`; o CRM escuta `582258611872380` |
| **Meta — verba** | **ESGOTADA** | teto e gasto iguais |
| WhatsApp | não medido nesta rodada | — |
| SMTP / e-mail | não medido nesta rodada | — |

---

## 7. O QUE ESTÁ PROVADO POR EXECUÇÃO

Provas comportamentais que rodam contra o banco vivo, com usuário descartável e limpeza
conferida:

| Script | Cobre | Resultado |
|---|---|---|
| `prova-motivo-do-descarte.mjs` | os dois lados da guarda de descarte | 12/12 |
| `prova-relatorio-de-descartes.mjs` | cada número do relatório vs banco | 16/16 |
| `prova-funil-da-sala-de-comando.mjs` | etapas vêm da configuração da empresa | 19/19 |
| `prova-oportunidades-da-lead.mjs` | recorte por org **e** por lead | 10/10 |
| `prova-dia-do-corretor.mjs` | o dia inteiro do corretor, ponta a ponta | 20 verificações |

**Portões de verificação:** 220, todos verdes (`npm run portoes:todos`).

**Ressalva obrigatória:** portão verde não é prova de qualidade. Nesta mesma sessão uma
entrega passou 605 contratos e 51 mutações **e estava errada** — só a refutação
adversarial pegou. E 20% dos contratos não existem num clone (seção 3.1).

---

## 8. ROLLBACK

| Alteração | Como reverter |
|---|---|
| Código | `git revert <sha>` — a branch tem 0 commits sem publicar, todo estado é recuperável |
| Migration `20260730160000` (motivo do descarte) | rollback no cabeçalho do próprio arquivo: `DROP COLUMN discard_reason_key, discard_notes` + `DROP INDEX idx_psm_discard_reason`. Seguro: nenhum dado pré-existente depende delas |
| Repositório inteiro | bundle da seção 2 |
| Dados | **não há rollback de dado.** A base é produção, sem ambiente espelho. Toda alteração de dado nesta sessão foi feita com usuário descartável e limpeza conferida por contagem antes/depois |

---

## 9. PENDÊNCIAS QUE DEPENDEM DE DECISÃO HUMANA

Estas **não** são trabalho de engenharia parado — são decisões que só o dono toma:

1. **Página da Meta `1115087091694606`** liberada ao System User, **antes** de recarregar
   verba. Sem isso, lead paga não chega ao CRM.
2. **Política de SLA de primeiro contato**: hoje convivem três valores no banco
   (15 min em 469 leads, 1440 em 10, 5 em 3) e `first_contact_sla_policies` está vazia.
3. **Nível de autonomia** de cada ação de worker com efeito externo.
4. **Os 31 registros de auditoria** das contas de teste: apagá-los libera a remoção de 17
   perfis; mantê-los preserva a trilha. As contas já estão **desativadas**.
5. **Acesso ao servidor** para instalar o crontab dos workers.

---

## 10. COMO ESTE DOCUMENTO SE MANTÉM HONESTO

Ele **não** é atualizado por leitura de código. Cada linha aqui tem um comando ao lado, e
a regra é: se você não rodou o comando, não mude a linha. Documento de estado que
contradiz a medição é pior que documento ausente — o repositório já teve um `GO-LIVE.md`
mandando dar `db push` em produção viva.
