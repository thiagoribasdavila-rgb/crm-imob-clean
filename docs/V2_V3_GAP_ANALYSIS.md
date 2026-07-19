# Matriz V2 × V3

## Comparação funcional

| Módulo | V2 Archive | V3 atual | Ação |
|---|---|---|---|
| Login | funcional, Supabase Auth | PKCE, recuperação e validação rápida de JWT | manter V3 e validar no domínio |
| Dashboard | dados reais e visão operacional | hierarquia, forecast, SLA, campanhas e direção | manter V3 |
| Leads | lista, filtros e Lead 360 | carteira exclusiva, qualificação, timeline, ações e IA | manter V3 |
| Pipeline | sete colunas e histórico | Kanban guiado, filtros, SLA, forecast, atalhos e desfazer | manter V3 |
| Tarefas | concluir e reagendar follow-up | leitura existente, experiência incompleta | recuperar UX operacional |
| Agenda | tarefas + follow-ups | calendário baseado em tarefas | unificar no padrão V3 |
| Corretores | capacidade, disponibilidade e redistribuição | hierarquia completa, fila online e distribuição por projeto | manter V3 |
| Projetos | visão parcial de projeto/unidades | incorporadora, materiais, inventário, pagamento e intelligence | manter V3 |
| Copilot | regras locais explicáveis | multi-IA, memória exclusiva, privacidade e custo | manter V3 |
| Knowledge | busca lexical inicial | fontes oficiais, mercado, projetos e contexto protegido | manter V3 |
| Meta | captura inicial de leads | closed loop, CAPI, Insights, relatórios e Andromeda | manter V3 |
| WhatsApp | abertura manual em `wa.me` | API oficial, consentimento, templates, outbox e supressão | manter V3 |
| Segurança | tenant por organização | tenant + hierarquia + RLS + API auth + auditoria | manter V3 |

## Mapa de dados para migração real

| Origem histórica | Validação | Destino V3 | Regra |
|---|---|---|---|
| `organizations` | slug/nome únicos | `organizations` | reconciliar, não duplicar |
| `profiles` | usuário Auth e organização | `profiles` | mapear função e `reports_to` |
| `leads` | telefone/e-mail normalizados | `leads` | deduplicar antes de inserir |
| `tasks` | lead, responsável e prazo | `tasks` | preservar status e autoria |
| `followups` | ação, prazo e conclusão | `tasks` + `next_action_at` | converter, não recriar tabela |
| `lead_events` | tipo, data e lead | `activities`/`atlas_events` | preservar cronologia |
| `pipeline_history` | etapa anterior e nova | activities/atlas events | idempotência por origem e ID |
| `lead_scores` | versão e fatores | eventos de calibragem | não sobrescrever score atual sem cálculo |
| `lead_distribution_history` | origem, destino e motivo | `lead_distribution_events` | preservar auditoria |
| ARVO/projetos | incorporadora e referência | developments/materials/inventory | importar por lote validado |

## Percentuais

- Cobertura funcional do Core V2 no V3: **96%** antes desta recuperação.
- Conhecimento operacional relevante identificado: **100%**.
- Conhecimento que deve ser migrado como código: **baixo**; apenas a experiência diária de tarefas precisava recuperação direta.
- Reinstalação ou cópia integral do V2: **0% recomendada**.

## Pendências externas

1. obter backup/exportação dos dados reais, separado do ZIP de código;
2. mapear IDs históricos para organizações, usuários, leads e projetos V3;
3. executar dry-run de deduplicação;
4. ativar credenciais na Hostinger;
5. realizar login, recuperação, Meta, WhatsApp e smoke com usuários reais de homologação;
6. aprovar migração e campanhas com o diretor.

## Próximo sprint

1. preparar inventário dos dados reais V2/ARVO;
2. gerar relatório de duplicidade e rejeições sem gravar no banco;
3. validar três jornadas: nova lead, follow-up e venda;
4. ativar APIs em modo de teste;
5. somente depois promover a operação V3.
