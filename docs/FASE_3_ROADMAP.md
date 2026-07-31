# Fase 3 — Roadmap

> **Ordem de dependência, não ordem de desejo.**
> Nada aqui tem data. Cada item tem **pré-requisito medido** e **critério de
> saída verificável**. Item sem pré-requisito atendido não é "próximo": é
> bloqueado, e está marcado como tal.

Medido em `pozbrcsfthnhmnebfoxv`, **2026-07-30 05:04 UTC**.

---

## Legenda

| Marca | Significado |
|---|---|
| **DESTRAVADO HOJE** | as fundações desta rodada removeram o bloqueio |
| **PRONTO** | pré-requisitos atendidos; pode começar |
| **BLOQUEADO por dado** | falta insumo; nenhum código resolve |
| **BLOQUEADO por decisão** | falta o dono decidir |
| **POSTERGADO** | tecnicamente possível, sem sintoma que justifique |

---

## Onda 0 — O que HOJE já destravou

Não é plano; é registro. Estes bloqueios deixaram de existir nesta rodada, a
**R$ 0,00**.

| Item | Antes | Agora | Onde |
|---|---|---|---|
| **Medir se há dado para cada pergunta comercial** | opinião | veredito **calculado**: 2 de 7 com dado | `lib/crm/grafo-de-receita.ts` · 9 funções `grafo_*` |
| **Responder "e se eu redistribuir?"** | aritmética otimista | **0 leads moveriam hoje**, com a porta que fecha nomeada | `lib/atlas/gemeo-digital.ts` |
| **Impedir modelo sem baseline** | nada impedia | **8 de 10 recusados**, com o número que falta | `lib/ai/registro-de-modelos.ts` |
| **Comparar projeção × realizado** | `ai_projection_ledger` **órfã** (nada escrevia, nada lia) | gravação ligada na decisão de campanha | `lib/ai/ledger-de-projecao.ts` |
| **Leads semelhantes** | não respondível | **respondível**: 192 leads em empreendimento, 8 fontes | `grafo_leads_semelhantes` |
| **Oportunidades de recuperação** | não respondível | **respondível**: 474 recuperáveis, com consentimento em coluna separada | `grafo_oportunidades_de_recuperacao` |
| **Carga da equipe / tempo até esgotar a fila** | não previsto | **admitidos** (aritméticos, conferíveis à mão) | `lib/ai/previsao-aritmetica.ts` |
| **Achar lacuna de demanda × oferta** | inexistente | achado imediato: o **único** empreendimento com tipologias é o **único sem demanda nenhuma** | `grafo_demanda_x_oferta` |

**O que estas fundações NÃO destravaram, e é honesto dizer:** nenhuma tem rota
HTTP para o corretor. O grafo é usável por `service_role`, não por pessoa. As 9
funções já recebem `p_ator_id` para que a rota, quando existir, não invente cerca.

---

## Onda 1 — Custo R$ 0, sem código, destrava o resto

**Nada abaixo depende de programação.** É a onda de maior retorno do programa
inteiro, e não passa por engenharia.

### 1.1 · Alguém abrir o app — **PRONTO**
- **Pré-requisito:** nenhum.
- **Destrava:** redistribuição de **233 leads** presos numa carteira.
  `commercial_presence` está parada há mais de 5 dias; 11 substitutos passam por
  equipe+papel+atividade e **nenhum** pela porta de presença de 90s.
- **Critério de saída:** ≥1 corretor com presença dentro de 90s **e** a
  redistribuição movendo >0 lead.
- **Esforço:** 30 segundos. **É o item de melhor razão esforço/efeito do
  documento.**

### 1.2 · Decidir sobre o projeto aposentado — **BLOQUEADO por decisão**
- **Fato:** `atlas-ai-crm-v1` está **ACTIVE_HEALTHY** com **17.151 leads reais**.
- **Destrava:** um slot de projeto no plano `free` (os 2 estão tomados) — logo,
  destrava a própria possibilidade de um ambiente de produção limpo.
- **Critério de saída:** exportado-e-excluído, **ou** declarado formalmente como
  arquivo com dono, prazo e base legal.
- **Só o dono pode.** É o risco R1 e não é tarefa de código.

### 1.3 · Registrar o valor da primeira venda — **BLOQUEADO por dado**
- **Fato:** `sale_value_brl > 0` em **0 de 483**; `external_sales_records` com
  valor: **0**. Existem 2 rótulos `won` — etapa é declaração, valor é fato.
- **Destrava:** o denominador de **tudo** (ROI, conversão, ticket, VGV, custo por
  venda) e a primeira linha do baseline.
- **Critério de saída:** ≥1 linha com valor apurado. Depois: **20** para taxa
  (`MINIMO_DE_VENDAS_PARA_TAXA`); **100/20/20** para modelo calibrado.
- **É o item mais importante do programa.**

### 1.4 · Cadastrar o acervo por unidade — **BLOQUEADO por dado**
- **Fato:** `units` 0 + `inventory_units` 0 + `properties` 0 = **zero linhas**;
  `units_available` nulo nas 6 tipologias.
- **Destrava:** demanda × oferta, estoque de baixa saída (a conta **mais simples**
  das dez e a **mais longe**, por falta de cadastro), digital twin de
  empreendimento, e o lado da oferta do AVM.

### 1.5 · Preço e bairro de um 2º empreendimento no mesmo bairro — **BLOQUEADO por dado**
- **Fato:** **0 pares comparáveis.** Os 3 com bairro estão em Paraíso, Perdizes e
  Aclimação — 3 bairros distintos.
- **Destrava:** "clientes para estoque novo" — a pergunta que **falha por uma
  exigência só**, a mais próxima de virar SIM.

### 1.6 · Coletar motivo de perda na ficha do Lead 360 — **PRONTO**
- **Fato:** 91 rótulos `lost` existem, mas só o **Kanban** coleta motivo; a ficha
  do Lead 360 não pede.
- **Destrava:** a classe negativa. Sem perda classificada não há risco de perda
  previsível.

### 1.7 · Rotular vitória em mais de uma campanha — **BLOQUEADO por dado**
- **Fato:** base existe (2ª campanha com 12 desfechos); **vitórias não** — 2 na
  base inteira, as duas na mesma campanha.
- **Destrava:** "campanha por perfil". Falha por uma exigência só.

---

## Onda 2 — Fase 1 estável (pré-requisito do gate)

Sem esta onda o gate 5.13 **não pode** ser atendido, independente de qualquer
tecnologia de Fase 3.

### 2.1 · Tirar o artefato de deploy do banco aposentado — **PRONTO, e é urgente**
**Portão executado** (`node scripts/check-coerencia-de-ambiente.mjs`):
**REPROVADO, 3 incoerências.**

1. `ATLAS_ENV=production` sem projeto Supabase conhecido, com banco de
   homologação configurado.
2. **`.env.hostinger`** aponta para o projeto **APOSENTADO**
   `ietwopslgqxlenfyghqk` (**17.151 leads reais**) em `NEXT_PUBLIC_SUPABASE_URL`
   e `DATABASE_URL`.
3. **`.env.hostinger-template`** idem.

**Publicar hoje conectaria a aplicação à base com dado real de 17.151 pessoas.**
Por isso este item vem **antes** de 2.4, e não como detalhe de configuração.

- **Critério de saída:** portão de coerência **verde** — as três verdades
  batendo (variável declarada, URL do banco, arquivo de deploy).
- **Nunca** afrouxar o portão. Corrigir no `.env`.
- Enquanto vermelho, **`npm run test:real` não prova nada**: mede um ambiente e
  valida contra outro.

### 2.2 · Fechar RLS nas tabelas que vazam — **PRONTO**
- **Fato:** 185/185 com RLS ligada, mas **2** com política RESTRICTIVE; 183
  permissive-only. Vazamento provado executando em `activities`, `customers`,
  `profiles`, `opportunities`.
- **Também:** revogar `EXECUTE` de `anon` em
  `public.registra_alerta_de_lead()` (`SECURITY DEFINER`, `facing: EXTERNAL`) e
  ligar a proteção contra senha vazada no Auth.
- **Critério de saída:** para cada tabela, linha de base medida **antes e depois**,
  e os **dois lados** provados — dono lê, terceiro não lê.
- **Pré-requisito de:** tours 360º, app nativo, qualquer exposição a
  `authenticated`.

### 2.3 · Remediar as migrations — **PRONTO**
- **Fato:** 171 no repo, 215 no banco, **interseção 0**.
- **Critério de saída:** interseção **> 0 e crescendo**, e `db push` que não
  aborta em ambiente limpo. Nunca "parece igual".
- **Pré-requisito de:** qualquer promessa de recuperação de desastre.

### 2.4 · Publicar — **BLOQUEADO por 2.1, 2.2, 2.3**
- **Fato:** 834 commits que `origin/main` não tem; último commit no remoto de
  **2026-07-26**.
- **A ordem não é preferência, é segurança:** publicar antes de **2.1** conecta a
  aplicação ao banco **aposentado** (17.151 leads reais) — é o que os arquivos
  `.env.hostinger` apontam hoje, medido. Publicar antes de **2.2** expõe as 183
  tabelas permissive-only.
- **Critério de saída:** homologação limpa servindo, com **produção intocada**.

### 2.5 · Instalar o crontab dos workers — **PRONTO**
Cadências versionadas em `config/workers-schedule.json`; instalar o crontab é
etapa obrigatória do deploy. **Inclui a entrada que falta** para
`fecharComRealizado()` — sem ela, o ledger de projeção nasce aberto e nunca
fecha, e metade do seu valor fica na prateleira (R16).

### 2.6 · Aplicar o teto de carteira que a tela exibe — **PRONTO**
`broker_capacity_limits` tem 0 linhas → sem teto real, enquanto o payload devolve
`capacityEnforced: true` e a tela mostra teto 100 para quem tem 272.
**Critério de saída:** o payload só afirma `capacityEnforced: true` quando um teto
foi de fato conferido.

### 2.7 · Reconciliar as duas verdades vivas — **PRONTO**
- **Régua de "lead aberto"**: 112 pela RPC vs 110 pela listagem
  (`comprou_outro`). **Unifique a régua antes das funções** — unificar função com
  régua divergente troca uma divergência por outra.
- **Concentração de carteira** em `previsao-aritmetica.ts` e `gemeo-digital.ts`.
- **Régua de carteira em 3 cópias**: `estaNaMinhaCarteira`,
  `can_access_lead_row`, `ator_alcanca_lead`. Há contrato que **detecta**
  divergência; a eliminação da 3ª cópia é trabalho próprio, com escopo próprio.

### 2.8 · Normalizar bairro — **PRONTO**
`"VilaOlímpia"` (sem espaço) e `"Perdizes/Pompeia"` fragmentam o casamento.
`unaccent` + `pg_trgm` já **disponíveis**, ou tabela canônica de bairro.
**Pré-requisito de:** todo relatório e toda decisão de verba por bairro.

### 2.9 · Dar tenant a `lead_events` — **PRONTO**
**43 de 310** linhas com o `organization_id` da org viva. 86% do rastro de
interação fora de qualquer análise por empresa.

---

## Onda 3 — Fase 2 em produção, com número

Só depois da Onda 2. O gate exige Fase 2 **em produção**, não implementada.

| Item | Critério de saída |
|---|---|
| 3.1 Consertar o CAPI | evento com `attempts > 0` **e** `delivered_at` preenchido. Hoje: 1 evento, `attempts=0`, `delivered_at` nulo |
| 3.2 Ligar a distribuição automática | `whatsapp_broker_sessions > 0`; lead nova **não** cai no degrau 4 |
| 3.3 Corrigir `campaigns` órfã | 0 linhas com 24 leads apontando para lá; e `campaign_id` cobre 24 contra 212 do texto livre |
| 3.4 Consentimento por pessoa | `lead_contact_preferences` > 0. Hoje 0; a base legal vem da **fonte**, não da pessoa |
| 3.5 Equipe usando | **9 de 12 corretores ativos com carteira vazia**; **um único corretor** fez 136 das 137 movimentações. Saída: ≥3 pessoas e ≥2 semanas de janela (as portas de `simulateCapacity`) |
| 3.6 Rota HTTP do grafo | o corretor usando o que hoje só `service_role` alcança |
| 3.7 Custo mensal medido | ≥1 mês corrido **e** as 3 linhas "fora do sistema" (WhatsApp, Hostinger, domínio) com valor de fatura lançado |

---

## Onda 4 — Só então, Fase 3

**Reavaliar o gate 5.13 aqui.** Ordem entre as tecnologias definida por
dependência de dado, não por atratividade:

| Ordem | Tecnologia | Depende de | Estado hoje |
|---|---|---|---|
| 1º | **Integrações avançadas** | 3.1, 3.2 | consertar o que existe; fila com `pgmq` **já disponível**, R$ 0 |
| 2º | **AVM** | 1.4, 1.5, 20 vendas apuradas | sem preço nos dois lados |
| 3º | **Digital twin de empreendimento** | 1.4 + taxa de absorção | **0 unidades** |
| 4º | **Tours 360º** | 2.2 (RLS) + 1.4 | expõe camada não protegida |
| 5º | **Computer vision** | 4º (precisa da mídia) | sem entrada |
| 6º | **App nativo** | 2.2, 2.4, 3.5 | não faz 9 carteiras vazias trabalharem |
| 7º | **Voice AI** | 3.4 (consentimento **por pessoa**) | risco jurídico antes de custo |
| 8º | **Data warehouse** | volume medido | 483 leads não é volume |
| 9º | **Arquitetura de escala** | carga medida | 43 chamadas de IA em 4 dias |
| — | **Banco de grafos separado** | necessidade **comprovada** de escala/complexidade | **já resolvido em relações**; o grafo é esparso, não complexo |

---

## Onda 5 — Modelos estatísticos

**Última**, e sem exceção. O piso da RPC viva do banco é **100 exemplos / 20
positivos / 20 negativos**. Hoje: **1 ganho, 0 perdas**.

Marcos, em ordem:
1. 1ª venda com valor apurado (1.3)
2. **20** vendas → taxa de conversão observável
3. **100/20/20** → primeiro modelo calibrado admissível
4. 4 linhas fechadas por tipo de movimento → `trustByMoveKind` sai de "coletando
   base" e a IA passa a **encolher a própria projeção quando erra para mais**
5. `prediction_drift_reports` com `current_sample > 0` → drift observável
   (hoje 8 relatórios, **todos** com amostra 0)

**A ordem inversa é a armadilha.** Treinar antes destes marcos produz número com
selo de modelo e conteúdo de chute — e é exatamente o que o registro de modelos
existe para recusar.

---

## O caminho crítico, em uma frase

> **Abrir o app → redistribuir → registrar a primeira venda com valor → cadastrar
> o acervo → fechar RLS → remediar migrations → publicar → medir um mês →
> reavaliar o gate.**

Oito dos nove elos custam **R$ 0,00**. Nenhum é tecnologia de Fase 3.
