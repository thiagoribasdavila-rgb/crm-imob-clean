# Fase 038 — Tarefas orientadas à execução

## Resultado

A Central de Tarefas agora começa com a pergunta operacional mais útil: **o que precisa ser feito agora**. O primeiro bloco mostra quatro sinais objetivos — vencidas, hoje, minha fila e sem prazo — e mantém criação de tarefa e acesso à Agenda como ações imediatas.

Logo abaixo, o assistente diário apresenta somente as três primeiras ações do recorte autorizado. As demais ações continuam disponíveis em divulgação progressiva. Assim, o corretor encontra a próxima ação rapidamente sem perder a visão completa da rotina.

## Compactação sem perda de função

Foram preservados:

- criação de tarefa;
- vínculo com lead e responsável;
- tarefas recorrentes com data final e limite;
- filtros por prioridade, vencidas, hoje, minha fila, equipe e sem prazo;
- conclusão e reagendamento de um dia;
- encerramento explícito de recorrência;
- visão de carga da equipe para lideranças;
- integração com Agenda e Lead 360.

Campos opcionais da criação, indicadores completos e gestão de recorrências ficam disponíveis sob demanda. Nenhuma função foi removida.

## Priorização explicável

A fila reutiliza a ordem já calculada pelo backend e o assistente diário existente. Os sinais são atraso, prazo, prioridade e contexto comercial já autorizado. A fase não criou score, probabilidade ou previsão de conversão.

O assistente permanece com custo de modelo zero e não é apresentado como agente autônomo. Ele organiza sinais existentes; o usuário decide, conclui, reagenda ou acessa a lead.

## Decisão humana e segurança

Concluir, reagendar ou encerrar uma repetição exige ação humana explícita. Não existe conclusão automática, transferência silenciosa, nova atribuição automática ou ranking de pessoas.

Não houve mudança em banco, schema, API, RLS, tenant, RBAC, autenticação ou rotas. Os dois pedidos de leitura existentes foram preservados e nenhuma nova chamada de rede foi adicionada. O bloqueio de homologação da Fase 020 não foi contornado.

## Experiência e acessibilidade

- Formulário de criação usa elementos semânticos e rótulos associados.
- Filtros usam semântica de abas e informam contagens.
- Fila usa `aria-live="polite"` e estados de carregamento usam `aria-busy`.
- Novos alvos interativos possuem pelo menos 44 px.
- A interface adapta fila, ações e indicadores para celular.
- A política de movimento reduzido continua respeitada.

## Revisão React

- Nenhum estado ou efeito novo foi adicionado.
- Nenhum pedido de rede novo foi criado.
- Contagens, filtros e prioridades são derivados dos dados carregados.
- Chaves continuam estáveis pelo identificador da tarefa ou da ação.
- Formulário, botões, links e elementos `details` preservam comportamento nativo.

## Medição

A alteração compacta estruturalmente a experiência, mas não publica alegação de produtividade, velocidade ou conversão. Tempo real para concluir tarefas e impacto comercial dependem de telemetria e homologação com os perfis autorizados.

## Próxima fase

Fase 039 — **Melhorar Agenda**.

O próximo avanço deve consolidar tarefas, visitas e próximos contatos em uma visão temporal clara, sem duplicar a Central de Tarefas nem criar compromissos automaticamente.
