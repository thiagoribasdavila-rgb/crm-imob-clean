# Erros encontrados e corrigidos

Todos foram **medidos** — reproduzidos contra o banco de homologação ou contra a
API real — e todos foram corrigidos na causa, não no sintoma.

Um padrão domina a lista e vale nomear antes: em **nove** dos treze casos o
código estava correto e **desconectado**. Rota sem chamador, RPC sem quem a
invoque, indicador cravado em zero, lista vazia por definição, contrato apontando
para arquivo esvaziado. Nenhum produzia erro; todos produziam ausência.

A pergunta de revisão que sai daqui não é *"isso está implementado?"* — é
**"quem chama isso, e o que aparece na tela quando chama?"**

---

## 1. O relógio de SLA de primeiro contato nunca fechava

**Sintoma:** 210 leads ativas, 210 com prazo vencido, **0 contatos registrados**.
Lia-se como "a equipe não atende".

**Causa:** os gatilhos de fechamento observam `activities` e `messages` — duas
tabelas legadas com **zero linhas**. O CRM escreve em `lead_events`, que não tem
gatilho. E `complete_first_contact_sla` não tinha **um único chamador**.

**Correção:** rota `POST /api/v1/leads/[id]/first-contact` grava o evento e chama
a RPC; medição real no pipeline e no `team-sla`.
**Prova:** 20 verificações via sessão HTTP autenticada.

## 2. O prazo de 5 minutos da Meta nunca era aplicado

**Causa:** o gatilho comparava `source` com `('meta lead ads','meta','facebook')`
e o produto grava **`meta_ads`**. Das 201 leads de Meta Ads, **zero** recebeu o
prazo curto — todas caíram no padrão de 15 min.

**Correção:** função `is_paid_social_source` normalizando `_` e `-`.
Prazos já vencidos **não** foram recalculados: refazer prazo de lead vencida há
dois meses falsearia o histórico.

## 3. `POST /auth/v1/verify` respondia HTTP 500

**Impacto:** magiclink **e recuperação de senha**.

**Causa (cadeia de três):** o gatilho de provisionamento movia o usuário
existente para a organização `atlas-default` a cada confirmação → o gatilho de
RBAC recusava, corretamente → e o `exception when others` registrava com
`pg_catalog.sqlerrm`, mas **`sqlerrm` é variável de PL/pgSQL**: qualificada com
schema, o Postgres a lê como `tabela.coluna` e levanta `42P01`. **O tratador de
erro era ele próprio um erro.**

**Correção:** perfil existente nunca é reprovisionado; o log vive em bloco
próprio com saída silenciosa. **12 verificações, 12 OK.**

## 4. O ciclo de follow-up também não fechava

Mesma doença da nº 1, um andar acima: `complete_follow_up_sla` correta, gatilhos
em `activities`/`messages`, **6 ciclos abertos e 0 concluídos**. E os quatro
indicadores estavam **escritos como `0`/`null` literais** na API — o painel lia
"nenhum fora do prazo" quando a verdade era "nada foi medido".

## 5. A taxa de cumprimento aparecia como "1%"

A API devolve razão 0–1; o command center imprimia crua e comparava com `>= 80`.
**100% de cumprimento aparecia como 1%** e nunca cruzava limiar de cor nenhum.

## 6. A ficha do lead devolvia lista de propostas vazia por definição

`proposals: []` cravado na rota. A tela tem o tipo completo e renderiza os três
tempos da fase 37 — e a seção ficava oculta porque o comprimento era sempre zero.
Os dados estavam em `commercial_simulations` o tempo todo.

## 7. A reserva de aceite não aparecia, e o aceite não fechava a reserva

`assignmentReservation: null` cravado. Pior: o aceite atribuía a lead **na mão**
em vez de chamar `accept_lead_assignment` — a reserva ficava `pending` para
sempre e o worker de expiração acabaria **devolvendo à distribuição uma lead já
aceita**.

## 8. O vigia de SLA respondia 500 e nunca criou tarefa

`PGRST204 — coluna 'metadata' não existe em 'tasks'`. Na sessão anterior eu havia
medido quantas tarefas ele *criaria* e reportado como se tivesse criado.
**Contagem calculada não é contagem gravada.**

**Correção:** migration acrescenta a coluna e o worker degrada por prefixo de
título quando ela falta. Execução 1: 6 tarefas. Execução 2: 0. Idempotente.

## 9. O backfill da Meta perdia toda a atribuição

A Graph API **não devolve atribuição por padrão** — sem `fields`, retorna só
`id`, `created_time` e `field_data`. As leads entravam sem formulário, sem
plataforma e sem campanha. Não há erro: só ausência.

**Correção:** `fields=...,ad_id,adset_id,campaign_id,form_id,platform,is_organic`.
Reconferido: `platform` fb/ig e `is_organic: false` agora chegam.

## 10. A ingestão gravava o dono na coluna que a aplicação não lê

O worker escrevia só `assigned_to` (canônica V3); a aplicação consulta
`assigned_user_id`. Lead com dono no banco entrava **órfã na tela** — e o vigia
nem cobrava o SLA dela, porque filtra lead sem `user_id`.

## 11. A tabela de projetos que as telas leem estava vazia

`developments` com 3 linhas, `crm_projects` com **0** — e é dela que o seletor de
projeto, o nome do empreendimento e os filtros leem.

## 12. O único formulário Meta registrado tinha id inexistente

`279573218005583` contra o real `27957321800558327` — **faltavam dois dígitos**.
O backfill consultava um formulário que não existe e recebia lista vazia; o
webhook descartava lead de formulário não registrado em silêncio.
**116 leads já pagas estavam fora do CRM.**

## 13. A fila por SLA abria pelas leads menos recuperáveis

Ordenar cru por prazo crescente colocava as 201 leads vencidas há semanas na
frente; uma lead **nova de 5 minutos** caía além da posição 100. A fila da
urgência escondia a única que ainda virava conversa.

**Correção:** a fila por SLA mostra só o que está dentro da janela de recuperação
de 48h. De "ausente em 100" para "posição 10 de 10".

---

## Portões que estavam medindo a coisa errada

Três casos em que o **código estava certo e o teste, errado** — corrigidos sem
afrouxar o rigor, e todos revalidados por teste de mutação:

| portão | media | passou a medir |
|---|---|---|
| `lead-reservation` | trecho literal, falhava por espaço em volta do `===` | conteúdo, ignorando formatação — e ganhou dois casos que faltavam |
| `portfolio-audit` | a expressão exata `portfolioAudit:auditResult.data` | segue o rastro: de qual identificador o payload vem |
| `director-dashboard` | qualquer `.delete(` — reprovava um `Map.delete` em memória | escrita real no banco (`insert`/`upsert`/cadeia `from().update`) |
| `atlas-logo` | exigia que o favicon contivesse órbita e planeta | identidade real entre favicon e componente, agora possível |

## Falsos positivos da varredura de dívida técnica

Registrados para não voltarem a consumir tempo: `TODO` como palavra portuguesa em
comentário (22 ocorrências), `mock` em comentário sobre testabilidade,
`console.log` **dentro do próprio logger**, e `localhost` como fallback de
exemplo no OpenAPI. Nenhum é defeito.

Reais: **dois `catch{}` mudos** em fluxo de produção, ambos corrigidos.

---

## Auditoria página por página (26/07/2026)

Onze defeitos em nove telas. **Nenhum produzia erro visível** — é por isso que
todos sobreviveram tanto tempo. Cada um foi medido contra o banco de homologação
antes e depois da correção.

### Raiz A — o select compartilhado ficou no vocabulário legado

O mapeador (`mapLegacyLead`, `mapLegacyProfile`) sempre tentou a coluna canônica
primeiro e caía na legada em silêncio quando ela não vinha no resultado. Como o
select base nunca foi atualizado, a canônica nunca chegava — e nada quebrava.

| coluna canônica | legada no select | cobertura | efeito |
|---|---|---|---|
| `development_id` | `project_id` | 174/217 vs **0/217** | filtro por empreendimento devolvia 0 com 174 leads dentro |
| `next_action_at` | `next_contact` | 9/217 vs **0/217** | agenda com zero follow-ups; 4 filtros de próxima ação devolviam 0 |
| `purpose` | — | 174/217, nunca buscada | 217 clientes marcados como "sem finalidade" |
| `full_name` | `name` | 8/8 vs **3/8** | 5 de 8 pessoas sem nome em **15 arquivos** |

Medições depois da correção: atrasadas 0 → 6; agendadas 0 → 3; Inside Perdizes
0 → 174; agenda 6 → 15 itens; pessoas sem nome 5 → 0.

**Armadilha registrada:** o grupo de colunas estendidas tem fallback *tudo ou
nada*. Uma coluna ausente devolve 42703 e a leitura inteira cai para o select
base, perdendo o grupo todo — inclusive as colunas de SLA. Aconteceu quando
`next_action_label` (que não existe nesta base) entrou junto por engano: a
agenda continuou vazia **e** o SLA parou de ser lido. O aviso está escrito no
próprio bloco.

### Raiz B — agregação que trata desconhecido como zero

| tela | o que dizia | por quê |
|---|---|---|
| Pipeline | "Pipeline bruto: R$ X" | somava `budget_max` de 18 de 217 leads (8%) e apresentava como total |
| Relatórios | "investimento: R$ 0,00" | `paid.reduce(...)` com lista vazia devolve 0 — enquanto toda campanha dizia "Não conectado" |

Os dois são **números que decidem dinheiro**, e os dois passavam porque zero é
uma resposta plausível: ninguém questiona um total baixo, questiona um ausente.
Agora ambos publicam `null` com a cobertura declarada ao lado.

### Raiz C — a tela promete o que o motor não faz

- **Tarefas:** a IA proativa contava tarefas atrasadas por `assigned_to` e
  `due_at`; a tabela tem `user_id` e `due_date`. A consulta devolvia `count:
  null`, o `if (!error && typeof count === "number")` engolia, e o alerta nunca
  existiu. Havia também **cinco definições diferentes** de "tarefa concluída",
  uma por rota — "cancelada" ficava pendente para sempre em três delas.
- **Distribuição:** rótulo "carga ÷ peso" com `project_distribution_members`
  vazia — todo peso é 1 e a divisão nunca muda nada. A própria API já declarava
  `weightedLoad: false`.

### Raiz D — recuo estreito demais

**Vendas:** `opportunities` existe com zero linhas. O recuo para `leads` só
disparava em `isMissingRelation`, então a tela ficava em branco com leads
`ganho` no banco. Tabela vazia e tabela ausente contam a mesma história.

### Três erros meus nesta auditoria

Registrados porque vão se repetir:

1. **Um teste meu bloqueou uma correção legítima.** O contrato da agenda fixava
   a lista literal `NEXT_ACTION_COLUMNS = ["next_action_at"]` e reprovou quando
   a correção de Clientes 360 somou duas colunas ao mesmo grupo. Passou a aferir
   pertencimento, não forma.
2. **Um script de verificação lia o campo errado** (`gaps` em vez de
   `contextGaps`) e acusou 15 divergências inexistentes por três medições
   seguidas — inclusive depois de a correção já estar funcionando.
3. **Adicionei uma coluna sem conferir que existia**, e o fallback tudo-ou-nada
   derrubou o grupo inteiro, incluindo o SLA que não tinha relação com a
   mudança.
