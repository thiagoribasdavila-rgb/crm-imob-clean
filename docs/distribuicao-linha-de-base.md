# Linha de base — antes de distribuir

**Capturada em 03/08/2026**, no banco vivo, ANTES de qualquer distribuição das 51
leads recuperadas da Meta. Existe para a Fase 2 ter contra o que medir: sem foto
do "antes", qualquer número depois parece bom.

## A equipe

| corretor | leads | em jogo | atividades | última atividade | tarefas | ganhos |
|---|---:|---:|---:|---|---:|---:|
| ddcorretorsp | **485** | 65 | **478** | 02/08/2026 | 6 | 2 |
| viniciusadolfodasilva | 2 | 2 | 1 | 01/08/2026 | 0 | 0 |
| francisco.junior1979.fsj | 1 | 1 | **0** | — | 0 | 0 |

**A operação é um corretor só.** 478 das 481 atividades do CRM inteiro são de uma
pessoa. Os outros dois têm 3 leads somadas e 1 atividade somada; um deles nunca
registrou nada.

Isto não é detalhe de contexto — é o fato que decide o piloto. Distribuir 10
leads em rodízio por três nomes coloca 6 ou 7 leads pagas nas mãos de duas contas
que nunca exerceram o fluxo. Pode ser exatamente o que a diretoria quer (ativar a
equipe), mas precisa ser uma escolha dita em voz alta, não um efeito colateral do
algoritmo.

## O acervo

| | |
|---|---:|
| leads da organização | 540 |
| **sem responsável** | **51** |
| sem responsável COM projeto (`development_id`) | **0** |
| eventos Meta importados | 80 |
| atividades no CRM | 481 |
| tarefas | 13 |

## A máquina de distribuição

| objeto | existe no banco vivo? | linhas |
|---|---|---:|
| `distribute_project_leads` | ✅ | — |
| `distribute_project_leads_v2` | ✅ | — |
| `distribute_project_leads_v3` | ✅ | — |
| `distribute_project_leads_v4` | ✅ | — |
| `accept_lead_assignment` | ✅ | — |
| `lead_distribution_events` | ✅ | **0** |
| `lead_distribution_history` | ✅ | 13 |
| `project_distribution_members` | ✅ | **0** |
| `lead_assignment_reservations` | ✅ | 10 |

Quatro motores convivendo é a assinatura de "caminhos divergentes". Duas tabelas
de histórico, uma vazia, é a assinatura de "duas verdades" ou de "construído e
nunca ligado". `project_distribution_members` vazia significa que a regra
"respeitar projetos" não tem dado nenhum para respeitar.

## Onde a Fase 2 vai medir

| métrica | tabela · coluna |
|---|---|
| lead recebida | `leads.assigned_to` · `assigned_user_id` |
| primeiro contato | `activities` (`user_id`, `lead_id`, `type`, `occurred_at`) |
| SLA | `first_contact_sla_policies` · `follow_up_sla_events` |
| atividade criada | `activities.created_at` |
| conversão | `leads.status` |
| histórico da escolha | `lead_distribution_events` (hoje vazia) |
