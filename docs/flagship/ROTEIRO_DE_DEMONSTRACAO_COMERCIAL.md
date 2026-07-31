# ROTEIRO DE DEMONSTRAÇÃO COMERCIAL — 12 MINUTOS

**2026-07-31.**

> ⚠️ **O ambiente de demonstração NÃO foi construído, e a razão é dura:**
> não existe segundo ambiente. `atlas-v3-homologacao` **é** a produção. Criar
> leads, campanhas e usuários fictícios para demonstração significaria injetar
> dado falso na base viva — que é exatamente o que o dono proibiu e o que esta
> auditoria passou o mês desfazendo (9 contas de teste que contavam como
> corretores reais).
>
> Este roteiro, portanto, é sobre a **base real**, com 482 leads verdadeiras. Ele
> é mais forte assim: nada aqui é encenado.

## ANTES DE COMEÇAR

| pré-requisito | estado hoje |
|---|---|
| build publicado | ❌ **não** — a demonstração mostraria código antigo |
| crontab instalado | ❌ **não** — a fila não drena durante a demonstração |
| perfil de diretor | ✔ existe |

**Enquanto os dois primeiros não estiverem prontos, não demonstre.** O risco é
mostrar uma tela que o cliente não vai encontrar depois.

## O ROTEIRO

| min | tela | o que mostrar | a frase |
|---:|---|---|---|
| 0–1 | **Sala de comando** | 369 na carteira · 362 sem 1º contato · custo de IA US$ 0,01 em 30 dias | "A primeira coisa que ele mostra não é quanto vendemos. É o que está parado." |
| 1–3 | **Investimento** | R$ 3.612,01 em 7 campanhas · CPL **—** com o motivo escrito | "Ele se recusa a inventar o custo por lead. Diz que são contas diferentes, e por que." |
| 3–5 | **Saídas do funil** | 102 saídas · quantas sem uma ligação · dias até sair | "Não é 'a campanha é ruim'. É 'a lead foi comprada, guardada e largada'." |
| 5–7 | **Lead prioritária** | abrir a lead mais atrasada · histórico · próxima ação | "O corretor não reconstrói o contexto de cabeça." |
| 7–8 | **Movimentar no funil** | mover para perdido → **o produto exige o motivo** | "Ele cobra a classificação. E guarda — antes, ele cobrava e jogava fora." |
| 8–9 | **Descartes** | `/pipeline/discards` com os motivos reais | "É por isso que ele cobra." |
| 9–10 | **Agenda / tarefas** | o que vence hoje | "O SLA vira tarefa sozinho, com prazo por origem." |
| 10–11 | **Governança da IA** | níveis de autonomia · 20 recomendações **retidas**, 0 executadas | "A IA recomendou redistribuir 20 leads. Não redistribuiu nenhuma." |
| 11–12 | **Prontidão** | `/api/v1/ready` com o estado por integração | "Quando uma integração cai, ele diz. Não devolve zero fingindo que está tudo bem." |

## A PERGUNTA DIFÍCIL, E A RESPOSTA HONESTA

**"Quanto custa cada lead?"**

> "Hoje ele não responde — e essa é a resposta certa. A conta de anúncios que o
> sistema lê gastou R$ 3.612,01 e não trouxe nenhuma dessas leads. As leads que
> temos vieram de outra conta. Um CRM que dividisse um pelo outro te daria
> R$ 150,50 e você tomaria decisão de verba em cima disso. Este diz que não sabe,
> e diz o que falta para saber."

## O QUE **NÃO** MOSTRAR

campanhas ao vivo · qualquer envio de mensagem · a tela de integrações da Meta
(mostra estado de credencial) · qualquer coisa com dado de cliente real na tela
sem consentimento do cliente.
