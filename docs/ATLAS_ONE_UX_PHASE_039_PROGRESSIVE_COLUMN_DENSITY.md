# ATLAS ONE — Fase 39: densidade progressiva das colunas

## Objetivo

Manter a decisão operacional visível e retirar diagnósticos repetitivos da leitura permanente do Kanban.

## Entrega

- identidade, quantidade, valor, probabilidade e comando principal da etapa continuam imediatos;
- saúde operacional, diagnóstico, prioridade por lente e orientação detalhada foram reunidos em `Contexto da etapa`;
- a divulgação usa `details/summary` nativo, funciona por mouse e teclado e mantém foco visível;
- o resumo fechado antecipa apenas o sinal mais relevante: urgências ou oportunidades quentes;
- colunas vazias compactas não voltam a exibir análises secundárias;
- cards, próxima melhor ação e todos os métodos de movimentação permanecem intactos.

## Segurança preservada

Nenhuma API, tabela, migration, RLS, permissão, histórico ou integração foi modificada.

## Validação

Executar `npm run ux:phase-039:check`, seguido de typecheck, lint e testes completos.

## Próxima fase

Reduzir a repetição entre cabeçalho da etapa e primeira oportunidade, criando uma leitura contínua do comando até o card prioritário.
