# ENTREGA 07 — Fila de atendimento por empreendimento e por campanha

**Branch:** `claude/fila-de-atendimento` · **Data:** 2026-08-03
**Commits:** `fb14bef2`, `ab37b68e`, `1305e470`, `659db61b`

---

## 1. Objetivo

Pedido do dono do produto, em quatro partes:

1. melhorar a página de distribuição de leads;
2. poder selecionar facilmente os corretores vinculados aos projetos que geram campanhas;
3. poder colocar e tirar corretores da fila;
4. criar uma fila de atendimento.

Decisões tomadas com o dono antes de escrever código: a fila é **rodízio ordenado
(vez a vez)**, e é **por empreendimento e por campanha** — não uma fila única da
equipe.

---

## 2. Achados (medidos antes de mexer)

### 2.1 O elenco chegava à tela e nunca ao motor — **causa raiz**

`resolveLeadOwner` aceita um 4º argumento `escopo` desde que o elenco existe. Os
**três** chamadores nunca passaram:

| chamador | arquivo |
| --- | --- |
| entrada Meta Lead Ads | `app/api/v2/outbox/process/route.ts:734` |
| entrada de portais | `app/api/v2/outbox/process/route.ts:1020` |
| execução de proposta aprovada | `app/api/v2/approvals/[id]/route.ts:96` |

Sem escopo, `carregarElenco()` devolve `[]`, `resolverElenco()` responde
`sem-elenco` e a lead vai para o corretor de menor carga da **equipe inteira** —
inclusive quem foi deixado fora daquele empreendimento de propósito.

A tabela, a regra pura, os contratos dela e a tela que a alimenta existiam há
semanas e funcionavam. **A feature inteira era decorativa** e nada acusava:
nenhuma rota errava, nenhum teste ficava vermelho, a tela gravava e lia de
verdade. Só a lead ia para a pessoa errada, em silêncio.

### 2.2 Três controles que devolviam 400 a cada clique

O painel "Elegibilidade do time neste empreendimento" mandava
`action: "configure_member"` para `/api/v1/crm/distribution`, que **não conhece
essa ação** — caía em `DISTRIBUTION_ACTION_INVALID`.

O `queue` que o alimentava também era sintético: a rota montava
`enabled: true, weight: 1` para todo par corretor×projeto. "Pausado" nunca
aparecia, e o peso mostrado não vinha de lugar nenhum —
`project_distribution_members` tem **0 linhas** nesta base.

### 2.3 Cobertura de ausência: 400 com o corretor selecionado

A tela mandava `profileId`; a rota lê `raw.brokerId` para essa ação (as outras
duas leem `profileId`). **Toda** cobertura de ausência morria em "Informe o
corretor ausente".

### 2.4 Três avisos verdes estampando `undefined`

`distribute`, `configure_capacity` e `configure_priority` liam campos no nível
errado da resposta (`result.data.distributed` etc.; os valores moram em
`result.data.result`). A tela dizia "**undefined** lead distribuídas" em verde,
como sucesso.

### 2.5 Duas famílias de id para os mesmos 4 empreendimentos

`crm_projects` e `developments` têm os mesmos quatro empreendimentos com ids
diferentes. A página de distribuição lista `crm_projects`; o elenco e as leads
usam `developments`. Elenco montado numa família jamais casaria com a outra.

### 2.6 Duas telas para a mesma decisão

`/settings/distribuicao` (que gravava certo, sem ordem) e o painel de
`/distribution` (que dava 400). Já haviam divergido.

---

## 3. O que foi feito

### 3.1 `lib/distribution/fila-de-atendimento.ts` — a regra do rodízio

Módulo puro: sem banco, sem rede, sem relógio.

- Ordem do ciclo: `posicao` manual → data de entrada → id (desempate estável).
- **O ponteiro é DERIVADO**, nunca guardado em coluna: sai de quem recebeu por
  último de verdade (`lead_distribution_history` cruzado com o escopo da lead).
  Coluna criaria uma segunda verdade — bastaria uma lead atribuída à mão, por
  transferência ou por cobertura de ausência, para o ponteiro apontar para um
  lugar que a operação não viveu.
- **Quem é pulado não é expulso**: a vez passa adiante com o motivo escrito e a
  posição intacta.

**19 contratos**, a maioria sobre o ponteiro: âncora que saiu da fila, ninguém
que nunca recebeu, vez que cai em quem não pode atender, fuso horário que
quebraria comparação textual.

### 3.2 A ligação até o motor

Escopo passado nos três chamadores. Meta e portal precisaram de **reordenação**:
a ponte do empreendimento e a campanha do Google eram resolvidas *depois* do
dono, então o escopo ainda não existia na hora de perguntar de quem era a vez.

Na cascata: com fila montada para o escopo, a escolha é por rodízio; **sem fila,
segue menor carga** — nenhum ambiente perde comportamento.

**8 contratos exercitando o MOTOR** com Supabase de mentira, não a forma da
chamada. Um deles verifica que `escopo: {}` *não* vale como escopo: passaria num
portão de aridade e seria o mesmo defeito com outra cara.

### 3.3 Banco

`supabase/migrations/20260803190000_fila_de_atendimento_posicao.sql` — aditiva,
idempotente, nulável: uma coluna `posicao smallint` numa tabela que estava
vazia. **Aplicada em homologação.** Rollback documentado no próprio arquivo; sem
a coluna o rodízio ordena pela data de entrada e nenhuma lead deixa de ser
distribuída.

### 3.4 A rota

`/api/v1/crm/elenco-de-distribuicao` estendida (não duplicada):

- GET devolve o **volume de leads de cada escopo** (total, 30 dias, sem dono),
  a **elegibilidade de cada corretor com o motivo escrito**, e a **fila ordenada**
  do escopo pedido, já com quem é o próximo.
- GET devolve `travaGeral` — o que impede a fila inteira de girar, quando é a
  mesma coisa para todo mundo.
- POST ganhou `acao: "mover"` com `direcao: subir|descer`, escrita separada da
  de entrar/sair de propósito.
- Quem entra vai para o **fim** da fila: entrar não fura a vez de quem já estava.
- Erro de leitura vira 503 com a frase que distingue "não pôde ler" de "não há
  ninguém" — contagem zero por falha de rede viraria "esta campanha não gera
  lead", que é uma afirmação sobre o marketing da casa feita a partir de um erro.

### 3.5 A tela

`components/atlas/FilaDeAtendimentoPanel.tsx`, montado em `/distribution` e em
`/settings/distribuicao` (as duas telas agora usam o mesmo componente).

- Escopos ordenados por **volume, não por nome**: a campanha que gerou 23 leads
  no mês vem antes da que gerou zero. Campanhas sem lead ficam atrás de um botão.
- Fila com 1º, 2º, 3º, **PRÓXIMO** destacado, quando cada um recebeu a última
  lead daquele escopo, e por que alguém foi pulado.
- Subir, descer, tirar da fila; e os corretores fora da fila em chips de um
  clique, cada um com o próprio impedimento no rótulo.
- **Peso saiu de propósito**: peso dentro de um rodízio contradiz "cada um na sua
  vez".

As três frases que o painel nunca deixa de dizer: o que significa fila vazia
(aberta a todos, não "ninguém recebe"); o que acontece quando o time está fora
(sobe para o gerente, não cai para quem ficou de fora); e por que ninguém está
marcado como próximo.

---

## 4. Arquivos

| arquivo | o quê |
| --- | --- |
| `lib/distribution/fila-de-atendimento.ts` | novo — regra pura do rodízio |
| `lib/distribution/hierarchical-cascade.ts` | rodízio no motor + `ultimaLeadDoEscopo` |
| `app/api/v2/outbox/process/route.ts` | escopo nas duas entradas + reordenação |
| `app/api/v2/approvals/[id]/route.ts` | escopo na redistribuição aprovada |
| `app/api/v1/crm/elenco-de-distribuicao/route.ts` | contexto, fila ordenada, mover |
| `components/atlas/FilaDeAtendimentoPanel.tsx` | novo — a tela |
| `app/(crm)/distribution/page.tsx` | painel morto → fila; 4 defeitos de contrato |
| `app/(crm)/settings/distribuicao/page.tsx` | passa a montar o mesmo componente |
| `supabase/migrations/20260803190000_*.sql` | `distribution_roster.posicao` |
| `tests/contracts/fila-de-atendimento.test.mjs` | 19 contratos da regra |
| `tests/contracts/a-vez-chega-ao-motor.test.mjs` | 8 contratos do motor e da ligação |
| `scripts/prova-fila-de-atendimento.mjs` | 33 verificações contra o banco vivo |

---

## 5. Testes

| o quê | resultado |
| --- | --- |
| `npm run test:contracts` | **2076 passaram, 0 falharam** (era 2068 antes) |
| `npx tsc --noEmit` | limpo |
| `npm run lint` | limpo (`--max-warnings=0`) |
| `ATLAS_BUILD_SEM_AMBIENTE=1 npm run build` | `✓ Compiled successfully` |
| `scripts/prova-fila-de-atendimento.mjs` | **33 passaram, 0 falharam**, 0 linhas deixadas para trás |

A prova contra o banco vivo conferiu o volume de cada escopo **lead a lead**
(174 = 174 no Inside Perdizes, 24 = 24 na campanha Meta), a ordem sobrevivendo à
ida e volta do banco, o buraco fechando quando alguém sai, e a recusa de perfil
de fora da organização, escopo inventado e direção inválida.

---

## 6. O que a prova revelou sobre a operação

**Ninguém está com o WhatsApp conectado nesta base.**
`whatsapp_broker_sessions` tem 0 linhas, e a cascata exige o canal ligado para
corretor **e** para gerente. Enquanto ninguém conectar, toda lead de entrada
automática fica represada de propósito — o que casa com as **56 leads sem dono e
sem empreendimento** medidas no banco.

O painel agora diz isso na tela, acima da fila, em vez de mostrar uma fila
montada sem ninguém marcado como próximo e sem explicação.

---

## 6-B. Segunda onda — as pendências viraram entrega

O dono pediu "vamos consertar tudo". As quatro pendências da §7 foram fechadas, e
duas delas escondiam defeitos maiores do que o relatado.

### 6-B.1 Os dois botões de distribuir NUNCA funcionaram

`distribute_project_leads_v3` começa recusando qualquer empreendimento fora de
`developments`; a tela mandava id de `crm_projects`. Toda distribuição morria em
`distribution_project_invalid` e virava um 409 genérico. Não era limitação de
regra de negócio — era id de outra tabela.

Empreendimento canônico passa a ser `developments`: 30 FKs contra 6, a ponte vai
de `crm_projects` PARA `developments`, `leads.development_id` tem 198 de 596
contra 14 de `project_id`, e a ponte está 100% preenchida.

### 6-B.2 A presença que o motor lê não tinha escritor

O batimento gravava `profiles`; o motor lê `commercial_presence` numa janela de
90 segundos. Medido: 2 linhas na tabela, **zero** dentro da janela, contra 8
perfis marcados como disponíveis. Mesmo com o id certo, não haveria candidato.
Um único instante agora carimba as duas tabelas.

### 6-B.3 `distribute_project_leads_v5`

O botão passa a honrar a fila. Sem isso, a fila valeria para a lead que entra
sozinha e não para a mesma lead distribuída pela liderança — duas verdades sobre
de quem é a vez. Descem junto: acervo de resgate entrando como demanda nova,
lead com dono no banco e órfã na tela (a v3 gravava só `assigned_to`), e o
ponteiro do rodízio sem casa única.

### 6-B.4 Campanha ↔ empreendimento

Gravação atravessa a ponte: a tela manda o id canônico, o banco guarda o da FK.

### 6-B.5 CPL — erro de 30 vezes

`lib/marketing/cost-report.ts` já dividia pelo que a campanha GEROU. A rota
pedia `campaign_id,spend_date,amount` a `marketing_spend` e deixava `leads_count`
no banco: `leadsNaOrigem` chegava indefinido e a divisão caía sobre as leads que
entraram.

| | valor |
| --- | --- |
| verba das 7 campanhas "[Cia360] Inside Smart" | R$ 4.355,83 |
| leads geradas (Meta) | 119 |
| leads ligadas a elas no CRM | 4 |
| CPL que a tela mostrava | **R$ 1.088,96** |
| CPL real | **R$ 36,60** |

Terceira ocorrência da mesma classe nesta entrega: os dois lados prontos e o fio
no chão, sem nada vermelho.

---

## 6-C. Terceira onda — CPL, ingestão e o alerta do corretor

### 6-C.1 A entrada da Meta destravada, e provada

O worker `meta-backfill` foi executado à mão contra o banco vivo: **22 leads
lidas na Meta, 18 enfileiradas, 4 duplicadas**. Drenando o outbox, **duas leads
reais entraram** que ninguém tinha — Marcia Regina Gothard (22:41) e MANFERP
COMERCIAL (22:29). Ambas nasceram **sem dono**, porque a cascata exige WhatsApp
conectado e ninguém tem.

Isso prova as duas pontas: o backfill funciona, e ele não estava rodando.

### 6-C.2 Vigia da ingestão

Duas entradas independentes, porque uma só não cobre os dois modos de falha:
silêncio anômalo (comparado com o histórico da MESMA faixa de horário, para não
tocar toda madrugada) e evento entrando e não virando lead — este último o
critério de silêncio jamais pegaria.

### 6-C.3 O alerta do corretor, em três camadas

| camada | alcance | leva nome? |
| --- | --- | --- |
| pastilha na barra lateral | Atlas em primeiro plano | sim, agora nomeia quem chegou |
| aviso do navegador + som | Atlas em segundo plano | sim — não sai do dispositivo autenticado |
| Telegram (worker de 5 min) | Atlas fechado | **não** — contagem e link, só |

O WhatsApp foi descartado por motivo técnico, não por preferência:
`messages.conversation_id` é NOT NULL e aponta para a conversa de UMA LEAD. O
aviso interno entrando ali apareceria no histórico do cliente.

---

## 7. Pendências (não entram nesta entrega)

**As quatro originais foram fechadas na segunda onda (§6-B), e as três frentes
do pedido seguinte na terceira (§6-C).** O que segue aberto:

1. **O cron continua sem disparar sozinho.** Todos os workers desta entrega — o
   backfill, o vigia da ingestão e o aviso ao corretor — estão declarados no JSON
   e no YAML, e o YAML está no branch de entrega. GitHub Actions só lê
   `schedule:` do **branch padrão**: enquanto `claude/fila-de-atendimento` não
   for integrada à `main`, nada dispara sozinho. **É decisão de merge, não de
   código** — e é o único item que impede a operação de rodar sem alguém puxar.
2. **Ninguém pode ser avisado fora do Atlas hoje.** 5 corretores ativos, **zero**
   com `telegram_chat_id` e zero com `phone`. O worker roda, responde 200 e
   informa a lacuna em `semCanal` — mas até alguém cadastrar o canal, a terceira
   camada do alerta não alcança ninguém. O aviso do navegador cobre o caso
   enquanto isso.
3. **A cascata não entrega para ninguém enquanto não houver WhatsApp conectado.**
   `whatsapp_broker_sessions` tem 0 linhas, e as duas leads destravadas pelo
   backfill nasceram sem dono por causa disso. É regra deliberada (lead de
   anúncio se atende por WhatsApp), mas hoje ela represa 100% da entrada.
4. `priorityRules` e `recentAssignments` agora vêm das tabelas reais, mas ambas
   estão vazias na base: nenhuma regra de prioridade foi salva com sucesso até
   hoje (a gravação morria no mesmo 409 da §6-B.1) e o livro de evidência só
   passa a ter linhas a partir da próxima distribuição.
5. **67 eventos de conversão da Meta em `failed`** com o erro 2804003, e 10 em
   carta morta por `META_CONVERSIONS_ACCESS_TOKEN` ausente. Fora do escopo desta
   entrega, mas apareceu ao drenar o outbox e vale registrar.

1. **A página de distribuição não enxerga o empreendimento de 198 leads.**
   `LIVE_LEAD_SELECT` não inclui `development_id` (só `LIVE_LEAD_SELECT_WITH_SLA`
   inclui), então `mapLegacyLead` cai em `project_id` — preenchido em 14 de 596
   leads, contra 198 de `development_id`. Somado a §2.5, o seletor de projeto do
   topo da tela opera numa família de ids que quase nenhuma lead usa. É por isso
   que 56 leads sem dono aparecem como "sem empreendimento vinculado".
   **Consertar isso exige decidir qual das duas tabelas é a canônica** — decisão
   de produto, não de implementação.
2. `priorityRules: []` e `recentAssignments: []` estão cravados vazios em
   `/api/v1/crm/distribution`. Os painéis "Prioridade por SLA e origem" e "Por
   que cada lead foi atribuída" nunca mostram nada, mesmo depois de salvar uma
   regra.
3. As 8 campanhas de `marketing_campaigns` têm `project_id` **nulo**. Não há
   vínculo campanha→empreendimento no banco; a fila da campanha e a do
   empreendimento são independentes, como o produto exige, mas ninguém consegue
   ver na tela qual campanha pertence a qual projeto.
4. `project_distribution_members` está oficialmente órfã: 0 linhas, nenhum
   leitor, e o conceito de peso saiu com esta entrega.

---

## 8. Riscos

- **Comportamento de produção muda quando alguém montar uma fila.** Com
  `distribution_roster` vazio (estado atual: 0 linhas) nada muda — o escopo
  passado resolve para "sem-elenco" e a distribuição segue por menor carga. A
  troca para rodízio acontece no primeiro escopo que ganhar fila, que é
  exatamente a intenção do pedido.
- A reordenação no caminho da Meta move a resolução do dono para depois da ponte
  de empreendimento e da campanha. As duas leituras já existiam no mesmo bloco e
  não ganharam ida nova ao banco; o que mudou foi a ordem.
