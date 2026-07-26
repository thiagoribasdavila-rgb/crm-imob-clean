# Três eficiências reais — o CRM como autonomia controlada

Escrito em 2026-07-26, a partir do que foi **medido** nesta base, não do que
seria bonito propor. Cada uma diz o que muda, quanto custa, o que ela NUNCA
decide sozinha e como se prova que funcionou.

O princípio comum: **a máquina executa o reversível e propõe o irreversível.**
Autonomia sem essa fronteira é só automação com nome caro.

---

## Estado medido que motiva as três

| fato | número |
|---|---|
| Leads na base | 214 |
| Leads da única campanha real da Meta | 24 |
| Leads dessa campanha **contatadas** | **0** |
| Leads com SLA de primeiro contato vencido | 210 |
| Leads vencidas há mais de 48h (fora de recuperação) | 201 |
| Campanhas com gasto/CPL disponível | 0 — a API de anúncios não está conectada |

A conclusão que salta: **o gargalo não é aquisição, é atendimento.** Comprar mais
leads hoje aumenta o volume de gente não atendida.

---

## Eficiência 1 — Distribuição preditiva com reversão automática

**O que muda.** Lead nova é atribuída ao corretor com maior probabilidade de
responder **dentro do prazo da origem** (5 min para Meta, 15 para portal), e não
por rodízio. O sinal já existe e não precisa de IA nova: `first_response_minutes`
e `first_contact_sla_met`, que a Fase 34 grava desde ontem.

Quando o prazo vence sem contato, a lead **volta para a fila** e é reatribuída
uma única vez — para outro corretor, com registro do motivo.

**Por que é a de maior retorno.** Uma lead de Lead Ads tem meia-vida de minutos.
Hoje ela é distribuída por regra fixa e, se o corretor estiver em visita, ela
morre esperando. Reversão automática transforma um SLA perdido em uma segunda
chance real, dentro da janela em que ainda existe conversa.

**Autonomia: A2 com trava.** A reatribuição é reversível (a lead não some, muda
de dono e o histórico registra), então a máquina executa. Mas:

- reatribui **no máximo uma vez** por lead — a segunda vira tarefa para o gerente;
- não reatribui fora da janela de recuperação (48h): lead antiga é reativação, não SLA;
- não reatribui lead que já teve contato registrado;
- teto por execução, para não esvaziar a carteira de ninguém de uma vez.

**Custo.** Zero de IA. É consulta e escrita no banco.

**Prova de que funcionou.** `complianceRate` do bloco `firstContactSla` do
`/api/v1/pipeline` sobe, e `averageResponseMinutes` cai. Com 5+ amostras a taxa
já é publicada; abaixo disso ela vem `null` de propósito.

**Estado hoje.** O vigia (`/api/v2/crm/first-contact-sla/process`) já avisa e
cobra; a reatribuição está atrás de `ATLAS_SLA_AUTO_REASSIGN`, **desligada**,
esperando a regra de distribuição ser aprovada. É a decisão que falta, não o código.

---

## Eficiência 2 — Sinal de fundo de funil de volta para o Andromeda

**O que muda.** Hoje a Meta só recebe de volta "formulário preenchido". Com isso,
o Andromeda otimiza para **quem preenche formulário** — que é exatamente o
público mais barato e menos qualificado que existe. O CRM sabe muito mais:
quem atendeu o telefone, quem agendou visita, quem fez proposta, quem comprou.

A proposta é exportar, via CAPI, os eventos de **estágio profundo** com o
`campaign_external_id` que a atribuição agora guarda — e que passou a estar
religado em `leads.campaign_id` desde a migration de hoje.

**Por que só agora é possível.** Até esta manhã, `leads.campaign_id` era nulo em
214 de 214 leads e `marketing_campaigns` estava vazia. Não havia como dizer de
qual campanha veio uma venda. O elo existe agora: 1 campanha, 24 leads.

**Autonomia: A1 (executa) para o envio, A0 (só propõe) para a verba.** Enviar
evento de conversão é aditivo e reversível — a máquina envia. Mudar orçamento ou
pausar campanha com base nesse sinal continua exigindo aprovação humana em
`/approvals`.

**Custo.** Zero de IA. Chamada de API por evento.

**Prova de que funcionou.** Duas medições, nesta ordem:
1. o volume de eventos de fundo de funil aceitos pela Meta sai de zero;
2. o **CPL de lead que avança** (não o CPL bruto) cai ao longo de 2–3 semanas.
   Antes disso não há amostra: declarar vitória na primeira semana é ler ruído.

**Pré-requisito honesto.** Precisa de token de system user válido do Business
Manager correto. Sem ele isto é código pronto e desligado — e deve ser
apresentado como desligado, não como "integrado".

---

## Eficiência 3 — Fila única de trabalho, montada pelo sistema

**O que muda.** O corretor deixa de escolher o que fazer. Ao abrir o Atlas, ele
recebe **uma fila ordenada por consequência**, não por data de entrada:

1. primeiro contato vencendo (minutos de vida);
2. primeiro contato vencido dentro da janela de recuperação;
3. visita agendada para hoje sem confirmação;
4. proposta parada há mais de N dias;
5. o resto.

**Por que importa.** Escolher o que fazer é a tarefa cognitiva mais cara do dia e
a que o corretor faz pior — ele escolhe por afinidade com o lead, não por
urgência. Uma fila montada pelo sistema devolve horas e, principalmente, coloca a
lead de 5 minutos na frente da lead de três semanas.

**Autonomia: A1.** Ordenar é reversível e não escreve nada. A máquina ordena; o
corretor pode ignorar a ordem — e o fato de ele ignorar vira dado sobre a regra
estar errada.

**Custo.** Zero de IA. É ordenação sobre dados já carregados.

**Prova de que funcionou.** Tempo mediano até o primeiro contato cai, e a
proporção de leads tocadas nas primeiras 24h sobe. Ambos já são mensuráveis desde
que o relógio de SLA passou a fechar.

**Estado hoje.** Metade entregue: a fila da tela de leads já ordena por urgência
de primeiro contato (rank negativo acima de follow-up e score) e a API aceita
`sort=first_contact_sla`. Falta unificar visita, proposta e tarefa na **mesma**
fila — hoje moram em telas diferentes, o que devolve ao corretor exatamente a
decisão que a eficiência pretende tirar dele.

---

## O que as três têm em comum

Nenhuma delas depende de modelo novo, e nenhuma gasta com IA. As três funcionam
com dados que o CRM já tem — o que faltava era **o elo**: o relógio que fechava,
a campanha que se ligava à lead, a fila que ordenava por consequência.

E nenhuma delas move verba sozinha. Orçamento, pausa de campanha e envio de
mensagem ao cliente continuam onde devem estar: atrás de uma aprovação com nome,
hora e motivo.
