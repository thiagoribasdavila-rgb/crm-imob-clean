# Fase 3 — ROI

> ## Não existe ROI calculável hoje. Nenhum.
>
> Não porque ninguém tentou calcular, e não porque o retorno seja ruim: porque
> **o numerador não existe como número medido.**
>
> Este documento não contém um ROI. Contém a explicação de por que ele não pode
> existir ainda, e a lista exata do que precisa passar a existir.

Medido em `pozbrcsfthnhmnebfoxv`, **2026-07-30 05:04 UTC**.

---

## 1. A conta que não fecha

```
              retorno medido − investimento medido
    ROI  =  ───────────────────────────────────────
                    investimento medido
```

| Termo | Estado |
|---|---|
| **retorno medido** | **NÃO MEDIDO** — 0 vendas com valor apurado |
| **investimento medido** | **PARCIAL** — 4 de 7 linhas de custo; 4 dias, não um mês |

Com o numerador ausente e o denominador parcial, **qualquer número publicado
aqui seria invenção.** Um ROI inventado é a pior coisa que este conjunto de
documentos poderia conter, porque é o número que autoriza gasto.

---

## 2. O numerador: "não medido" não é "zero"

A distinção é a parte mais importante deste documento.

```
leads.sale_value_brl > 0 ........................... 0 de 483
external_sales_records com estimated_value > 0 ..... 0
rótulos de desfecho positivo ....................... 4
   won ............................................. 2
   external_purchase ............................... 2
```

**Existem 4 desfechos positivos rotulados e ZERO com valor.** Então a receita
desta operação não é R$ 0,00 — é **desconhecida**. Pode ter havido negócio cujo
valor ninguém lançou.

Escrever "receita = 0" seria tão errado quanto inventar um valor: afirmaria uma
medição que não houve. **Etapa é declaração; valor é fato.** O fato está vazio.

E mesmo que os 4 ganhassem valor amanhã, **4 não é uma taxa**. Com menos de 20
vendas, um único negócio move a taxa de conversão em **mais de 5 pontos
percentuais** — por isso `MINIMO_DE_VENDAS_PARA_TAXA` é 20, e por isso
`projetarComercial` **não tem ramo que chute**: sua assinatura recusa de propósito
qualquer parâmetro de "taxa sugerida", porque parâmetro de fallback é como um
chute entra num módulo que jurou não chutar.

---

## 3. O denominador: parcial, e honesto sobre o que falta

```
Supabase ............ plano free ......... R$ 0/mês        [medido]
Armazenamento ....... plano free ......... R$ 0/mês        [medido]
Mapas ............... PostGIS local ...... R$ 0/mês        [medido]
IA .................. 26–29/07 ........... US$ 0,011459    [medido, 4 dias]
WhatsApp ............ .................... NÃO MEDIDO      [fora do sistema]
Hospedagem .......... Hostinger .......... NÃO MEDIDO      [fora do sistema]
Domínio ............. .................... NÃO MEDIDO      [fora do sistema]
```

Três das sete linhas só existem em fatura — o banco jamais vai conhecê-las. Estão
**declaradas** em `lib/finops/catalogo-de-custo.ts` para que a soma não pareça
completa. Item declarado sem medição aparece como "não medido" com motivo, nunca
como zero.

**E há ponto cego dentro da linha medida:** 6 das 21 chamadas cobráveis de IA
(**28,6%**) têm `estimated_cost_usd` **nulo**. Custo não medido, não custo zero.

Não existe "custo mensal" porque **não existe mês de operação**: 4 dias de tráfego
de teste, 9 leads atendidos, nada publicado. Multiplicar 4 dias por 7,5 daria um
número, e o número seria invenção com aparência de projeção.

---

## 4. Custo por lead atendido: por que não publico

O gate pede este número. Ele **não é calculável de forma útil hoje**, por três
motivos simultâneos:

1. **Numerador incompleto** — cobre 4 de 7 linhas de custo, com 28,6% de ponto
   cego dentro da linha de IA.
2. **Denominador minúsculo** — **9 leads** com primeiro contato registrado, de 483.
3. **Denominador instável** — `public.leads` devolveu **483 → 501 → 483** em
   leituras da mesma sessão (e 750 e 623 em leituras anteriores), por resíduo de
   contrato de outra frente. E há **duas réguas** divergentes de "lead aberto":
   112 pela RPC, 110 pela listagem.

`US$ 0,011459 ÷ 9` produziria um número. Esse número seria lixo com quatro casas
decimais — e alguém decidiria com ele.

---

## 5. A PRIMEIRA MÉTRICA que precisa existir

> ## Uma venda registrada com valor apurado em `leads.sale_value_brl`.

É isso. Uma linha.

**Por que esta, e não outra:** ela é o único insumo que **seis** requisitos do
gate compartilham. Sem ela não existe conversão, ticket médio, VGV, custo por
venda, baseline de modelo — nem ROI.

**O que ela ainda não resolve, para não haver ilusão:** uma venda não é uma taxa.
A escada é:

| Marco | Habilita | Distância medida hoje |
|---|---|---|
| **1 venda com valor** | numerador existe; ROI passa a ser *calculável* | faltam **1** |
| **20 vendas com valor** | taxa de conversão e ticket **observados** | faltam **20** |
| **100 exemplos / 20 positivos / 20 negativos** | primeiro modelo calibrado admissível (piso da RPC viva `build_conversion_calibration_candidate`, Fase 77) | faltam **99 exemplos e 20 negativos** |
| **4 linhas fechadas por tipo de movimento** | `trustByMoveKind` sai de "coletando base"; a IA passa a **encolher a própria projeção quando erra para mais** | ledger tem **0 linhas** |

**Segunda métrica, em paralelo:** **um mês corrido de custo**, com as 3 linhas
"fora do sistema" lançadas de fatura. Sem ela o denominador continua parcial mesmo
depois de a receita existir.

---

## 6. O que já está pronto para calcular ROI no dia em que houver número

Isto é o que as fundações desta rodada entregaram — e é a razão de o documento
ser curto:

| Peça | O que faz | Estado |
|---|---|---|
| `ai_projection_ledger` | guarda projeção e realizado da mesma decisão | tabela já existia, era **órfã**; gravação **ligada** hoje na decisão de campanha |
| `comparacaoDoLedger()` | veredito projeção × realizado, com erro % e viés | provado contra o banco: erro 60%, veredito `otimista_demais`, correção ×0,5 |
| `projetarComercial()` | **único** caminho para número de venda/receita/VGV | recusa sem 20 vendas; sem ramo de chute |
| `registro-de-modelos` | admite/recusa cada modelo com o número que falta | 2 admitidos, 8 recusados |
| `grafo_censo_de_prontidao` | veredito calculado das 7 perguntas | 2 SIM, 5 NÃO |

**Quando a primeira venda com valor for lançada, nada aqui precisa ser
reescrito.** Os mesmos juízes que hoje recusam passam a admitir, e o documento de
ROI passa a ter conteúdo — sem ninguém editar uma linha de prosa.

**O que falta ligar:** `fecharComRealizado()` está escrito e provado, mas **nenhum
worker o chama** (falta entrada em `config/workers-schedule.json` + crontab). Sem
isso as linhas do ledger nascem abertas e ficam abertas.

---

## 7. ROI da Fase 3, especificamente

**Não estimável, e a razão não é falta de esforço:** 9 das 10 tecnologias estão
bloqueadas por **dado**, não por dinheiro (`FASE_3_CUSTOS.md`). Uma tecnologia sem
insumo tem retorno **estruturalmente zero**, qualquer que seja o preço:

- **AVM** sem preço (0/4 empreendimentos, 0/6 tipologias) não avalia nada.
- **Digital twin de empreendimento** sem unidade (0 linhas) não simula nada.
- **Computer vision** sem mídia não extrai nada.
- **Data warehouse** sobre 483 leads não acelera nada.
- **Voice AI** sem consentimento por pessoa (`lead_contact_preferences`: **0
  linhas**) não pode nem ligar.

**Retorno zero com custo positivo é ROI negativo — e esse é o único sinal de ROI
que este documento pode afirmar com honestidade sobre a Fase 3 iniciada hoje.**

---

## 8. Onde o retorno está, medido, e é gratuito

Se a pergunta é "o que dá retorno agora", a resposta não está na Fase 3:

| Ação | Efeito medido | Custo |
|---|---|---|
| **Alguém abrir o app** | destrava a redistribuição — hoje o sistema moveria **ZERO**, porque nenhum dos 11 substitutos passa pela porta de presença de 90s | **R$ 0** · 30 s |
| **Redistribuir** | 468 leads em carteira ÷ 12 corretores = **39,00** por pessoa, contra **272 numa só** e **9 carteiras vazias**: **233 leads** acima da média numa carteira | **R$ 0** |
| **Atacar a fila de 1º contato** | **474 de 483** leads sem primeiro contato registrado | **R$ 0** |
| **Lançar o valor da 1ª venda** | destrava seis requisitos do gate | **R$ 0** |

**O gargalo medido é distribuição, não capacidade.** Contratar não resolve o que
redistribuir resolve hoje — e redistribuir é gratuito.

---

## Conclusão

**ROI: não calculável.** Numerador não medido, denominador parcial.

**Primeira métrica a existir:** uma venda com valor apurado em `sale_value_brl`.

**Recomendação:** não investir em tecnologia de Fase 3 até que a Onda 1 do
`FASE_3_ROADMAP.md` — que custa **R$ 0,00** e não passa por engenharia — tenha
produzido os números que este documento hoje precisa declarar como ausentes.
