# V3000 — Fase 53: Kanban por decisão

## Resultado

O Kanban preserva a operação existente, mas reduz a leitura de cada etapa aos
três sinais que sustentam uma decisão comercial: volume, valor válido e gargalo
principal. Percentuais, comandos auxiliares e evidências detalhadas continuam
disponíveis sob demanda, sem competir com a próxima ação.

Cada card mantém projeto, validação e próxima ação sempre visíveis. Relógio
comercial, continuidade da conversa e aderência ao projeto passam a usar
divulgação progressiva. Nenhuma informação operacional foi removida.

## Movimento governado

O movimento continua usando o mesmo fluxo `moveLead` já existente. Arraste,
soltura e atalhos `Alt + seta` preservam validação, registro de auditoria e
desfazer. A fase não cria uma segunda implementação do funil e não altera os
contratos das APIs.

## Dados e segurança

O board continua consumindo as APIs autenticadas e o escopo comercial já
existentes, respeitando organização, cargo e RLS do Supabase. O valor da etapa
considera somente números positivos e finitos. Esta fase não cria migration,
não muta dados por conta própria, não chama IA e não amplia visibilidade.

## Responsividade

Em telas menores, o Kanban apresenta uma etapa por vez em uma coluna compacta.
O seletor móvel existente continua comandando a etapa ativa, evitando rolagem
horizontal obrigatória sem esconder o contexto do card selecionado.

## Aceite verificável

- somente três métricas no cabeçalho de cada etapa;
- projeto, validação e próxima ação sempre visíveis;
- contexto detalhado disponível sob demanda;
- drag-and-drop e teclado continuam usando o fluxo governado;
- auditoria e desfazer permanecem preservados;
- uma coluna operacional em telas menores;
- nenhum dado sintético ou chamada de IA.
