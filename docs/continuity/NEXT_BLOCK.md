# NEXT_BLOCK — correções pontuais: resultado da execução de 2026-07-24

Os 7 itens mapeados foram **todos reproduzidos antes de qualquer alteração**. Vários não
eram o que a lista dizia — por isso nem todos viraram correção. A regra aplicada foi
"não executar correção apenas porque ela aparece na lista".

## Resultado item a item

### 1. `bulk-transfer`: validar destino no escopo hierárquico → **PARCIALMENTE FALSO POSITIVO**

A lista dizia que a rota "confia só no erro do banco". **Falso.** O código já valida, antes
de chamar o RPC: destino existe, pertence à **mesma organização** (`.eq("organization_id", …)`),
está **ativo**, e o ator tem papel autorizado (`admin`/`director`/`superintendent`/`manager`).
Também já tem rate limit (15/min).

O que de fato não é validado no Node é a hierarquia *fina* (um gerente transferir para
corretor de outro time). Isso é responsabilidade do RPC `bulk_transfer_leads` no banco, que
recebe `p_actor_id` e devolve erro → 403. Sem acesso ao banco vivo, não dá para afirmar se o
RPC valida ou não. → a parte restante é **DEPENDE DE BANCO**.

Nenhuma alteração feita. Mexer aqui às cegas arriscaria bloquear transferências legítimas.

### 2. `sales/[id]/commission`: rollback quando a auditoria falha → **CORRIGIDO** (`a15efddb`)

Reproduzido: o `insert` em `commission_events` tinha o erro **ignorado**. Se a trilha falhasse,
a alteração financeira já gravada em `opportunities` ficava sem registro de quem mudou o quê —
e o cliente recebia `200 OK`.

Correção mínima: erro checado; alteração revertida para os valores anteriores; se nem a
reversão funcionar, log de `error` e resposta explícita para não relançar. Rollback:
`git revert a15efddb`.

### 3. `pipeline/stages`: adicionar rate limit → **CORRIGIDO** (`a15efddb`)

Reproduzido: `GET` e `PUT` sem limite algum — só `requireApiIdentity`. Agora 60/min na leitura
e 10/min na escrita, com headers na resposta.

### 4. PADRÃO F — parar de devolver `error.message` do banco → **PARCIALMENTE CORRIGIDO / FALSO POSITIVO em maioria**

A varredura inicial apontava "5 rotas". A verificação real mudou o quadro:

- **25 ocorrências** de `error.message` em `app/api`, mas a **maioria está em chamadas de
  logger** (servidor), onde é correto e desejável — e o logger do repo já tem redação testada.
- Só **11** chegam de fato ao cliente.
- Dessas, várias vêm de **`.rpc()`**, onde a mensagem é *de domínio e proposital* (o RPC levanta
  regras de negócio legíveis, ex.: destino inválido). Substituir por texto genérico
  **degradaria** a experiência e esconderia validação legítima.

Corrigido apenas onde era inequívoco: os dois `catch` de `pipeline/stages`, que devolviam ao
cliente a mensagem de exceções — inclusive de autenticação. As demais precisam de julgamento
por RPC → **TRANSFERIDO PARA BACKLOG** com a distinção documentada.

### 5. `lib/compat/live-hierarchy.ts`: derivar hierarquia por `team` → **DEPENDE DE BANCO**

Reproduzido e confirmado: quando o perfil não tem `reports_to`, **todo corretor** é ligado a
`managers[0]` — o primeiro gerente da lista. É uma distorção real.

**Não corrigido de propósito.** A correção proposta (derivar por `team`) só funciona se o campo
`team` estiver populado nos perfis do banco vivo. Se estiver vazio, o fallback produziria
`reports_to: null` e os corretores **sumiriam** dos painéis de gerente — trocaria uma distorção
por uma quebra de visibilidade. Além disso, mexe em quem enxerga os leads de quem: é
permissão, não formatação.

**Para desbloquear:** `select count(*) from profiles where team is null or team = ''`.

### 6. `app/api/v1/tasks`: ligar recorrência ao RPC `create_recurring_task` → **DEPENDE DE BANCO**

Reproduzido: a rota devolve `503 TASK_RECURRENCE_PENDING` e a migration
`20260717233000_phase_43_recurring_tasks.sql` existe no repo criando o RPC.

**Não corrigido de propósito.** O repo tem drift de schema conhecido (dezenas de migrations não
aplicadas). Ligar a recorrência sem confirmar o RPC no banco vivo trocaria uma recusa honesta
("liberada após homologação") por um erro 500 em produção.

**Para desbloquear:** confirmar que a função `create_recurring_task` existe no banco de destino.

### 7. `leads/actions/page.tsx`: adotar a página real do ZIP → **DEPENDE DE PRODUTO**

Reproduzido: o repo tem um stub de 281 bytes com **4 botões inertes** — exatamente o defeito
"tela só visual / botão sem ação" do protocolo. A página do ZIP (333 linhas) é bem construída:
lê o envelope corretamente (`payload.data?.items`), usa só componentes existentes e degrada
com elegância.

**Porém:** ela busca os destinos de transferência com **GET** em
`/api/v1/crm/leads/bulk-transfer`, e o repo só exporta **POST** nessa rota. Importar a página
sozinha entregaria a transferência visivelmente desabilitada.

Opções em [PRODUCT_DECISIONS_REQUIRED.md](PRODUCT_DECISIONS_REQUIRED.md).

## Placar

| classificação | itens |
|---|---|
| CORRIGIDO | 2, 3 (e a parte inequívoca do 4) |
| FALSO POSITIVO | 1 (parcial), 4 (maioria) |
| DEPENDE DE BANCO | 5, 6, e a parte fina do 1 |
| DEPENDE DE PRODUTO | 7 |
| REJEITADO POR RISCO | nenhum |

## Próximo bloco recomendado

Com as pontuais fechadas, o próximo bloco de maior valor é **decidir os 3 bloqueios acima**
(duas consultas ao banco e uma decisão de produto destravam 4 itens de uma vez), e depois o
**tema claro nas telas restantes** (Command Center, Leads, Projetos, Copilot) — a fundação e o
check já existem, é trabalho de superfície.
