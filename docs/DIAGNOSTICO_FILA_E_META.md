# DIAGNÓSTICO — os dois eventos da fila e o mapa da Meta

**2026-07-31. Somente leitura.** Nada foi movido, publicado, migrado ou alterado.
Os dois eventos da fila **não** tiveram `status`, `attempts` nem `available_at`
modificados por este diagnóstico.

---

## PARTE 1 — OS DOIS EVENTOS ANTIGOS

### Evento A — `aafa248e…`

| campo | valor |
|---|---|
| tópico | `meta.lead.fetch` |
| criado | 2026-07-27 02:16:29 |
| tentativas | 1 |
| causa classificada | **nenhuma** (`cause` nulo) |
| erro | `Falha desconhecida` |
| carga | `{"externalLeadId": "LG-91e584b979"}` |
| agregado em `meta_lead_events` | **não existe** |

**Causa raiz.** O identificador `LG-91e584b979` **não é formato da Meta**. Todos os
`external_lead_id` reais da base têm 16 dígitos; este tem prefixo `LG-` e
hexadecimal. Não existe linha correspondente em `meta_lead_events`, então o evento
nunca teve origem num webhook real — foi enfileirado por um caminho de teste.

**É seguro reprocessar?** Tecnicamente sim (a chamada à Graph é um GET, sem efeito
colateral), mas é **inútil**: o objeto não existe na Meta e o evento só marcharia
até o `dead_letter` na quinta tentativa.

**Risco de duplicação:** nenhum — não há lead associada.
**Destino recomendado:** **cancelar com justificativa** (artefato de teste).

### Evento B — `584f9bfc…`

| campo | valor |
|---|---|
| tópico | `meta.lead.fetch` |
| criado | 2026-07-28 22:50:06 |
| tentativas | 1 |
| causa classificada | **nenhuma** (`cause` nulo) |
| erro | `Meta Graph HTTP 400 [code 100/33]: Unsupported get request. Object with ID '1785279004691960' does not exist` |
| `leadgen_id` | `1785279004691960` |
| página | `582258611872380` |
| formulário | `1028419749899296` |
| recebido em | 2026-07-28 22:50:04 |
| agregado | existe, `status = failed` |

**Causa raiz — e ela é conclusiva.** O `leadgen_id` **é o próprio horário de
recebimento**. Os dez primeiros dígitos, lidos como epoch:

| `external_lead_id` | prefixo como data | leitura |
|---|---|---|
| 4034910456804134 | 2097-11-10 | ID real (backfill) |
| 2543603406102676 | 2050-08-08 | ID real (backfill) |
| 1077447894943499 | 2004-02-22 | ID real (backfill) |
| **1785279004691960** | **2026-07-28 22:50:04** | **= o próprio `received_at`** |

Os três reais produzem datas sem sentido, como se espera de identificador
aleatório. O quarto acerta o segundo exato em que foi recebido. É ID sintético,
montado a partir do relógio — um ensaio, não uma lead paga. A Graph está correta ao
dizer que o objeto não existe.

**É seguro reprocessar?** Sim, e igualmente **inútil**.
**Risco de duplicação:** nenhum.
**Destino recomendado:** **cancelar com justificativa** (ensaio de homologação).

### Conclusão da Parte 1

> **Nenhum dos dois eventos falhados é lead paga real.** Os dois são artefatos de
> teste. A fila não perdeu nenhuma lead de cliente.

Isto muda a leitura de um número que aparece em toda a auditoria: os "2 itens em
`failed`" **não representam receita perdida**. Continuam sendo sujeira que deixa a
prontidão em `degraded`, mas não são um incidente comercial.

**Não os alterei.** Cancelar é decisão do dono, e o comando exato está no final
deste documento.

---

## PARTE 2 — O MAPA DA META

Tudo lido pela Graph API v23.0, sem escrita.

### Identidade

| o quê | valor |
|---|---|
| System User | **ATLAS INTEGRACOES** (`122094514413420274`) |
| Business Manager | **Thiago Ribas D'Avila** (`488439536919148`) |
| Conta de anúncios | **Inside - Senna** (`act_2169318190556460`), status 1, BRL |

### ⚠️ Permissões: NENHUMA está faltando

Medido em `me/permissions` — **15 concedidas, 0 negadas**:

```
ads_management · ads_read · leads_retrieval · pages_show_list
pages_read_engagement · pages_manage_metadata · pages_manage_ads
business_management · catalog_management · whatsapp_business_management
whatsapp_business_messaging · whatsapp_business_manage_events
manage_app_solution · threads_business_basic · public_profile
```

**Isto corrige um diagnóstico que a auditoria e eu repetimos:** não é problema de
escopo de token. `pages_read_engagement` e `leads_retrieval` sempre estiveram
concedidas.

### O bloqueio real: a página não pertence a este Business Manager

| pergunta | resposta medida |
|---|---|
| Páginas que o token enxerga | **só** `582258611872380` — *DA'Vila Consultoria* |
| `owned_pages` do BM | **só** `582258611872380` |
| `client_pages` do BM | **nenhuma** |
| Ler a página `1115087091694606` | **ERRO 400 (#10)** |
| Anúncios ATIVOS na conta | **19** |
| Página onde os 19 publicam | **`1115087091694606`** — todos |
| Nome dos anúncios | `[Cia360] Fachada Investidor \| Jul.26 \| Op1…Op4` |

O erro `(#10)` pede `pages_read_engagement` — que **está concedida**. Quando o
escopo existe e o acesso falha, o que falta não é permissão: é **atribuição de
ativo**. A página `1115087091694606` não está nem em `owned_pages` nem em
`client_pages` do BM `488439536919148`.

O prefixo `[Cia360]` nos 19 anúncios sugere que uma agência opera as campanhas
sobre uma página que **não é desta empresa**. *(Isto é inferência a partir do nome;
o proprietário da página não é legível por este token — só a Meta Business Suite
do dono responde.)*

### O mapa, numa linha

```
Anúncios (19 ativos)  →  página 1115087091694606  →  CRM NÃO escuta, NÃO consegue ler
CRM escuta            →  página 582258611872380   →  ZERO anúncios ativos
```

Uma lead gerada hoje pelos anúncios **não tem caminho até o CRM**.

### Formulários e webhook — não medidos, e o motivo

`leadgen_forms` e `subscribed_apps` exigem **Page Access Token**; o token disponível
é de System User. Retornaram `(#190) This method must be called with a Page Access
Token` e `Invalid OAuth 2.0 Access Token`. Isto é limitação de tipo de token, **não
evidência de ausência de webhook**. Fica declarado como **não medido**.

O que se sabe do banco: a única fonte cadastrada aponta para `582258611872380`, e o
formulário `1028419749899296` apareceu no evento sintético.

---

## PARTE 3 — A DECISÃO: A ou B

### A. Integrar ao CRM a página usada pelos anúncios

| dimensão | avaliação |
|---|---|
| O que exige | o **proprietário** de `1115087091694606` compartilhar a página com o BM `488439536919148`, ou adicionar o System User como administrador dela |
| Depende de terceiro | **Sim** — e este é o único ponto fraco |
| Tempo de engenharia | horas, depois do compartilhamento |
| Impacto nas campanhas | **nenhum** — os 19 anúncios seguem entregando |
| Perda de lead | cessa assim que concluído |
| Histórico e atribuição | **preservados** |
| Nova aprovação da Meta | não |
| Risco | baixo |

### B. Migrar os anúncios para a página já integrada

| dimensão | avaliação |
|---|---|
| O que exige | recriar ou editar os **19 anúncios ativos** para publicar em `582258611872380` |
| Depende de terceiro | **Sim** — os anúncios são `[Cia360]`, provavelmente operados por agência |
| Tempo | dias |
| Impacto nas campanhas | **alto** — trocar a página do criativo reinicia o aprendizado e submete a nova revisão |
| Perda de lead | durante a revisão, e enquanto o aprendizado se refaz |
| Histórico e atribuição | **perdidos** no nível do post (curtidas, comentários e prova social dos anúncios atuais) |
| Nova aprovação da Meta | **sim** |
| Risco | alto |

### Recomendação

> **A**, com folga. B destrói prova social e aprendizado de 19 anúncios que já
> entregam, para resolver por força bruta um problema que se resolve com um
> compartilhamento de ativo.
>
> A única vantagem de B é não depender de um terceiro. Se o proprietário da página
> `1115087091694606` for inalcançável, B deixa de ser a pior opção e passa a ser a
> **única** — mas essa é a hora de decidir isso, não antes de tentar A.

**Nada foi executado.** Sem aprovação humana, nenhuma migração, troca de token ou
alteração de página acontece.

---

## COMANDOS QUE DEPENDEM DE VOCÊ

### Para os dois eventos (opcional — eles não são leads reais)

```sql
-- Cancela os dois artefatos de teste, com justificativa gravada.
-- NÃO execute se preferir mantê-los como evidência histórica.
update integration_outbox
set status = 'cancelled',
    cause = 'artefato_de_teste',
    last_error = 'Cancelado em 2026-07-31: identificador sintetico, sem objeto correspondente na Meta. Ver docs/DIAGNOSTICO_FILA_E_META.md'
where id in ('aafa248e-…', '584f9bfc-…');
```

*(Os UUIDs completos estão na tabela; foram sanitizados aqui de propósito.)*

### Para a Meta — na Business Suite, não por API

1. Descobrir o proprietário da página `1115087091694606` (a Business Suite do dono
   mostra; este token não alcança).
2. Pedir o compartilhamento da página com o Business Manager `488439536919148`,
   com acesso para o System User **ATLAS INTEGRACOES**.
3. Só depois: gerar Page Access Token, listar formulários, inscrever o webhook em
   `leadgen` e cadastrar a fonte no CRM.
4. **Antes de recarregar a verba**, confirmar que uma lead de teste do formulário
   real chega ao CRM.

Enquanto 1 e 2 não acontecerem, recarregar orçamento é comprar lead que não tem
caminho até o corretor.
