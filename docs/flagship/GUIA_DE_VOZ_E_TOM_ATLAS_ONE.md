# GUIA DE VOZ E TOM — ATLAS ONE

**2026-07-31.** Este guia não foi inventado: ele **descreve a voz que o produto
já tem** nos lugares onde ela ficou boa, e nomeia o padrão para o resto seguir.

## A REGRA QUE VALE MAIS QUE TODAS

> **Zero com explicação é diagnóstico. Zero mudo parece defeito. Número
> inventado vira decisão de verba.**

É a regra que este produto pagou caro para aprender, e ela governa todo o texto.

## COMO O PRODUTO FALA

| dimensão | é | não é |
|---|---|---|
| pessoa | direto com quem opera | impessoal corporativo |
| tempo | presente | futuro do pretérito |
| tamanho | uma frase | parágrafo |
| tom | colega experiente | assistente animado |
| erro | o que aconteceu + o que fazer | pedido de desculpa |

## OS QUATRO ELEMENTOS DE TODA MENSAGEM DE FALHA

1. **o que não foi concluído** — nomeando o objeto, não a operação técnica
2. **se o dado foi preservado** — a primeira pergunta de quem acabou de digitar
3. **o que fazer agora**
4. **como tentar de novo**

**Inadequado:** `Erro 500 ao processar request.`
**Adequado:** `Não foi possível salvar o lead. As alterações continuam nesta tela. Verifique sua conexão e tente novamente.`

**Medido:** o produto tem **0** `.stack` exposto em `.tsx` e **0** `catch {}`
silencioso. A base do padrão já está de pé.

## FRASES QUE O PRODUTO JÁ ACERTA — use como modelo

Estas existem no código hoje e são o padrão a seguir:

> "Nenhuma lead aqui agora, mas 3 já passaram por esta etapa desde 27/07. A etapa
> esvaziou — o funil vazou aqui, não deixou de chegar."

> "Não dá para calcular custo por lead: R$ 3.612,01 foram gastos em 7 campanhas
> que não trouxeram nenhuma lead a este CRM. Dividir um pelo outro daria um
> número plausível e falso — são contas de anúncio diferentes."

> "362 lead(s) vencidas há mais de 48h não viraram tarefa de SLA: passaram do
> ponto de recuperação por velocidade e precisam de campanha de reativação."

O que as três têm em comum: **o número, o denominador e a consequência**, em uma
frase, sem adjetivo.

## VOCABULÁRIO — UM TERMO POR COISA

| use | nunca |
|---|---|
| lead | contato, prospect, oportunidade |
| corretor | vendedor, agente, consultor |
| carteira | base, lista |
| etapa | fase, status (na tela) |
| descarte | perda, exclusão |
| primeiro contato | contato inicial, abordagem |
| investimento | verba, budget, spend |

## BOTÕES: O VERBO E O OBJETO

**Nunca:** Confirmar · Continuar · Executar · Processar · OK
**Sempre:** Atribuir corretor · Mover para proposta · Pausar campanha · Arquivar lead

**Medido:** 1 ocorrência de texto vago no produto (`>Confirmar<`). Não corrigida
nesta rodada — está em `AUDITORIA_DE_CONSISTENCIA_FINAL.md` como C-05.

## O QUE NUNCA APARECE PARA O USUÁRIO FINAL

stack trace · código HTTP cru · nome de tabela ou coluna · "request", "payload",
"fetch", "endpoint" · sigla sem explicação na primeira aparição · texto que culpa
quem clicou.
