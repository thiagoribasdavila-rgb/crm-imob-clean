# ATLAS AI OS — Fase 62/3000

## Objetivo da fase

Permitir que uma recomendação contextual do **ATLAS COPILOT AI** vire uma tarefa real somente depois de revisão e confirmação explícita do usuário.

## O que existia hoje

- Copilot conectado ao Lead 360, Clientes 360 e Agenda.
- API de tarefas já protegida por autenticação, organização e responsável da lead.
- Histórico comercial unificado em `lead_events`.
- Recomendações em modo de preparação, ainda sem um caminho governado de execução.

## Problema resolvido

O corretor recebia uma boa recomendação, mas precisava sair do Copilot e recriar manualmente a próxima ação. Uma execução automática seria rápida, porém arriscada: poderia gravar prazo ou prioridade sem revisão humana.

## Alterações realizadas

1. A resposta contextual da IA agora pode abrir uma prévia editável de tarefa.
2. Título, prazo e prioridade permanecem sob controle do usuário.
3. A confirmação exige uma marcação explícita de revisão e um segundo comando de criação.
4. O backend rejeita qualquer origem `atlas-copilot` sem `leadId` e `humanConfirmed: true`.
5. A tarefa reutiliza a API existente, preserva o responsável único da lead e respeita o tenant.
6. A decisão confirmada é registrada no histórico da lead, com tarefa, prazo, prioridade, ator e origem.
7. O texto completo gerado pela IA não é salvo; a tarefa recebe apenas uma descrição operacional neutra.
8. O retorno diferencia sucesso auditado, falha de criação e eventual degradação do registro complementar.

## Impacto operacional

- O corretor transforma uma recomendação em compromisso sem redigitar o contexto.
- O gerente consegue identificar que a tarefa nasceu de uma sugestão da IA e foi confirmada por uma pessoa.
- O mesmo contrato prepara futuras ações do Copilot sem autorizar automações silenciosas.
- O responsável da lead continua único, evitando tarefas direcionadas ao corretor errado.

## Segurança e governança

- Nenhuma tabela ou política de banco foi alterada.
- Nenhum dado de produção foi modificado durante a implementação.
- A criação continua protegida por sessão, rate limit, organização, visibilidade da lead e perfil ativo.
- Uma solicitação do Copilot sem confirmação humana recebe bloqueio `409`.
- A auditoria persiste no histórico da lead e também gera log estruturado no servidor.
- Nenhuma mensagem é enviada e nenhuma etapa do pipeline é movida nesta fase.

## Checklist de validação

- [x] Prévia editável aparece somente em contexto autorizado de lead.
- [x] Confirmação humana obrigatória.
- [x] API recusa gravação silenciosa do Copilot.
- [x] Responsável herdado da lead.
- [x] Evento de auditoria associado à lead.
- [x] Feedback de carregamento, sucesso e falha.
- [x] Nenhum texto integral da IA persistido na tarefa.
- [x] Nenhuma mudança de schema ou dados reais.
- [x] Build e ZIP preservados para o gate de release.

## Risco identificado

Movimentar etapas do pipeline produz impacto maior do que criar uma tarefa. Essa ação ainda não está liberada pelo Copilot e precisa de prévia da etapa atual, etapa destino, permissão, auditoria e opção segura de reversão.

## Próxima etapa recomendada

Fase 63: conectar o Copilot ao pipeline com movimentação confirmada e reversível, sem permitir alterações automáticas e mantendo o histórico comercial completo.
