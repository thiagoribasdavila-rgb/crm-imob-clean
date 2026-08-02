# Sala de comando — referência visual do dono (01/08/2026)

O dono mostrou um mockup e pediu: *"deixar a sala de comando parecida com essa
com os dados nossos reais"*. Este arquivo registra o desenho e — o que importa
mais — **de onde sai cada número**, porque a distância entre o mockup e o
produto não é de layout: é de dado disponível.

## O desenho, em quatro faixas

**Faixa 1 — seis cartões de KPI**, cada um com ícone, valor grande, e delta
`↑ X% vs 30 dias`: Leads Totais · Leads Ativos · Em Atendimento · Negociações ·
VGV em Negociação · Conversão Geral.

**Faixa 2 — três painéis**: Funil de Vendas (funil em degraus, com contagem e
percentual por etapa) · Atividades em Tempo Real (feed com ícone por canal e
"há X min") · Performance da Equipe (ranking de corretor com barra de progresso,
leads e conversão).

**Faixa 3 — três painéis**: Evolução de Leads (série temporal de 3 linhas —
novos, qualificados, negociações — com tooltip) · Top Projetos (barras por VGV)
· Alertas Inteligentes (lista com severidade e link de ação).

**Faixa 4 — Insights do Copiloto**: quatro cartões (Oportunidade, Tendência,
Recomendação, Atenção) com frase curta e ação.

## O que EXISTE hoje no banco (medido em 01/08/2026)

| painel | fonte real | estado |
|---|---|---|
| Leads Totais / Ativos | `leads` (490 linhas) | **existe** |
| Em Atendimento / Negociações | `leads.status` + `pipeline_stage_moves` | **existe** |
| Funil de Vendas | `pipeline_stage_moves` é a fonte canônica de movimentação | **existe** |
| Performance da Equipe | `profiles` (6 ativos) + `leads.assigned_to` | **existe** |
| Top Projetos | `crm_projects` (4: Arvo, Inside Perdizes, Spin Mood, Tiê) | **existe** |
| Atividades em Tempo Real | `activities` | **existe** |
| Alertas Inteligentes | `lead_alerts`, `ai_shadow_decisions` | **existe** |
| Insights do Copiloto | `ai_insights`, `atlas_recommendations` | **existe** |
| Evolução de Leads (série) | `leads.created_at` agregado por dia | **existe** |
| **VGV em Negociação** | — | **NÃO EXISTE valor de negócio confiável** |
| **Delta `vs 30 dias`** | — | **exige série histórica que só o `created_at` sustenta** |

## As duas armadilhas deste mockup

**1. VGV.** O mockup mostra `R$ 24,7M em negociação` e `Top Projetos por VGV`
com valores por projeto. Medido: não há campo de valor de negócio preenchido de
forma confiável nas 490 leads. Desenhar esse painel com número inventado
transforma a sala de comando numa tela que MENTE — e este produto já pagou caro
por isso (`marketing_spend` teve zero escritores por semanas enquanto a tela
mostrava número).

Ou o painel sai, ou nasce declarando "sem lastro" até haver dado.

**2. Os deltas `↑ 12,5% vs 30 dias`.** Exigem comparar duas janelas. `created_at`
sustenta a contagem de leads; conversão e VGV, não. Delta sem série é opinião
com seta.

## Regra que vale para tudo aqui

Número na sala de comando é decisão de verba e de gente. **Sem lastro, sem
número** — a mesma regra já aplicada em `usageCost`: quando não há tarifa, o
custo é NULO, não zero. Zero parece saudável; nulo diz a verdade.

## Leis técnicas (ver também o workflow em execução)

SVG à mão, sem biblioteca nova · sem `canvas` (`fillStyle` não resolve `var()`)
· cor só por token, alfa por `color-mix()` · catraca `cor-cravada` em 326, só
desce · contraste ≥4,5 nos DOIS temas E contra os dois fundos (branco e
`--atlas-surface-subtle`) · uma primitiva de painel (`cc6-panel`) · alvo de
toque 44px · escala 10/11/13/20/34.
