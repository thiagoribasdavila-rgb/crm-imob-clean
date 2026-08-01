# Fase 3 — Arquitetura

> A regra do dono que governa este documento:
> **"Não retirar o PostgreSQL do centro operacional sem motivo."**
> **"Começar com relações no PostgreSQL. Adotar banco de grafos separado somente
> quando houver necessidade comprovada de escala ou complexidade."**

Medido em `pozbrcsfthnhmnebfoxv`, **2026-07-30 05:04 UTC**.

---

## 1. O que já existe — o ponto de partida real

```
185 tabelas base em public
185 com RLS LIGADA (100%)
  3 views          (as 3 do grafo, entregues hoje)
123 funções SECURITY DEFINER em public
215 migrations no ledger do banco
```

**Extensões — o que está instalado vs o que está disponível.** A distinção é
decisiva, porque "disponível" não custa nada e "instalado" já foi decidido:

| Extensão | Estado | Consequência para a Fase 3 |
|---|---|---|
| `postgis` 3.3.7 | **INSTALADA** | geo já é nativo; não há o que contratar |
| `plpgsql`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault` | INSTALADAS | base operacional |
| `vector` (pgvector) 0.8.2 | **disponível, NÃO instalada** | busca semântica é `create extension`, **não** contrato de banco vetorial |
| `pgmq` 1.5.1 | **disponível, NÃO instalada** | fila no banco; **não** contratar fila externa |
| `pg_cron` 1.6.4 | **disponível, NÃO instalada** | agendamento no banco |
| `pg_trgm`, `unaccent`, `fuzzystrmatch` | disponíveis | normalização de bairro (ver §5) |
| `postgis_raster`, `pgrouting`, `postgis_topology` | disponíveis | geo avançado sem custo novo |

**Leitura direta:** as três coisas que a Fase 3 mais tenta comprar — banco
vetorial, fila externa, agendador — **já estão pagas e a um comando de
distância.** A régua do dono não é uma restrição aqui; é uma descrição do que a
infraestrutura já oferece.

---

## 2. A assimetria de RLS — o fato arquitetural mais importante

```
185 tabelas com RLS ligada
 13 com RLS ligada e ZERO políticas   → nega tudo; só service_role acessa
  2 com política RESTRICTIVE          → leads é uma delas (leads_org_fence)
183 dependem só de políticas PERMISSIVE
```

Isso importa porque **permissive e restrictive compõem de formas opostas**: com
políticas permissivas, **uma** que passe já concede acesso. Com restritiva,
**todas** têm de passar. `leads` foi fechada com `leads_org_fence` RESTRICTIVE +
`private.can_access_lead_row`. As outras 183 não têm essa cerca.

E há o fato que muda o peso disso: **a operação roda em `service_role`**, que faz
bypass de RLS. RLS é, hoje, a cerca do caminho que quase ninguém usa. Toda cerca
efetiva está no código de aplicação e nas funções com `p_ator_id` explícito.

**Consequência para a Fase 3:** qualquer capacidade nova que exponha dado ao
usuário autenticado (tour 360º, app nativo, AVM voltado ao cliente) atravessa a
camada **não** protegida por restritiva. Fechar RLS não é tarefa de Fase 3 — é
pré-requisito dela.

---

## 3. O que a Fase 3 NÃO deve substituir

| Não substituir | Por quê |
|---|---|
| PostgreSQL como centro operacional | regra escrita do dono; e é onde a cerca vive |
| `lib/crm/escopo-de-leitura.ts` | **uma** definição de quem vê o quê. Escrever uma segunda é a classe de bug que este repo já pagou dez vezes |
| `private.can_access_lead_row` | é a função que a RLS de `leads` chama; reescrever muda a leitura de toda a base |
| `developments` como tabela de empreendimento | conferir a FK antes de vincular: `developments` e `crm_projects` têm os mesmos 4 com **IDs diferentes** |
| `pipeline_stage_moves` | é a tabela viva; `pipeline_history` é o rastro morto |

**A classe de defeito dominante deste repo é "duas verdades para o mesmo fato,
calculadas em lugares diferentes."** Cada capacidade da Fase 3 que recalcular um
número que já existe reintroduz essa doença. A pergunta de revisão é sempre:
*este número já existe em algum lugar?*

Dívida já aberta e nomeada nesta rodada: `lib/ai/previsao-aritmetica.ts` e
`lib/atlas/gemeo-digital.ts` medem concentração de carteira por caminhos
diferentes. **Concordam hoje** — e usam réguas **diferentes** de "lead aberto"
(112 vs 110), então unificar as funções sem unificar a régua troca uma
divergência por outra.

---

## 4. O que a Fase 3 acrescenta — e sobre o que ela se apoia

O desenho é **uma camada de leitura sobre o transacional**, não um segundo
banco. As fundações de hoje já são essa camada:

```
┌─ Operação (hoje) ────────────────────────────────────────────┐
│  Next.js · rotas /api/v1  ·  service_role  ·  RLS por baixo   │
│  185 tabelas · PostGIS · 123 funções security definer         │
└───────────────┬───────────────────────────────────────────────┘
                │ leitura, sem cópia de dado
┌───────────────▼─ Camada analítica (entregue HOJE, R$ 0) ──────┐
│  3 views      vw_grafo_demanda · vw_grafo_oferta              │
│               vw_grafo_censo_de_arestas                       │
│  9 funções    grafo_* (+ private.ator_alcanca_lead)           │
│               security definer · search_path='' · anon=false   │
│  juízes TS    grafo-de-receita · gemeo-digital                │
│               registro-de-modelos (RECUSA sem baseline)        │
└───────────────────────────────────────────────────────────────┘
```

**O grafo é relacional.** 3 views e 9 funções, **zero tabela nova**, zero cópia
de dados, zero extensão. É literalmente o que o dono escreveu: "começar com
relações no PostgreSQL". O contrato **executa** a proibição —
`assert.doesNotMatch(sql, /create\s+table/i)` e `/create\s+extension/i` sobre a
migration com comentários removidos.

**Desligar é `drop view` / `drop function`** — sem perda de dado, porque a
camada inteira é leitura. Rollback em `supabase/rollbacks/`, nunca `.down.sql`
dentro de `migrations/` (duplica versão e aborta o push).

---

## 5. Qualidade de dado — o que a arquitetura não conserta

Três defeitos de dado achados executando, que **nenhuma tecnologia da Fase 3
resolve** porque são de coleta:

1. **Bairro é texto livre.** `"VilaOlímpia"` (sem espaço) e `"Perdizes/Pompeia"`
   (composto) fragmentam qualquer casamento demanda↔oferta. Conserto:
   normalização com `unaccent` + `pg_trgm` (extensões já disponíveis) **ou** uma
   tabela canônica de bairro. Enquanto não houver, todo relatório por bairro
   subconta.

2. **`lead_events` não carrega tenant.** Só **43 das 310** linhas têm o
   `organization_id` da org viva. Qualquer análise de interação por empresa
   perde 86% do rastro.

3. **`campaign_id` cobre 24 leads; o texto livre de campanha cobre 212.**
   São 8 textos distintos que ninguém agrupa com confiança. A FK existe e está
   quase vazia; a referência é órfã (`campaigns` tem **0 linhas** e 24 leads
   apontam para lá).

**Regra derivada:** nenhuma capacidade da Fase 3 que dependa de bairro, campanha
ou interação deve ser aprovada antes destes três. Não é opinião de arquitetura —
é o que o censo mediu.

---

## 6. As dez tecnologias, do ponto de vista arquitetural

Preço não entra aqui — está em `FASE_3_CUSTOS.md`. Aqui entra **onde encaixa** e
**o que quebra**.

| Tecnologia | Encaixa como | Substituiria o PostgreSQL? | Veredito arquitetural |
|---|---|---|---|
| Data warehouse | destino de carga histórica | **não pode** | **postergar** — o dono escreveu "não contratar antes de existir volume". 483 leads não é volume |
| AVM (avaliação automática) | função/serviço de leitura | não | **bloqueado por dado**: preço 0/4 empreendimentos, 0/6 tipologias, 0 unidades |
| Banco de grafos separado | substituiria as 3 views | sim, e é proibido hoje | **já resolvido em relações**; reavaliar só com escala comprovada |
| Digital twin de empreendimento | camada sobre `developments` | não | **bloqueado**: 0 unidades no acervo. O gêmeo da *operação* já existe |
| Tours 360º | mídia + storage | não | atravessa a camada authenticated **sem restritiva** (§2) |
| Computer vision | processamento de mídia | não | sem acervo de mídia, não há entrada |
| Voice AI | canal | não | **proibido nesta rodada** (mensalidade) |
| Integrações avançadas | rotas + filas | não | usar `pgmq` já disponível, não fila externa |
| App nativo | cliente | não | exige RLS fechada antes; hoje seria cliente sobre 183 tabelas permissive-only |
| Arquitetura de escala | infra | não | **sem métrica de carga**: 43 chamadas de IA em 4 dias |

---

## 7. Lacunas de verificação desta arquitetura

Ditas em voz alta, porque arquitetura sem lacuna declarada é propaganda:

1. **`security_invoker=true` nas 3 views não foi exercitado com JWT real.**
   O atributo está provado no catálogo (`reloptions`), e a cerca das **funções**
   está provada nos dois lados com ator explícito. Mas nenhuma view foi lida por
   um corretor autenticado de verdade — as views são o caminho authenticated, e a
   operação usa `service_role`.

2. **Mutação de arquivo `.sql` não muda o banco.** O comportamento das 9 funções
   não está coberto por mutation testing; está coberto por contrato ao vivo.
   As 6 mutações atacam o juiz em TypeScript. Isso está escrito no bloco novo de
   `scripts/mutacoes.mjs` para ninguém achar coberto o que não está.

3. **A terceira cópia da régua de carteira continua existindo.**
   `private.can_access_lead_row` não delega à função nova. Há contrato executável
   que **detecta** divergência caso a caso — detecção, não impossibilidade.

4. **Nenhuma rota HTTP expõe o grafo.** As 9 funções já recebem `p_ator_id`
   justamente para que a rota, quando existir, não invente cerca. Hoje o grafo é
   usável por `service_role`, não pelo corretor.

5. **A camada HTTP das rotas novas não foi exercitada.** `route-quarantine`
   permite uma execução do repositório e havia outros workflows ativos; servidor
   não foi levantado. Autenticação, rate limit e o 403 de liderança do gêmeo
   nunca receberam requisição real.

---

## 8. Advertências de segurança medidas hoje

Do linter do próprio Supabase, executado agora:

- **`public.registra_alerta_de_lead()` é `SECURITY DEFINER` e executável por
  `anon`** via `/rest/v1/rpc/`. Nível WARN, `facing: EXTERNAL`.
- 7 outras funções `SECURITY DEFINER` executáveis por `authenticated`, entre elas
  `create_lead_atomic` e `distribute_project_leads`.
- **Proteção contra senha vazada está desabilitada** no Auth.
- 13 tabelas com RLS ligada e nenhuma política (nega tudo — seguro por
  omissão, mas indica que só `service_role` as usa).

Nenhum destes é problema de Fase 3. Todos são anteriores a ela.
