# Deploy para 100% — o que falta, medido

Tudo aqui foi medido no banco vivo (`pozbrcsfthnhmnebfoxv`) e na produção
(`https://atlasaios.com.br`) em **03/08/2026**. Nada é estimativa.

Cada item diz **quem executa**: o que depende de credencial, DDL em produção ou
acesso ao painel da Hostinger é seu; o resto já está no repositório.

---

## 0. O que a produção diz de si mesma agora

`GET https://atlasaios.com.br/api/v1/ready` responde:

```
status: ready · estado: unknown · estadoExigeAcao: true
motivo: "Não dá para afirmar que o agendamento executa: nenhum item elegível na
         fila para observar. E há 10 item(ns) em failed/dead_letter, que não
         saem sozinhos."
migrations: aplicadasNoBanco 231 · noRepo 183 · emDia true · faltandoTotal 0
filas: total 34 · precisaDeAtencao true
```

**`migrations.emDia: true` está correto e não significa "nada pendente".** A
rota compara o banco com a lista que o BUILD EM PRODUÇÃO embutiu — 183 nomes. As
7 migrations abaixo vieram depois desse build: elas pertencem a código que ainda
não subiu, e sobem junto com ele.

---

## 1. As 7 migrations pendentes

Conferidas uma a uma contra `supabase_migrations.schema_migrations`, comparando
**por nome** (o banco grava `version` como o carimbo de quando aplicou, não o
prefixo do arquivo — comparar número dá falso vermelho permanente).

| # | arquivo | o que destrava | aplicar é seguro? |
|---|---|---|---|
| 1 | `20260802140000_causa_da_falha_de_ia` | `ai_orchestration_decisions.error_class` — traduz falha de IA em ação (credencial/cota é do dono, configuração é do time técnico) | sim, `add column if not exists` |
| 2 | `20260802160000_consentimento_como_o_worker_le` | 2 RPCs que contam consentimento pelo MESMO predicado do trabalhador noturno | sim, só cria função |
| 3 | `20260802210000_braco_do_experimento` | `ai_sales_journeys.braco` e `.coorte` | sim, `add column if not exists` |
| 4 | `20260802230000_modo_de_producao_aceito_no_capi` | abre `meta_conversion_configs.mode` para `('test','live')` | **confira antes** — ver §1.1 |
| 5 | `20260803000000_uma_unica_normalizacao_de_telefone` | uma só normalização de telefone; hoje cada caminho faz a sua e a mesma pessoa entra duas vezes | sim, mas ver §1.2 |
| 6 | `20260803010000_rpcs_do_lead_360_param_de_gravar_calado` | as RPCs do Lead 360 param de gravar atividade sem conferir se a linha existe | sim |
| 7 | `20260803020000_conversa_unica_por_thread` | índice único `(organization_id, external_thread_id)` | sim, ver §1.3 |

**Nenhuma delas está quebrando a produção hoje.** Verifiquei os três consumidores:
`/api/v1/ai/prontidao-para-ligar` marca o item como *não medido* com o motivo (e
nomeia o arquivo da migration) em vez de zero; `provider-router` registra um
`warn` nomeando a migration; e o braço do experimento grava em
`context_snapshot` de propósito, "contra o banco que existe". São funcionalidades
**dormentes**, não defeitos vivos.

### 1.1 A do CAPI — o estado atual

```sql
-- devolve CHECK ((mode = 'test'::text)) hoje
select pg_get_constraintdef(c.oid) from pg_constraint c
join pg_class t on t.oid = c.conrelid
where t.relname = 'meta_conversion_configs' and c.contype = 'c';
```

Enquanto ela não for aplicada, "ir para produção" no painel devolve **409**
nomeando este arquivo (antes devolvia 503 com o texto cru do Postgres, mandando
o diretor tentar de novo para sempre).

### 1.2 A do telefone — o `delete` é de tabela DERIVADA

A migration faz `delete from lead_identity_registry where identity_type='phone'`
e reconstrói. **Não apaga dado de lead.** Conferido: 488 linhas de telefone no
registro para 489 leads com telefone — a reconstrução recupera a que está de
fora.

### 1.3 A do índice único — pré-checagem obrigatória

```sql
-- precisa devolver 0 linhas
select organization_id, external_thread_id, count(*)
from public.conversations
where external_thread_id is not null
group by 1,2 having count(*) > 1;
```

Conferido em 03/08/2026: `conversations` tem **0 linhas** e **0 duplicatas** — o
índice não pode falhar por dado pré-existente.

---

## 2. As 10 conversões que nunca chegaram à Meta

Medido em `integration_outbox`:

| status | tópico | n | último erro |
|---|---|---|---|
| `dead_letter` | `meta.conversion.send` | **10** | `META_CONVERSIONS_ACCESS_TOKEN não configurado.` |
| `blocked` | `meta.lead.fetch` | 8 | `Este contato já pertence a uma lead única no CRM. [code P0001]` |
| `delivered` | `meta.lead.fetch` | 16 | — |

As 8 `blocked` **não são falha**: é a trava de identidade única funcionando.

As 10 mortas são 10 sinais de conversão que o algoritmo da Meta nunca recebeu —
o ciclo fechado não fechou por falta de uma variável de ambiente.

**Sequência (a 1 é sua, as 2 e 3 são de dentro do produto):**

1. Definir `META_CONVERSIONS_ACCESS_TOKEN` no ambiente de produção. Não coloque
   em `NEXT_PUBLIC_*` — é segredo de servidor.
2. Repescar as 10 por `POST /api/v3/dlq/retry` com `{ "eventId": ... }`, uma a
   uma. É exclusivo da diretoria (403 para os demais). Conferido: as 10 têm
   vínculo `dead_letter_events.outbox_event_id` e **todas são alcançáveis** pela
   repescagem — nenhuma órfã.
3. Reconferir `/api/v1/ready`: `filas.precisaDeAtencao` deve cair para `false`.

---

## 3. O agendamento dos vigias — 12 dos 15 nunca rodaram

Medido em `atlas_worker_runs` em 03/08/2026. São **15 vigias declarados** em
`config/workers-schedule.json`, e o livro de execuções só conhece três:

| vigia | passagens | última |
|---|---|---|
| `first-contact-sla` | 10 | 1,7 h atrás |
| `baseline-de-conversao` | 5 | 9,3 h |
| `nightly-handoff` | 1 | 14,4 h |
| **os outros 12** | **0** | nunca |

Entre os que nunca rodaram está o **`outbox`, de cadência `*/2`** — a fila de
saída. É por isso que `/api/v1/ready` responde `estado: unknown` com o motivo
*"não dá para afirmar que o agendamento executa"*: não houve execução para
observar.

**Os 15 registram passagem.** Conferido rota a rota: todas chamam
`registrarExecucao`. Não é falta de instrumentação — é falta de quem os chame.

### Não escreva o crontab à mão

A automação já existe inteira, e um script separado a instala:

```bash
npm run cron:gerar     # imprime o bloco, com o porquê de cada cadência
npm run cron:validar   # confere se ESTA máquina pode instalar
npm run cron:instalar  # instala — só no servidor
```

`instala-crontab-no-servidor.mjs` **recusa** em qualquer máquina que não seja o
servidor, e é separado do gerador por um motivo pago em 30/07/2026: alguém rodou
`gera-crontab... && crontab` num Mac de desenvolvimento e agendou 11 workers
comerciais na máquina local apontando para PRODUÇÃO — inclusive o `outbox`, que
envia mensagem de verdade a cada 2 minutos.

Rodando aqui agora, ele recusa com três motivos nomeados: plataforma `darwin` é
máquina de desenvolvimento, falta `ATLAS_AUTORIZA_INSTALAR_CRON`, e
`/var/www/atlas` não existe.

### A prova de que pegou

Instalar não é o desfecho — o desfecho é passagem no livro. Depois de instalar,
espere a cadência mais curta (2 minutos, o `outbox`) e confira:

```sql
select vigia, count(*) passagens, max(concluido_em) ultima
from public.atlas_worker_runs
group by vigia order by ultima desc nulls last;
```

Só está pronto quando os **15** aparecerem — e `/api/v1/ready` sair de
`estado: unknown` para um estado afirmado.

---

## 4. Ordem sugerida

1. Subir o build novo (com as 7 migrations no pacote).
2. Aplicar as 7 migrations, na ordem numérica, rodando as pré-checagens de §1.1
   e §1.3 antes das respectivas.
3. Instalar o crontab de §3.
4. Definir `META_CONVERSIONS_ACCESS_TOKEN` e repescar as 10 de §2.
5. Reconferir `/api/v1/ready` e exigir: `estadoExigeAcao: false`,
   `filas.precisaDeAtencao: false`, `migrations.faltandoTotal: 0` contra a lista
   do **build novo**.

O passo 5 é o que separa "subiu" de "funciona". HTTP 200 não é aprovação.
