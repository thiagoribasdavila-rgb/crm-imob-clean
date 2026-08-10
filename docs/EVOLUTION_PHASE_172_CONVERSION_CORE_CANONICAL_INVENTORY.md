# Fase 172 — inventário canônico do núcleo de conversão

## Resultado

O primeiro módulo grande do programa de evolução possui agora um mapa factual de propriedade. Nenhuma rota produtiva, tabela, integração ou dado real foi alterado.

| Capacidade | Interface canônica | API canônica | Estado comprovado |
|---|---|---|---|
| Carteira de leads | `/leads` | `GET /api/v1/crm/leads` | contratos aprovados; runtime autenticado pendente |
| Entrada de lead | `/leads/new` | `POST /api/v1/leads` | contratos aprovados; runtime autenticado pendente |
| Lead 360 | `/leads/[id]` | `/api/v1/leads/[id]` | contratos aprovados; runtime autenticado pendente |
| Pipeline/Kanban | `/pipeline` | `/api/v1/pipeline` | contratos aprovados; runtime autenticado pendente |
| Distribuição | `/distribution` | `/api/v1/crm/distribution` | contratos aprovados; runtime autenticado pendente |
| Tarefas | `/tasks` | `/api/v1/tasks` | contratos aprovados; runtime autenticado pendente |

## Regra contra duplicidade

Rotas com nomes próximos não foram tratadas automaticamente como duplicação. A consulta hierárquica de leads e o cadastro atômico têm operações diferentes; movimentação do pipeline e configuração de etapas também. Essa decisão fica explícita no inventário e deverá ser revista caso duas implementações passem a disputar a mesma operação.

## Memória operacional

A memória desta fase registra somente:

- responsáveis canônicos;
- evidências de contrato existentes;
- tabelas tocadas por cada fluxo;
- lacunas de comprovação;
- decisão de preservar rotas complementares.

Ela não contém nomes, telefones, e-mails, conteúdo de conversa ou qualquer PII de leads.

## Portão seguinte

O módulo ainda não está homologado. Antes de build ou ZIP, cada capacidade deverá provar em ambiente isolado e autenticado:

1. leitura e mutação esperadas;
2. isolamento entre organizações;
3. autorização por perfil;
4. persistência e trilha de auditoria;
5. recuperação diante de erro;
6. rollback proporcional ao risco.

Somente a conclusão do módulo inteiro, seguida de aprovação explícita da diretoria, libera um único build limpo e um único ZIP.
