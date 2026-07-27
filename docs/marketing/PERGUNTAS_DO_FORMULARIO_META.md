# As perguntas do formulário Meta — o que perguntar e por quê

Este documento é o par do `lib/crm/lead-qualification-fields.ts`. A régua de
mapeamento casa por **padrão**, não por texto exato — mas padrão tem limite. Se
a pergunta for escrita muito diferente do que está aqui, ela chega no CRM como
"não mapeada": preservada, legível, mas fora dos filtros e fora da IA.

Escrever a pergunta como está abaixo é o que faz a informação virar decisão.

---

## Estado hoje (medido em 27/07/2026)

Dos 26 formulários da conta:

| | |
|---|---|
| só nome, e-mail e telefone | **14** |
| com pergunta própria | 12 |
| **ativos no ar** (Spin Mood v6, v7, Arvo v5) | **só nome, e-mail e telefone** |

As boas perguntas existem no seu histórico — ficaram nos formulários antigos.
Os que estão captando hoje não perguntam nada.

É por isso que o corretor abre uma lead e não sabe nada sobre ela.

---

## As três perguntas

Três, não cinco. Cada pergunta a mais derruba a taxa de conclusão do
formulário, e a quarta pergunta raramente muda quem o corretor liga primeiro.

### 1. Intenção — separa comprador de curioso

> **Você procura um imóvel para:**
> - Morar
> - Investir

Opção única. É a pergunta que mais muda o atendimento: quem vai morar quer
planta, vizinhança e escola; quem investe quer rentabilidade e liquidez. São
duas conversas diferentes desde o primeiro "oi".

`intencao: "morar" | "investir"` — e "investir para depois morar" cai como
investimento, de propósito.

### 2. Faixa de investimento — separa quem cabe de quem não cabe

> **Qual faixa de investimento?**
> - Até R$ 300 mil
> - R$ 300 mil a R$ 500 mil
> - R$ 500 mil a R$ 800 mil
> - Acima de R$ 800 mil

Opção única, faixas — nunca campo aberto. Campo aberto vem "depende",
"a combinar" e "o quanto for necessário", que não filtram nada.

Ajuste as faixas ao produto: se o Inside começa em R$ 600 mil, a primeira faixa
não deveria ser "até R$ 300 mil" — ela só serve para atrair quem não pode
comprar. **A faixa mais baixa da lista é a que define o piso do público que a
Meta vai buscar.**

`faixaInvestimento` guarda o texto exato que a pessoa escolheu. Não vira
número: "R$ 300 a 500 mil" não é um valor, e converter inventaria precisão.

### 3. Forma de pagamento — separa quem compra agora de quem compra um dia

> **Como pretende adquirir o imóvel?**
> - Financiamento
> - À vista
> - FGTS
> - Consórcio

`formaPagamento: "financiamento" | "a_vista" | "fgts" | "consorcio"`

Quem responde "consórcio" quase nunca compra neste trimestre. Quem responde
"à vista" fecha rápido. Essa única resposta reordena a fila do corretor.

---

## O que NÃO perguntar

**Nome do cônjuge, CPF, renda exata, data de nascimento.** Dado sensível
derruba a conclusão do formulário e cria obrigação de guarda que não compensa —
o corretor pergunta na conversa, quando já existe relação.

**"Quando pretende comprar?"** Parece útil e não é: quase todo mundo responde
"nos próximos 3 meses" porque é a resposta socialmente correta. Intenção de
prazo se descobre conversando, não em formulário.

**Perguntas de recrutamento em formulário de venda.** Vários formulários da
conta perguntam *"Você possui alguma experiência no mercado imobiliário?"* —
são campanhas de contratação de corretores. Misturar os dois envenena a
qualificação: a régua preserva a resposta mas **não** a trata como sinal de
compra.

---

## A contrapartida, dita com honestidade

Três perguntas a mais **reduzem o volume de leads**. Não tem como não reduzir —
é uma barreira a mais entre o clique e o envio.

O que muda é o que vem depois:

| | sem as perguntas | com as perguntas |
|---|---|---|
| leads/semana | mais | **menos** |
| o corretor sabe quem ligar primeiro | não | **sim** |
| a Meta aprende quem converte | não | **sim** (via CAPI) |
| custo por **venda** | — | tende a cair |

**O primeiro mês tem menos lead e parece pior.** É esperado, e é onde a maioria
desiste e volta atrás. O que compensa é o CAPI ligado: com o retorno de quem
virou visita e venda, a Meta reaprende para quem entregar e recupera volume —
agora do público certo.

Sem CAPI ligado, as perguntas só reduzem volume e o ganho fica só no
atendimento. Ainda vale, mas metade do benefício fica na mesa.

---

## Ordem para fazer

1. **Ligue o CAPI antes** (`META_CONVERSIONS_ACCESS_TOKEN`, Dataset em
   Integrações › Meta, promover para produção). Sem ele, o passo 2 só corta
   volume.
2. **Duplique** o formulário ativo em vez de editar — formulário Meta em uso
   não aceita edição de perguntas, e duplicar preserva o histórico do antigo.
3. Acrescente as três perguntas na ordem acima. A primeira é a que mais
   qualifica, e quem desiste no meio já respondeu a mais importante.
4. Troque o formulário do anúncio para o novo.
5. **Duas semanas medindo antes de concluir qualquer coisa.** Uma semana é
   ruído; o próprio motor do projeto exige 30 leads de amostra antes de
   classificar um criativo.

---

## Quando a régua não reconhecer

Pergunta nova cai em `naoMapeadas`: preservada e legível na lead, mas fora dos
filtros. Nada se perde — só não vira campo até alguém ensinar o padrão dela em
`lib/crm/lead-qualification-fields.ts`.

É o comportamento correto: melhor guardar sem entender do que descartar por não
entender. Foi assim que a informação se perdeu da primeira vez.
