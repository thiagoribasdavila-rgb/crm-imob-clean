# Fase 3 — Business Case

> **O gate 5.13 NÃO está atendido. A Fase 3 não pode começar hoje.**
> Este documento existe para dizer isso com número, não para pedir aprovação.

Tudo abaixo foi **medido no banco canônico** `pozbrcsfthnhmnebfoxv`
(`atlas-v3-homologacao`) em **2026-07-30 05:04:36 UTC**, executando consulta —
não lido de relatório anterior. Onde não houve medição, está escrito
**"não medido"**.

---

## 1. O gate, requisito por requisito

| # | O que o gate 5.13 exige | Estado medido | Atende |
|---|---|---|---|
| 1 | Fase 1 estável | 130 commits sem push; nada publicado | **NÃO** |
| 2 | Fase 2 **em produção** | nenhum ambiente servindo usuário final | **NÃO** |
| 3 | Custo mensal medido | só custo variável de IA, 4 dias, com ponto cego de 28,6% | **PARCIAL** |
| 4 | Custo por lead atendido conhecido | 9 leads atendidos de 483; denominador instável | **NÃO** |
| 5 | Automações com taxa de sucesso | distribuição automática **morta** (0 sessões WhatsApp) | **NÃO** |
| 6 | Evidência de produtividade | **136 das 137** movimentações por **1 único corretor** (a 137ª por um admin) | **NÃO** |
| 7 | Evidência de conversão | **0 vendas com valor apurado** | **NÃO** |
| 8 | Equipe usando | 12 corretores ativos, **9 com carteira vazia** | **NÃO** |
| 9 | Qualidade de dado suficiente | renda/entrada/FGTS **0 de 483**; `budget_max` **1 de 483** | **NÃO** |
| 10 | Demanda que justifique escala | 483 leads numa base que oscilou 483→501→483 na mesma hora | **NÃO** |
| 11 | Retorno esperado > investimento | **não calculável** — ver `FASE_3_ROI.md` | **NÃO** |
| — | *(coerência de ambiente, não pedida pelo gate)* | portão **executado**: REPROVADO, 3 incoerências; deploy aponta para o banco aposentado | **NÃO** |

**Zero requisitos plenamente atendidos. Um parcial.**

---

## 2. Os cinco fatos que sozinhos reprovam o gate

1. **O repositório não reconstrói o banco.** 171 versões de migration no repo,
   215 no ledger do banco, **interseção ZERO** — conjuntos totalmente disjuntos.
   As do repo começam em `20260711030000`; as do banco, em `20260721230311`.
   Consequência: não existe caminho auditável de ambiente limpo até o estado
   atual. `db push` aborta.

2. **Nada está publicado.** A branch de trabalho tem 834 commits que `origin/main`
   não tem. O último commit que existe no remoto é de **2026-07-26**; o último
   local é de **2026-07-30**. Nenhum usuário final usa nada disto.

3. **Zero receita apurada.** `leads.sale_value_brl > 0` = **0 de 483**.
   `external_sales_records.estimated_value > 0` = **0**. Existem 2 rótulos `won`
   e 2 `external_purchase` — mas etapa é declaração, valor é fato, e o valor
   não existe. Sem numerador não há conversão, ticket, VGV ou ROI.

4. **O artefato de deploy aponta para o banco aposentado.** O portão de coerência
   foi **executado** (`scripts/check-coerencia-de-ambiente.mjs`) e devolveu
   **REPROVADO, 3 incoerências**: `ATLAS_ENV=production` sobre banco de
   homologação, e — o grave — **`.env.hostinger` e `.env.hostinger-template`
   apontando para o projeto APOSENTADO `ietwopslgqxlenfyghqk`, que tem 17.151
   leads reais.** Publicar hoje ligaria a aplicação à base errada. Ver R1 e R4 em
   `FASE_3_RISCOS.md`.

5. **A operação não começou.** 9 leads com primeiro contato registrado em 483.
   0 oportunidades, 0 clientes, 0 unidades no acervo
   (`units` + `inventory_units` + `properties` = 0 linhas).

---

## 3. O que as fundações de hoje entregaram — a custo zero

Três frentes fecharam nesta rodada, **R$ 0,00 de custo novo** cada, sem tabela
nova e sem serviço com mensalidade:

| Frente | Entrega | Onde |
|---|---|---|
| Grafo em PostgreSQL | 3 views + 9 funções, zero tabela nova | `supabase/migrations/20260730100000_grafo_de_oportunidade_de_receita.sql` · `lib/crm/grafo-de-receita.ts` |
| Gêmeo digital | simulador determinístico da operação, sem chute | `lib/atlas/gemeo-digital.ts` · `app/api/v1/atlas/gemeo-digital/route.ts` |
| Previsão governada | registro que **recusa** modelo sem baseline + ledger de projeção | `lib/ai/registro-de-modelos.ts` · `lib/ai/ledger-de-projecao.ts` · `lib/ai/previsao-aritmetica.ts` |

**O valor destas três entregas não é prever. É recusar prever.** Cada uma tem um
juiz executável que devolve "não medido" com o número que falta, em vez de um
valor plausível. Foi isso que produziu a tabela da seção 1.

### O que os juízes responderam

**Grafo — 2 de 7 perguntas do dono têm dado suficiente:**

```
SIM  leads semelhantes ............ 192 leads em empreendimento, 8 fontes
SIM  oportunidades de recuperação . 474 recuperáveis
NÃO  clientes p/ estoque novo ...... 0 pares de empreendimento comparáveis
NÃO  imóveis substitutos ........... 0 pares por bairro, 1 lead de co-interesse
NÃO  corretor mais adequado ........ 2º corretor tem 1 desfecho; 2 vitórias no total
NÃO  campanha por perfil ........... base existe (12), vitórias não (2)
NÃO  demanda × oferta .............. bairro declarado 1,2%; unidades no acervo 0
```

**Previsão — 2 de 10 modelos admitidos**, e os 2 admitidos são **aritméticos**
(carga da equipe, tempo até esgotar a fila). Os 8 recusados incluem um caso que
prova que a régua não é indulgente com aritmética: `estoque_baixa_saida` é a
conta mais simples das dez e foi recusada porque o insumo medido é **vazio**.

**Gêmeo — a resposta a "e se eu redistribuir?" é ZERO.** A aritmética diz que os
468 leads em carteira ÷ 12 corretores dariam **39,00 por pessoa**, e que **233
leads** sairiam da carteira mais cheia (272 − 39). Mas executando a consulta de
candidatos da própria RPC contra a base viva: 11 substitutos passam por
equipe+papel+atividade e **nenhum** passa pela porta de presença de 90s.
`commercial_presence` está parada há mais de 5 dias. **Conserto: alguém abrir o
app.**

> **Este parágrafo é uma demonstração do risco R8.** A frente do gêmeo mediu, às
> 04:19–04:44 UTC, **385 em carteira → 32,08 por pessoa → 239 sairiam**. Eu medi
> às 05:14 UTC: **468 → 39,00 → 233**. Nenhuma das duas está errada; a base se
> moveu entre elas. **A propriedade — concentração extrema numa carteira e nove
> vazias — é estável. A contagem não é.** Ancore guardas na propriedade.

---

## 4. Concentração — o número que invalida dois rankings

- Os 88 desfechos rotulados estão em **2 corretores**: 87 num, 1 no outro.
- **2 vitórias na base inteira**, as duas na mesma campanha.
- **136 das 137** movimentações de funil foram de **um único corretor**; a 137ª, de um admin. Janela de 0,344 semana.

Qualquer ranking de "melhor corretor" ou "melhor campanha" construído sobre isto
é sorteio com aparência de métrica. As funções existem e **se recusam a
responder** — por desenho.

---

## 5. Custo: o que é medido e o que é ponto cego

Ver `FASE_3_CUSTOS.md`. Em resumo:

- Supabase: plano **`free`** (confirmado na API da organização). R$ 0/mês.
- IA, 4 dias (26–29/07): **US$ 0,011459** medidos em 43 chamadas.
  22 foram fallback local (custo zero real); 21 cobráveis, **todas Perplexity**.
- **O ponto cego:** 6 das 21 chamadas cobráveis (28,6%) têm
  `estimated_cost_usd` **nulo**. Custo não medido, não custo zero.
- Infraestrutura de hospedagem: **não medida** — nada está hospedado.

Não existe "custo mensal" porque não existe mês de operação. Existem 4 dias de
tráfego de teste.

---

## 6. A primeira métrica que precisa existir

O gate tem 11 requisitos, mas **um deles destrava seis outros**:

> ### Uma venda registrada com valor apurado em `sale_value_brl`.

Sem ela: sem conversão (7), sem ROI (11), sem ticket, sem VGV, sem custo por
venda, sem baseline para qualquer modelo estatístico. Com ela, ainda não há
modelo — o piso do próprio banco é **100 exemplos / 20 positivos / 20 negativos**
(`build_conversion_calibration_candidate`, Fase 77) — mas passa a existir a
primeira linha de uma série que hoje não começou.

**Ordem de coleta, do mais próximo ao mais distante** (cada item falha por uma
exigência só):

1. **Alguém abrir o app** → destrava redistribuição de 233 leads. Custo: 30s.
2. **Registrar valor da primeira venda** → destrava o denominador de tudo.
3. **Cadastrar bairro + preço de um 2º empreendimento no mesmo bairro** →
   destrava "clientes para estoque novo" (hoje 0 pares comparáveis).
4. **Rotular vitória em mais de uma campanha** → destrava "campanha por perfil".
5. **Cadastrar o acervo por unidade** → destrava demanda × oferta e estoque.
6. **Coletar motivo de perda na ficha do Lead 360** (hoje só o Kanban coleta) →
   destrava a classe negativa.

---

## 7. Recomendação

**Não iniciar a Fase 3.** Não porque a tecnologia seja inadequada, mas porque
**nove dos onze requisitos do gate falham por ausência de operação, não por
ausência de software.** Contratar warehouse, AVM ou voice AI hoje adiciona
mensalidade a uma base com 0 vendas apuradas e 9 leads atendidos.

O trabalho útil agora é o da seção 6 — e ele é quase todo **operacional e
gratuito**. As fundações de hoje já instrumentam a medição: quando os números
mudarem, os mesmos juízes que hoje recusam passarão a admitir, e a mudança
aparecerá sem ninguém reescrever documento.

---

## Fonte dos números

| Número | Como foi obtido |
|---|---|
| 171 / 215 / interseção 0 | `ls supabase/migrations` vs `supabase_migrations.schema_migrations`, `comm -12` |
| 130 e 834 commits | `git rev-list --count` vs upstream e vs `origin/main` |
| 483 leads · 9 atendidos · 0 com valor | `select count(*) from public.leads ...` |
| 88 rótulos · 2 won · 91 lost | `public.conversion_outcome_labels` |
| 12 corretores · 9 sem carteira | `profiles` ⋈ `leads` por `assigned_to`/`assigned_user_id` |
| 1 evento CAPI, 0 entregues | `public.meta_conversion_events` (`delivered_at`, `attempts`) |
| US$ 0,011459 · 43 chamadas · 6 sem custo | `public.ai_usage_events` |
| plano `free` | API da organização Supabase `hhzcgjrfbyupsbzpqozv` |
| 17.151 leads no projeto aposentado | `select count(*)` contra `ietwopslgqxlenfyghqk` |
| 3 incoerências de ambiente | `node scripts/check-coerencia-de-ambiente.mjs` **executado** |
| PostGIS instalada · pgvector/pgmq disponíveis e NÃO instaladas | catálogo de extensões do projeto |
| 88 rótulos em 2 corretores (87 e 1) | `conversion_outcome_labels` ⋈ `leads`, `max` e `offset 1` |
| 136 das 137 movimentações por 1 corretor | `pipeline_stage_moves` ⋈ `profiles` agrupado por `role` |
| 185 tabelas · 185 com RLS · 2 restritivas · 13 sem política · 123 definer | `pg_class`, `pg_policy`, `pg_proc` |
| `registra_alerta_de_lead` executável por `anon` · senha vazada desabilitada | linter de segurança do Supabase |

### O que NÃO foi medido por esta frente

Regra da casa: **achado por leitura não é achado.** Estes números vêm dos
relatórios das frentes irmãs desta rodada e **não foram reexecutados aqui** —
estão citados como delas, não como meus:

- o **censo de arestas** do grafo (coberturas de 97,3%, 44,0%, 1,2% etc.), os
  **192 leads semelhantes**, os **474 recuperáveis**, os **0 pares por bairro** e
  o **1 lead de co-interesse**;
- as portas da RPC de redistribuição (**11 substitutos → 0 na presença de 90s**) e
  os **383 leads abertos com prazo vencido** — a frente do gêmeo executou a
  consulta de candidatos; eu não reexecutei;
- o **vazamento provado por execução** em `activities`, `customers`, `profiles` e
  `opportunities` (leitura, alteração e DELETE consumado). Vem do
  `ESTADO_2026-07-29.md`. **Eu medi apenas a postura de políticas** (2 restritivas
  em 185), que é consistente com o vazamento mas não é a prova dele;
- **OpenAI 429 e Anthropic sem crédito.** Eu medi que as três chaves existem no
  ambiente e que **só `perplexity` e `local` aparecem em `ai_usage_events`** no
  período. Não exercitei as chaves — testá-las gastaria dinheiro.

**Aviso de instabilidade:** `public.leads` devolveu **483 → 501 → 483** em
leituras da mesma sessão, por resíduo de contrato de outra frente rodando em
paralelo. Nenhum número de lead aqui é estável além do instante da medição.
