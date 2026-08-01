# ATLAS V3 — Relatório de compatibilidade V2 → V3

## Resultado

O Command Center ganhou uma camada de compatibilidade não destrutiva para operar sobre o banco legado durante a homologação. Nenhuma tabela foi apagada, renomeada ou alterada e nenhum dado fictício foi criado.

## Incompatibilidades encontradas e tratamento

| Módulo | Contrato V3 | Fonte atual | Tratamento seguro |
| --- | --- | --- | --- |
| Pipeline | `opportunities` e campos canônicos | `leads` | Leads reais são normalizadas e apresentadas como oportunidades compatíveis. Probabilidade não observada permanece zero. |
| Tarefas | `tasks.due_at`, `assigned_to` | `tasks.due_date`, `user_id` | Adapter converte prazo e responsável em memória, sem alterar a tabela. |
| Projetos | `developments` | `projects` | Projetos são normalizados como empreendimentos; `company` alimenta a incorporadora. |
| Inteligência | `ai_insights` | estrutura ainda ausente | A interface entra em estado preparado e vazio, sem bloquear os demais módulos. |
| Equipe | `full_name`, `commercial_role` | campos legados de perfil | Nome e papel comercial recebem fallback compatível. |

## Melhorias de experiência

- Nenhum erro de tabela ou coluna é exibido ao usuário final nos módulos tratados.
- Carregamento com skeletons e mensagens comerciais claras.
- Estados vazios preservam o contexto e indicam o próximo passo.
- Falhas recuperáveis oferecem **Tentar novamente**.
- Pipeline e projetos continuam exibindo dados reais quando as tabelas V3 ainda não existem.
- Métricas ausentes permanecem em zero ou vazias; o sistema não fabrica previsões.
- Respostas de API registram detalhes técnicos no logger e retornam mensagens seguras à interface.

## Observabilidade

As APIs de Pipeline e Launch OS registram falhas no logger da aplicação. Mensagens técnicas não atravessam a fronteira da API, exceto erros de autenticação necessários para orientar a renovação da sessão.

## Próximos passos controlados

1. Fazer backup validado do banco de homologação.
2. Aplicar migrations aditivas para as estruturas V3 em uma janela controlada.
3. Migrar os dados por lote, com reconciliação de contagens e possibilidade de rollback.
4. Ativar persistência de `ai_insights` somente após validar organização, RLS, retenção e custo.
5. Retirar cada fallback apenas depois que o contrato canônico correspondente estiver comprovado.

## Critério de homologação

- Login e escopo organizacional válidos.
- Dashboard, Pipeline, Tarefas, Projetos e Inteligência abrem sem erro técnico na tela.
- Dados reais preservados.
- Estados de carregamento, vazio e falha recuperável presentes.
- Escritas continuam submetidas ao RBAC/RLS existente.
