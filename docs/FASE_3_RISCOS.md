# Fase 3 — Riscos

> **Os maiores riscos de hoje não são técnicos de Fase 3. São de Fase 1.**
> Um documento de risco que fala de Kafka e não fala de dado real de 17 mil
> pessoas num projeto que o dono considera aposentado está olhando para o lado
> errado.

Ordem: **medido primeiro, hipotético depois.** Medido em
`pozbrcsfthnhmnebfoxv` e `ietwopslgqxlenfyghqk`, **2026-07-30 05:04 UTC**.

---

## Parte I — Riscos MEDIDOS (existem agora)

### R1 · 17.151 leads reais num projeto tratado como aposentado — ATIVO
**Severidade: a mais alta deste documento.**

Medido executando contra `ietwopslgqxlenfyghqk` (`atlas-ai-crm-v1`):

```
status ................ ACTIVE_HEALTHY   (não pausado, não excluído)
leads ................. 17.151
tabelas ............... 23
lead mais recente ..... 2026-07-17
região ................ us-west-2        (o canônico está em sa-east-1)
```

**O risco tem quatro faces:**
1. **Dado pessoal real de 17.151 pessoas** segue acessível num projeto que já foi
   alvo de um pedido de exclusão. Enquanto existe, é superfície de vazamento e
   obrigação de LGPD.
2. **Ocupa um dos dois slots** de projeto do plano `free` da organização
   `Atlas AI CRM`. Os dois slots estão tomados: um pelo canônico, um pelo
   aposentado. Não há espaço para um ambiente de produção limpo **sem decidir
   sobre este projeto primeiro**.
3. **Está em outra região** (us-west-2 vs sa-east-1). Qualquer confusão de
   credencial atravessa continente e legislação.
4. **É a base com dado de verdade.** O canônico tem 483 leads; o aposentado tem
   17.151. A tentação de "só puxar de lá" é permanente e é exatamente como um
   vazamento começa.

**Mitigação:** decisão do dono, não de engenharia — exportar-e-excluir, ou
declarar formalmente como arquivo com dono, prazo e base legal. **Não é tarefa
que código resolve.** Enquanto não decidido, este é o risco #1 do programa.

---

### R2 · O repositório não reconstrói o banco — interseção ZERO
```
171 versões de migration no repo    (a mais antiga: 20260711030000)
215 versões no ledger do banco      (a mais antiga: 20260721230311)
INTERSEÇÃO: 0                       conjuntos totalmente disjuntos
```

Verificado com `comm -12` sobre as duas listas ordenadas, não por amostragem.

**Consequência:** não existe caminho auditável de ambiente limpo até o estado
atual. `db push` aborta. Um incidente que exija recriar o banco **não tem
procedimento** — só o dump.

**Piora silenciosa:** DDL aplicado via `execute_sql` não entra no ledger. A
frente do grafo aplicou 12 objetos assim e **declarou** que não somou linha órfã
ao ledger, porque `apply_migration` gravaria uma versão gerada na hora, diferente
do nome do arquivo. A escolha está certa e o efeito é real: o banco tem objetos
que o ledger não conhece — como os outros 215 já não conhecem o repo.

**Mitigação:** remediação de migrations em paralelo à homologação limpa, com o
critério de saída sendo *interseção > 0 e crescendo*, nunca "parece igual".

---

### R3 · Nada está publicado
```
834 commits que origin/main não tem
130 commits sem push na branch de trabalho
último commit no remoto ....... 2026-07-26
último commit local ........... 2026-07-30
```

**Risco duplo:** (a) todo o trabalho vive numa máquina — perda de disco é perda de
programa; (b) nenhuma afirmação sobre comportamento em produção pode ser
verificada, porque não há produção. Toda prova desta rodada é de contrato e de
banco, **nenhuma de requisição real** — `route-quarantine` permite uma execução
do repositório e havia outros workflows ativos, então nenhum servidor subiu.

**O que isso invalida especificamente:** autenticação, rate limit e o 403 de
liderança das rotas novas nunca receberam requisição. O `security_invoker=true`
das 3 views nunca foi exercitado com JWT de corretor real.

---

### R4 · O artefato de deploy aponta para o banco APOSENTADO
**Não inferido: o portão foi EXECUTADO.** `node
scripts/check-coerencia-de-ambiente.mjs` com `.env.local` carregado:

```
ATLAS_ENV .......... production
ATLAS_BASE_URL ..... https://atlasaios.com.br
banco .............. pozbrcsfthnhmnebfoxv (atlas-v3-homologacao)

REPROVADO — 3 incoerência(s)
```

As três, na íntegra do que o portão devolveu:

1. `ATLAS_ENV="production"` **não tem projeto Supabase conhecido** por este
   repositório (`supabaseRef: null`), enquanto o banco configurado é o de
   **homologação**. Declarar produção aqui é sempre incoerente.
2. **`.env.hostinger` aponta para o projeto APOSENTADO** `ietwopslgqxlenfyghqk`
   (**17.151 leads reais**) em `NEXT_PUBLIC_SUPABASE_URL` (linha 10) e
   `DATABASE_URL` (linha 18).
3. **`.env.hostinger-template`** aponta para o mesmo projeto aposentado em
   `NEXT_PUBLIC_SUPABASE_URL` (linha 13).

**Este é o risco mais agudo do documento, e é maior que "o ambiente mente".**
Os itens 2 e 3 significam que **um deploy feito com o artefato de deploy que
existe hoje conecta a aplicação ao banco com dado real de 17.151 pessoas** — o
mesmo projeto do R1, que já foi alvo de um pedido de exclusão. Não é uma
inconsistência de rótulo: é o caminho de publicação apontando para a base errada.

**Consequência para o roadmap:** "publicar" (Onda 2.4) **não pode acontecer antes
disto**, ou a primeira publicação da plataforma será contra a base aposentada.
R1 e R4 são o mesmo risco visto de dois lados.

**E enquanto não fechar, `npm run test:real` não prova nada** — palavras do
próprio portão: ele mede um ambiente e valida contra outro. Corrigir no
ambiente (`.env`), **nunca afrouxando o portão**, que é a única coisa que compara
as três verdades (variável declarada, URL do banco, arquivo de deploy).

---

### R5 · A cerca de dados é assimétrica
```
185 tabelas base em public
185 com RLS ligada (100%)
  2 com política RESTRICTIVE      ← leads é uma
183 dependem só de políticas PERMISSIVE
 13 com RLS ligada e ZERO políticas
123 funções SECURITY DEFINER em public
```

Permissiva e restritiva compõem ao contrário: com permissivas, **uma** que passe
concede acesso; com restritiva, **todas** têm de passar. `leads` foi fechada com
`leads_org_fence` + `private.can_access_lead_row`. As outras 183 não têm essa
cerca — e o documento de estado de 2026-07-29 registra vazamento **provado
executando** com corretor descartável no PostgREST em `activities`, `customers`,
`profiles` e `opportunities` (leitura, alteração e DELETE consumado em duas
delas).

**Agravante estrutural:** a operação roda em `service_role`, que faz bypass de
RLS. **RLS é a cerca do caminho que quase ninguém usa.** A cerca efetiva está no
código e nas funções com `p_ator_id` explícito — o que significa que ela é
correta por disciplina, não por impossibilidade.

**Do linter do Supabase, executado agora:**
- `public.registra_alerta_de_lead()` é `SECURITY DEFINER` e **executável por
  `anon`** via `/rest/v1/rpc/`. WARN, `facing: EXTERNAL`.
- 7 outras `SECURITY DEFINER` executáveis por `authenticated`, entre elas
  `create_lead_atomic` e `distribute_project_leads`.
- **Proteção contra senha vazada desabilitada** no Auth.

---

### R6 · Duas verdades para o mesmo fato
A classe de defeito dominante deste repositório, reincidente mais de dez vezes:
`move.moveId` vs `move.id`; `pipeline_history` vs `pipeline_stage_moves`;
`developments` vs `crm_projects` (os mesmos 4 empreendimentos com **IDs
diferentes**); três catálogos de ação primária; o predicado de primeiro contato
em duas versões.

**Instâncias vivas, medidas nesta rodada:**
- **Duas réguas de "lead aberto"** divergindo em produção: a RPC não trata
  `comprou_outro` como fechado e a listagem trata. Mesma carteira = **112 pela
  RPC, 110 pela listagem.**
- **Duas contas de concentração de carteira**, em `lib/ai/previsao-aritmetica.ts`
  e `lib/atlas/gemeo-digital.ts`. **Concordam hoje.** Unificar as funções sem
  unificar a régua de "lead aberto" troca uma divergência por outra.
- **Terceira cópia da régua de carteira:** `private.can_access_lead_row` não
  delega à função nova. Há contrato que **detecta** divergência caso a caso —
  detecção, não impossibilidade.

---

### R7 · Teto de carteira é exibido e não é aplicado
Dois números, um só com efeito:

- `broker_capacity_limits`: **0 linhas** → `guard_broker_portfolio_capacity`
  retorna sem conferir nada, e `distribute_project_leads_v3` usa
  `coalesce(cap.max_active_leads, 2147483647)` — **sem teto** — enquanto devolve
  `capacityEnforced: true` no payload.
- `profiles.max_active_leads` está preenchido e é o que a tela exibe. Um corretor
  aparece com **teto 100 e carteira 272**.

**Risco:** a liderança acredita num limite que não existe. Um payload que afirma
`capacityEnforced: true` sem aplicar teto é pior que a ausência do campo.

---

### R8 · A base se move debaixo da medição
`public.leads` devolveu **483 → 501 → 483** em leituras da mesma sessão, sem
criação de lead, por resíduo de contrato de outra frente rodando em paralelo.
Leituras anteriores registraram 750 e 623.

**Risco:** todo número de lead deste programa é válido só no instante da medição.
Guarda de regressão presa a um número de lead **vai piscar** sem defeito nenhum
— e alguém vai afrouxá-la. Ancore em **propriedade**, não em contagem.

---

### R9 · Automação comercial parada, com aparência de pronta
- `whatsapp_broker_sessions`: **0 linhas** → distribuição automática **morta**.
  Degraus 1, 2 e 3 de `resolveLeadOwner` exigem WhatsApp conectado; toda lead cai
  no degrau 4: **represada, sem dono**.
- `commercial_presence`: 2 linhas, ambas `available`, última presença **mais de 5
  dias antes**. A redistribuição de 233 leads move **ZERO** hoje: 11 substitutos
  passam por equipe+papel+atividade, **nenhum** pela porta de presença de 90s, e
  a transação aborta no primeiro lead.
- 1 evento CAPI com `delivered_at` nulo e `attempts=0` — **nada saiu**, e estava
  marcado como entregue.
- `campaigns`: **0 linhas**, com 24 leads apontando `campaign_id` — **referência
  órfã**.

**O risco não é a parada. É a parada com semáforo verde.** Um `available` de 5
dias atrás lido como "presente agora" foi encontrado e corrigido dentro da
própria entrega do gêmeo — a mesma doença, dentro de quem a estava medindo.

---

### R10 · Qualidade de dado que nenhuma tecnologia conserta
- **Bairro é texto livre:** `"VilaOlímpia"` (sem espaço), `"Perdizes/Pompeia"`
  (composto). Todo casamento demanda↔oferta por bairro fragmenta.
- **`lead_events` não carrega tenant:** **43 de 310** linhas com o
  `organization_id` da org viva — 86% do rastro fora de qualquer análise por
  empresa.
- **Colunas financeiras vazias:** `budget_max` **1 de 483**; renda, entrada e FGTS
  **0 de 483**.
- **Consentimento por pessoa não existe:** `lead_contact_preferences` **0
  linhas**. A base legal vem da **fonte** (29 linhas, uma única base), não da
  pessoa.

**Risco de decisão:** relatório por bairro ou por campanha **subconta sem avisar**.
Quem decide verba com ele decide com número errado que parece certo.

---

## Parte II — Riscos da Fase 3 (se iniciada hoje)

### R11 · Mensalidade sobre insumo vazio
9 das 10 tecnologias estão bloqueadas por **dado**, não por dinheiro
(`FASE_3_CUSTOS.md`). Contratar AVM sem preço (0/4 empreendimentos, 0/6
tipologias), digital twin sem unidade (0 linhas em `units`+`inventory_units`+
`properties`) ou warehouse sem volume (483 leads) cria custo fixo que **não pode
produzir retorno**, porque falta a entrada.

### R12 · Modelo estatístico sem baseline — o risco mais sedutor
```
desfechos de GANHO em ai_learning_events ...... 1
desfechos de PERDA ............................ 0
vendas com valor apurado ...................... 0
conversion_dataset_versions ................... 0
conversion_calibration_models ................. 0
prediction_drift_reports ...................... 8, TODOS com current_sample=0
```

O piso da própria RPC viva do banco
(`build_conversion_calibration_candidate`, Fase 77) é **100 exemplos / 20
positivos / 20 negativos**. Com 1 exemplo e 0 negativos, "probabilidade de
conversão" é chute com vocabulário estatístico.

**Concentração agrava:** 87 dos 88 rótulos são de **uma pessoa**; **2 vitórias na
base inteira, as duas na mesma campanha**. Ranking de corretor ou de campanha
aqui é sorteio com cara de métrica.

**Mitigado por desenho:** `lib/ai/registro-de-modelos.ts` **recusa** 8 de 10
modelos, e `admitirEmProducao()` fica vermelho se a recusa for desligada (mutação
M140/M141). O risco só volta se alguém contornar o registro.

### R13 · Contatar em escala sem base legal por pessoa
**474 leads recuperáveis não são 474 leads contatáveis.** A função devolve as
duas informações em colunas separadas e **se recusa a ter uma coluna
`pode_contatar`** — precisamente para que ninguém confunda oportunidade com
permissão. Voice AI ou reativação em massa antes de consentimento por pessoa é
risco jurídico, não oportunidade comercial.

### R14 · Expor dado novo pela camada não protegida
Tours 360º e app nativo falam com o usuário `authenticated` — que atravessa 183
tabelas com políticas **permissive-only** e um `SECURITY DEFINER` executável por
`anon`. Superfície nova sobre cerca aberta.

### R15 · `scripts/mutacoes.mjs` é ponto de contenção
Duas frentes gravaram **M132–M139 simultaneamente** e a rodada acusou "8
sobreviveram" — era o `find()` casando as mutações da outra frente. Uma delas
renumerou para M140–M147.

**Risco:** resultado de mutação **falso** quando frentes concorrem. Conferir
numeração antes de confiar no veredito. Com a suíte global vermelha por outra
frente, `npm run teste:mutacoes` **aborta** (exige baseline 0), e as frentes
recorreram a runners escopados — prova válida, cobertura menor.

### R16 · Fechamento do ledger sem agenda
`fecharComRealizado()` está escrito e provado, mas **nenhum worker o chama** —
falta entrada em `config/workers-schedule.json` + crontab. Sem isso as linhas
nascem abertas e ficam abertas, e metade do valor do ledger fica na prateleira.
`trustByMoveKind` exige 4 amostras fechadas por tipo para sair de "coletando
base"; hoje o ledger tem **0 linhas**.

---

## Matriz de decisão

| # | Risco | Quem resolve | Custo |
|---|---|---|---|
| R1 | 17.151 leads no projeto aposentado | **dono** (decisão jurídica) | R$ 0 |
| R2 | repo não reconstrói o banco | engenharia | R$ 0 |
| R3 | nada publicado | dono + engenharia | a confirmar (hospedagem) |
| R4 | ambiente mente sobre si mesmo | engenharia | R$ 0 |
| R5 | RLS assimétrica + `anon` em definer | engenharia | R$ 0 |
| R6 | duas verdades | engenharia | R$ 0 |
| R7 | teto exibido e não aplicado | engenharia | R$ 0 |
| R8 | base se move | disciplina de teste | R$ 0 |
| R9 | automação parada com semáforo verde | **dono** (abrir o app) + engenharia | R$ 0 |
| R10 | qualidade de dado | **operação** (coleta) | R$ 0 |
| R11–R16 | riscos de Fase 3 | **não iniciar a Fase 3** | R$ 0 |

**Dezesseis riscos. Nenhum se resolve comprando tecnologia da Fase 3.**
Onze deles custam R$ 0,00 e dependem de decisão ou de disciplina.
