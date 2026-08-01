# ATLAS V3 — Saúde dos módulos

## Diagnóstico da homologação

| Módulo | Endpoint/interface | Contrato V3 | Base atual V2 | Status após correção | Solução aplicada |
| --- | --- | --- | --- | --- | --- |
| Pipeline | `GET /api/v1/pipeline` | `opportunities`; leads com `score`, `assigned_to`, `development_id` | `leads`; `score_ia`, `assigned_user_id`, `project_id` | Operacional por compatibilidade | Normalização em memória, preservando lead, projeto, status, responsável, datas e última interação. |
| Tarefas | `GET /api/v1/tasks` | `tasks.due_at`, `assigned_to`, relação com lead | `tasks.due_date`, `user_id`, `lead_id` | Operacional por compatibilidade | Fallback de prazo e responsável, junção segura com lead e contagem de abertas, atrasadas e concluídas. |
| Projetos | `GET /api/v1/launch-os` | `developments` | `projects` | Operacional por compatibilidade | Projeto, incorporadora, status e vínculo de leads são normalizados. Estoque permanece zero quando não existe fonte real. |
| Inteligência | `/intelligence` e `ai_insights` | Insights persistidos por organização | Tabela ainda não exposta na homologação | Operacional local | Regras determinísticas calculam leads sem contato, oportunidades quentes e tarefas atrasadas sem IA externa. |

## Segurança e integridade

- Nenhuma migration foi executada automaticamente.
- Nenhuma tabela ou registro foi apagado ou renomeado.
- Toda consulta continua limitada pelo usuário autenticado, organização e RLS existente.
- Os adapters somente transformam a resposta em memória.
- Métricas desconhecidas não são estimadas: permanecem zero ou vazias.
- ARVO, Inside Perdizes e Spin Mood estão preparados como alvos de importação; registros fictícios não foram criados.

## Persistência da inteligência

O repositório já contém a fundação e as políticas posteriores de `ai_insights`. A aplicação dessa estrutura na homologação deve ocorrer somente após backup, conferência da migration remota, exposição controlada à Data API e validação das políticas RLS. Até lá, a inteligência local mantém o módulo útil e operacional.
