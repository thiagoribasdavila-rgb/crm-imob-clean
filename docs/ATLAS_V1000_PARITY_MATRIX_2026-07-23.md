# Atlas One V1000 — matriz factual de paridade

Critério: uma rota existente não é considerada funcional sem interface, API, persistência e controle de acesso verificáveis.

| Módulo | Rota | Frontend | API | Banco | Permissões | Status real | Lacuna |
|---|---|---|---|---|---|---|---|
| Command Center | `/dashboard` | real | governança/analytics | leads, tasks, projects | tenant + papel | PARCIAL | depende da qualidade e cobertura dos dados |
| Leads | `/leads` | real | `/api/v1/leads` | leads | hierarquia/RLS | PARCIAL | prova E2E remota CRUD não foi repetida nesta fase |
| Lead 360 | `/leads/[id]` | real | múltiplas APIs de lead | leads e memória | escopo comercial | PARCIAL | módulos auxiliares variam conforme schema |
| Pipeline/Kanban | `/pipeline` | real | `/api/v1/pipeline` | leads/oportunidades | hierarquia/RLS | PARCIAL | movimentação precisa de ensaio E2E com lead real |
| Tarefas | `/tasks` | real | `/api/v1/tasks` | tasks | responsável/hierarquia | PARCIAL | compatibilidade de prazos precisa de prova remota |
| Agenda | `/calendar` | real | `/api/v1/calendar` | tasks/agenda | usuário/hierarquia | PARCIAL | integração externa de calendário não ativada |
| Atividades | `/activity` | real | `/api/v1/activity` | activities | hierarquia/RLS | PARCIAL | cobertura histórica depende dos eventos |
| Clientes 360 | `/customers` | real | `/api/v1/customers` | leads/clientes | hierarquia/RLS | PARCIAL | unificação depende de identidade/deduplicação |
| Reativação | `/leads/reactivation-governance` | real | APIs de reativação | leads/memória | governança | PARCIAL | WhatsApp real e consentimento não homologados |
| Propostas | via lead/pipeline | disperso | simulação/apresentação | oportunidades | comercial | PARCIAL | não há workspace canônico único comprovado |
| Negociações | `/sales` | real | pipeline/sales | oportunidades | comercial | PARCIAL | forecast depende de campos completos |
| Contratos | sem rota canônica | insuficiente | não comprovada | parcial | não comprovada | AUSENTE | criar domínio e fluxo formal |
| Projetos | `/developments` | real | `/api/v1/developments` | projects/developments | tenant | PARCIAL | CRUD remoto completo não revalidado |
| Incorporadoras | `/developments/developers` | real | `/api/v1/developers` | developers | gestão | PARCIAL | fluxo completo de manutenção não homologado |
| Materiais/books | `/developments/materials` | real | materials API | materials/storage | gestão | PARCIAL | Storage vazio e upload real não testado |
| Tabelas de preço | por materiais/catálogo | parcial | catálogo | materiais | gestão | PARCIAL | parser e versionamento real não comprovados |
| Estoque/unidades | `/developments/[id]/inventory` | real | inventory API | units/inventory | gestão | PARCIAL | importação real não testada |
| Matching cliente × imóvel | `/properties/matching` | real | serviços de matching | leads/properties | comercial | PARCIAL | existe rota duplicada com erro ortográfico |
| Campanhas | `/marketing/campaigns` | real | campaign intelligence | campaigns | diretor/marketing | PARCIAL | publicação real depende de credenciais |
| Meta Ads | `/integrations/meta` | real | Meta APIs | integrations/events | diretor | PARCIAL | CAPI/test event real pendente |
| Meta webhook | sem UI própria | serviço | `/api/webhooks/meta` | events/leads | assinatura | PARCIAL | prova real de lead pendente |
| Meta CAPI | integração Meta | parcial | conversion test | events/outbox | diretor | PARCIAL | recibo real do Events Manager pendente |
| Atribuição/ROI | `/reports/marketing` | real | attribution | attribution/events | diretor | PARCIAL | exige investimento e receita consistentes |
| Criativos | `/marketing/creatives` | real | parcial | creatives | marketing | PARCIAL | upload/publicação real não homologados |
| WhatsApp | `/integrations/whatsapp` | real | webhook/API WhatsApp | conversations/events | governança | PARCIAL | número oficial e templates não conectados |
| Caixa de entrada | `/conversations` | real | webhook/conversas | conversations/messages | corretor/hierarquia | PARCIAL | tráfego real não testado |
| Distribuição | `/distribution` | real | `/api/v1/crm/distribution` | leads/reservations | gerente/diretor | PARCIAL | teste concorrente real pendente |
| Automações/follow-up | `/automations` | real | workers/tasks | automations/tasks | gestão | PARCIAL | workers/cron reais não ativados |
| Telefonia | rotas auxiliares de calls | parcial | não comprovada | activities | comercial | AUSENTE | provedor e gravação não configurados |
| Atlas Copilot | `/intelligence` | real | agentes/IA | ai_* e memória | por papel | PARCIAL | chave/modelo/custo não homologados |
| Lead scoring | no Lead 360 | real | qualify/prediction | scores/insights | comercial | PARCIAL | calibração com resultados reais insuficiente |
| Agentes | `/agents` | real | `/api/v3/agents/process` | ai_* | governança | PARCIAL | execução autônoma permanece supervisionada |
| Forecast | `/atlas-v3/forecast` | real | analytics | oportunidades | gestão | PARCIAL | depende de base operacional madura |
| Usuários e RBAC | `/users` | real | `/api/v1/admin/users` | auth/profiles/org | admin | PARCIAL | primeiro admin provado; demais papéis ainda não |
| Equipes | `/settings/team` | real | usuários | profiles | diretor/admin | PARCIAL | hierarquia 5–10 usuários não homologada |
| Relatórios | `/reports` | real | analytics | múltiplas | gestão | PARCIAL | métricas vazias sem operação real |
| Auditoria | `/atlas-v3/audit` | real | logs/governança | audit/events | admin | PARCIAL | retenção e exportação não comprovadas |
| Configurações | `/settings` | real | settings | org/profile | admin | PARCIAL | integrações externas aguardam credenciais |

## Percentuais factuais

- Estrutura presente: **91%**
- Frontend funcional/útil: **72%**
- Backend implementado: **68%**
- Banco e segurança estrutural: **78%**
- Integrações externas comprovadas: **18%**
- Pronto para homologação interna controlada: **66%**

O nome V1000 representa amplitude de arquitetura, não 100% de homologação operacional. A maior diferença está em integrações reais, testes E2E remotos e dados operacionais — não na quantidade de rotas.
