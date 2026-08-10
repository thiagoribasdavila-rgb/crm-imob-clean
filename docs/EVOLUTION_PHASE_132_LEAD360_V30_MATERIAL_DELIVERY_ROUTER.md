# Fase 132 — Lead 360 V30 Material Delivery Router

## Objetivo

Transformar a Lead 360 em uma central mais prática para o corretor decidir qual material usar agora: book, tabela, estoque ou argumento de região.

## Problema resolvido

A Lead 360 já reunia dados importantes, mas o corretor ainda precisava alternar entre telas para descobrir:

- qual book enviar;
- qual tabela ou fluxo simular;
- qual estoque consultar;
- qual argumento de região usar na conversa.

Essa etapa reduz a busca manual e aproxima a página individual da lead de uma experiência de atendimento premium e objetiva.

## O que foi implementado

- Novo bloco “V30 Material Router” dentro da Lead 360.
- Quatro decisões acionáveis:
  - Book certo;
  - Tabela e fluxo;
  - Estoque indicado;
  - Argumento de região.
- Links diretos para:
  - central de materiais;
  - simulação comercial;
  - estoque do empreendimento;
  - qualificação da lead.
- Copilot supervisionado em cada decisão para preparar mensagem, simulação, apresentação de estoque ou argumento regional.
- Interface compacta, responsiva e sem ruído adicional.

## Impacto operacional

O corretor ganha um caminho curto entre entender a lead e agir. A experiência fica mais próxima de um assistente comercial real: o sistema mostra o próximo material útil, a justificativa e a ação recomendada.

## Segurança e governança

- Nenhuma mensagem é enviada automaticamente.
- O Copilot apenas prepara uma sugestão.
- Disponibilidade de estoque, condições, financiamento e valorização precisam de confirmação humana.
- A fase não altera banco de dados nem contratos de API.

## Validação

- `npm run evolution:phase-132:check`
- `npm run typecheck`
- `npm run lint`

## Próxima fase sugerida

Fase 133 — criar uma jornada de trabalho do corretor dentro da Lead 360, transformando tarefas, agenda e histórico em um bloco único de “próximo melhor trabalho”.
