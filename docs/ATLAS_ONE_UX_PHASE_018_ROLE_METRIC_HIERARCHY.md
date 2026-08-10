# Atlas One — Fase 18: hierarquia de métricas por papel

Data: 04/08/2026

## Objetivo

Reduzir a primeira leitura de cada painel por cargo a cinco indicadores diretamente ligados à decisão do usuário, mantendo o sexto indicador acessível sob demanda.

## Aplicação

- Corretor: carteira, intenção, SLA e execução aparecem primeiro; agenda de sete dias fica como contexto complementar.
- Gerente: equipe, carteira, SLA e higiene aparecem primeiro; equilíbrio da carga fica sob demanda.
- Superintendente: estrutura, presença, carteira e SLA aparecem primeiro; equilíbrio entre equipes fica sob demanda.
- Diretor: pipeline, vendas, recebíveis, conversão e campanhas aparecem primeiro; eficiência da IA fica sob demanda.

## Garantias

- Os mesmos componentes e valores continuam sendo usados.
- Nenhum endpoint, cálculo, consulta, permissão ou escopo hierárquico foi alterado.
- O conteúdo complementar continua no DOM, acessível por teclado e visível quando solicitado.
- A solução reutiliza `AtlasMetricDeck`, criado na Fase 17, sem introduzir uma segunda hierarquia visual.

## Validação

Execute `npm run ux:phase-018:check`, `npm test`, `npm run typecheck` e `npm run lint`.
