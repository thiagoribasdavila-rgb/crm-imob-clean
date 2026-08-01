# REDUÇÃO DE CLIQUES — O QUE FOI MEDIDO E O QUE NÃO FOI

**2026-07-31.** Este relatório existe para ser honesto sobre uma coisa: **os dez
fluxos pedidos não foram cronometrados nesta rodada.** Nenhum número de "antes e
depois" aparece aqui, porque não houve o "antes".

Publicar uma tabela de redução sem medição seria a métrica de vaidade que o
próprio briefing manda evitar.

## O QUE JÁ EXISTE NO PRODUTO, MEDIDO NO CÓDIGO

| mecanismo pedido | estado | evidência |
|---|---|---|
| persistência de filtros | **existe** | `sessionStorage` + hidratação, `app/(crm)/leads/page.tsx` |
| abertura contextual por URL | **existe** | `/leads?attention=never_contacted` valida contra a lista do seletor |
| ações em lote | **existem** | `bulk-stage`, `bulk-transfer` |
| retorno ao mesmo contexto após salvar | **existe** | o filtro salvo é reidratado |
| valores padrão inteligentes | **parcial** | SLA por origem (Meta 5 min, portal 15 min) |
| edição inline | **não medida** | — |
| atalhos de teclado | **não medidos** | — |
| comandos rápidos | **existe** (⌘K na barra) | não cronometrado |

## OS DEZ FLUXOS — ESTADO REAL

| # | fluxo | cliques hoje | depois | medido? |
|---|---|:--:|:--:|:--:|
| 1 | entrada até atendimento do lead | — | — | **não** |
| 2 | abertura da visão 360 | — | — | **não** |
| 3 | criação de tarefa | — | — | **não** |
| 4 | agendamento de follow-up | — | — | **não** |
| 5 | alteração de estágio | — | — | **não** |
| 6 | atribuição de responsável | — | — | **não** |
| 7 | recomendação de imóvel | — | — | **não** |
| 8 | consulta de histórico | — | — | **não** |
| 9 | redistribuição de lead | — | — | **não** |
| 10 | aprovação de campanha | — | — | **não** |

## O QUE ESTA RODADA FEZ QUE REDUZ TRABALHO DE VERDADE

Não em cliques — em **decisões que a pessoa não precisa mais tomar**:

| entrega | o que deixa de ser trabalho humano |
|---|---|
| importador de investimento | ninguém precisa abrir o Gerenciador de Anúncios para saber quanto se gastou |
| reconciliação gasto × lead | ninguém precisa cruzar duas planilhas para descobrir que as contas não batem |
| sombra de redistribuição | a fila de 20 leads abandonadas com destino sugerido chega pronta, em vez de ser garimpada em 358 |
| recusa de CPL sem base | ninguém precisa desconfiar do número — o produto desconfia primeiro |

## COMO MEDIR, QUANDO FOR MEDIR

Para cada fluxo, com usuário descartável e o navegador instrumentado: contar
**cliques**, **mudanças de rota** e **tempo até o estado final**, três vezes,
registrando a mediana. Sem as três repetições, a diferença cabe no ruído.
