# ATLAS V3 — Status de homologação operacional

## Resultado atual

**Fundação técnica local: 94%**

O percentual representa código, build e verificações locais. A promoção para 100% depende dos testes autenticados no ambiente Hostinger e da reconciliação dos dados reais.

| Superfície | Situação |
| --- | --- |
| Login e proteção de rotas | Pronto para reteste Hostinger |
| Command Center | Operacional, com saúde individual por módulo |
| Pipeline | Operacional sobre leads V2 |
| Tarefas | Operacional com prazo legado e concluídas visíveis |
| Projetos | Operacional sobre `projects` V2 |
| Intelligence | Operacional por regras locais; persistência pendente |
| IA externa | Não exigida nesta fundação |

## Riscos restantes

1. O schema real da Hostinger deve ser novamente auditado depois do deploy.
2. Escritas de Pipeline e Tarefas dependem das RPCs/campos canônicos e precisam de teste autenticado antes da liberação operacional.
3. Estoque e materiais de ARVO, Inside Perdizes e Spin Mood só podem ser exibidos após importação e reconciliação das fontes reais.
4. `ai_insights` persistente exige migration aditiva controlada, RLS conferido e backup.

## Teste de aceite na Hostinger

1. Entrar com cada perfil oficial.
2. Abrir Dashboard, Pipeline, Tarefas, Projetos e Intelligence.
3. Criar uma lead de homologação identificada.
4. Atualizar o status e confirmar persistência após recarregar.
5. Criar uma tarefa vinculada, concluir e confirmar os dois contadores.
6. Conferir isolamento entre organizações e carteiras.
7. Excluir somente a lead de homologação, mediante autorização e trilha de auditoria.

## Próximo passo

Publicar o novo ZIP em homologação, executar os testes autenticados e somente então iniciar a importação reconciliada dos três projetos e a ativação persistente dos agentes de IA.
