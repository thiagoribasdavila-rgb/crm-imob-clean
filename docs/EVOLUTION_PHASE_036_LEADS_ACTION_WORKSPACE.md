# Fase 036 — Leads orientados à próxima ação

## Resultado

A tela de Leads agora começa pelo trabalho comercial visível, não por uma apresentação extensa. O cabeçalho foi compactado e a página mostra uma fila de até três prioridades derivadas dos leads já carregados na página atual.

Cada item informa:

- por que a lead exige atenção;
- qual passo operacional faz sentido;
- projeto e etapa observados;
- acesso direto ao Lead 360;
- apoio opcional do Copilot para preparar uma abordagem.

## Priorização explicável

A fila usa somente sinais que já existem na resposta da API: próxima ação vencida, ausência de responsável para papéis de liderança, score ou temperatura quente observados e ausência de próxima ação. Nenhum score, percentual ou probabilidade foi criado nesta fase.

A ordem é determinística e serve para organizar a página visível. Ela não é apresentada como previsão de conversão nem como ranking global da carteira.

## Escopo e verdade operacional

A fila é calculada apenas sobre os itens da página paginada atual e isso aparece explicitamente na interface. Os filtros continuam consultando a carteira autorizada pela API. A tela não agrega outros tenants nem amplia o escopo do usuário.

- Corretor continua vendo somente a própria carteira autorizada.
- Gerente continua limitado à estrutura já resolvida pelo backend.
- Diretoria e administração mantêm o escopo comercial já existente.
- O sinal “sem responsável” não entra como prioridade do corretor.

Não houve mudança em API, consulta, paginação, banco ou regra de distribuição.

## Compactação sem perda de função

As ações frequentes — criar lead e abrir pipeline — permanecem expostas. Qualidade de dados, deduplicação e análise da carteira ficam em um grupo nativo de ferramentas secundárias. Nenhuma funcionalidade foi removida.

A tabela desktop, a lista móvel, filtros, ordenação, paginação e transferência em massa continuam disponíveis.

## IA supervisionada

O Copilot pode preparar uma abordagem usando somente identificador, projeto, etapa, origem, score, temperatura e motivo da prioridade. Telefone, e-mail e outros dados de contato não são inseridos nesse contexto.

A instrução proíbe envio de mensagens e alteração do CRM. A decisão e a execução continuam humanas.

## Experiência e acessibilidade

- A fila é uma região rotulada e atualizada com `aria-live="polite"`.
- Destinos operacionais usam links nativos.
- Ações do Copilot usam botões nativos.
- Novos alvos de interação possuem pelo menos 44 px.
- A fila se adapta de três colunas no espaço útil para uma coluna no celular.
- A política global de movimento reduzido permanece preservada.

## Segurança e medição

Não houve leitura de segredos, alteração de dados de produção, schema, RBAC, isolamento tenant ou rotas. O bloqueio de homologação da Fase 020 não foi contornado.

A redução de tempo para decisão ainda depende de telemetria e homologação real. Nenhum ganho de produtividade ou conversão foi publicado como resultado medido.

## Revisão React

- Nenhum estado ou efeito foi adicionado.
- Nenhum novo pedido de rede foi criado.
- A fila é estado derivado com `useMemo` sobre os itens já carregados.
- A ordenação possui desempate pelo score observado e mantém chaves estáveis por lead.
- A divulgação progressiva reutiliza o elemento nativo `details`.

## Próxima fase

Fase 037 — **Melhorar pipeline**.

O próximo avanço deve tornar o Kanban mais compacto e orientado ao risco e à próxima movimentação, preservando etapas canônicas, gravação segura, filtros e histórico.
