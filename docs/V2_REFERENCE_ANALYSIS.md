# Atlas V2 Archive — análise de referência

## Origem e integridade

- Arquivo: `/Users/thiagoribasdavila/atlas-crm-v1/atlas-crm-v1-app/atlas-crm-v2-hostinger.zip`
- SHA-256: `ac42ead20ec4faff64953ea8066151df2b25ee2fe0eb6393acbfc3b969b9ac3a`
- Entradas: 1.556
- Integridade ZIP: aprovada
- Uso autorizado: referência técnica e funcional; não reinstalar como produto final.

## Conteúdo relevante

O arquivo contém 17 migrations, testes SQL, documentação de fechamento, 15 páginas operacionais, 17 APIs e componentes de CRM. O núcleo validado era:

- Supabase Auth com `profiles` e isolamento por organização;
- Dashboard baseado em leads, tarefas e follow-ups;
- lista de leads e Lead 360;
- pipeline com histórico automático de mudança;
- agenda, tarefas e follow-ups;
- gestão de corretores, capacidade e redistribuição com histórico;
- Copilot explicável por regras;
- knowledge lexical;
- captura inicial de Meta Lead Ads;
- atalho manual para WhatsApp Web.

## Modelo operacional recuperado

Fluxo comprovado no V2:

`Lead → Pipeline → Tarefa/Follow-up → Atendimento → Histórico → Dashboard`

Regras que permanecem válidas:

1. toda leitura e escrita pertence a uma organização;
2. redistribuição exige corretor real, ativo, disponível e confirmação;
3. mudança de etapa precisa gerar histórico imutável;
4. tarefa e follow-up precisam estar vinculados à lead sempre que possível;
5. a tela diária deve destacar vencidos, permitir concluir e reagendar;
6. WhatsApp manual não equivale a disparo oficial automatizado;
7. integração opcional indisponível não pode derrubar o Core CRM;
8. o Core só fecha com login, RLS e fluxo Lead → Pipeline → Tarefa comprovados.

## Banco V2

Tabelas criadas diretamente no arquivo:

- `organizations`
- `profiles`
- `lead_events`
- `lead_scores`
- `pipeline_history`
- `followups`
- `lead_distribution_history`

O V2 também dependia de tabelas preexistentes como `leads`, `tasks` e `customers`.

## Itens que não devem ser copiados

- pasta `.git` incluída indevidamente no ZIP;
- código completo e arquitetura antiga;
- políticas genéricas de tenant que concediam escrita ampla a membros autenticados;
- tabelas legadas `users`, `projects`, `activities` e `ai_scores` tratadas como não utilizadas pelo próprio V2;
- credenciais, valores de ambiente ou IDs de produção;
- Meta webhook antigo sem o ciclo completo de deduplicação, consentimento e outbox do V3.

## Destino no V3

| Conhecimento V2 | Destino canônico V3 |
|---|---|
| `lead_events` | `activities`, `atlas_events` e `campaign_events` |
| `lead_scores` | `leads.score`, previsão explicável e eventos de calibragem |
| `pipeline_history` | activity `pipeline_stage_changed` + `atlas_events` |
| `followups` | `tasks`, `leads.next_action_at` e timeline |
| `lead_distribution_history` | `lead_distribution_events` |
| `projects` legado | `developments`, inventário, materiais e incorporadoras |
| Copilot por regras | roteador multi-IA + fallback seguro + memória exclusiva |
| Meta Lead Ads inicial | webhook, outbox, CAPI, Insights e prontidão Andromeda |

Conclusão: o V2 é documentação viva de maturidade operacional. Seu código não é a base de execução; suas regras úteis passam a ser critérios de regressão do V3.
