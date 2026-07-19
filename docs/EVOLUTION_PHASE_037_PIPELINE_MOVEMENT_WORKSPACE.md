# Fase 037 — Pipeline orientado à movimentação

## Resultado

O Pipeline agora começa com uma única fila de movimentação prioritária. A fila de filtros e o antigo bloco “Comece por aqui” foram consolidados para remover repetição e colocar, no mesmo lugar, os três negócios abertos que exigem atenção primeiro.

Cada item mostra:

- risco observado;
- etapa atual;
- próxima etapa canônica do fluxo;
- ação e motivo explicáveis;
- seletor explícito para movimentação;
- acesso ao Lead 360, Copilot e ligação quando existe telefone válido.

## Priorização explicável

Na ordenação padrão, a ordem continua usando apenas sinais já existentes no payload autorizado: SLA do primeiro contato, próxima ação vencida, ausência de próxima ação, temperatura, score observado e risco calculado pelo Pipeline. Filtros, busca e outras ordenações escolhidas pelo usuário também reorganizam a fila. Nenhum score, percentual ou probabilidade foi criado nesta fase.

A próxima etapa exibida é apenas a etapa canônica seguinte na configuração atual. Ela não é apresentada como previsão de conversão, recomendação autônoma ou autorização para avançar a lead.

## Movimento humano, seguro e reversível

O usuário precisa escolher uma etapa no seletor. A escolha reutiliza o mesmo fluxo transacional do Kanban, com verificação da etapa anterior, registro de histórico, bloqueio de concorrência, reversão segura e mensagem de confirmação. A IA não move leads e nenhuma automação comercial nova foi ativada.

As três alternativas de movimentação continuam disponíveis:

- arrastar e soltar;
- seletor de etapa;
- teclado com `Alt + ←/→`.

## Compactação sem perda de função

O cabeçalho e o robô-corretor foram reduzidos. O modo foco continua padrão e o Kanban compacto continua ativo por preferência do usuário. Métricas estendidas, fluxo por etapas, perfis compradores, filtros, configurações e visualização confortável permanecem acessíveis.

Nenhuma rota, etapa, filtro ou função foi removida.

## Escopo, RBAC e verdade operacional

A fila deriva somente do Pipeline já carregado para o escopo autorizado pelo backend. Ela não é apresentada como visão global da empresa e não amplia o escopo de corretor, gerente ou diretoria.

Não houve mudança em API, consulta, banco, schema, RLS, tenant, RBAC ou distribuição. O bloqueio de homologação da Fase 020 não foi contornado.

## Experiência e acessibilidade

- A fila usa uma região rotulada e atualização `aria-live="polite"`.
- O movimento usa `label` e `select` nativos.
- Novos alvos interativos possuem pelo menos 44 px.
- O Kanban móvel por etapa, foco visível e atalhos de teclado foram preservados.
- A política global de movimento reduzido continua válida.

## Revisão React

- Nenhum estado ou efeito foi adicionado.
- Nenhum novo pedido de rede foi criado.
- A fila reaproveita `dailyFocus`, dados e movimentação já existentes.
- Chaves permanecem estáveis por identificador da lead.
- Estado derivado não foi duplicado em um segundo armazenamento.

## Medição

A compactação estrutural reduziu duas seções prioritárias para uma. A redução real de tempo para decisão e qualquer ganho de conversão ainda dependem de telemetria e homologação. Nenhum ganho de produtividade foi publicado como resultado medido.

## Próxima fase

Fase 038 — **Melhorar tarefas**.

O próximo avanço deve organizar a Central de Tarefas por vencimento, impacto e próximo passo, sem duplicar Agenda, alterar o SLA existente ou concluir ações automaticamente.
