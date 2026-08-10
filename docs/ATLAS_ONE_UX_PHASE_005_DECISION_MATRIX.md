# Atlas One — Fase 5: matriz de decisão por tela e papel

Data: 04/08/2026

## Resultado

As superfícies operacionais passam a compartilhar um contrato único de fechamento:

**decisão principal → responsável → prazo → resultado esperado → comprovação**.

O contrato foi definido para Diretor, Superintendente, Gerente e Corretor nas nove áreas existentes que concentram a rotina: Sala de Comando, leads, pipeline, tarefas, agenda, projetos, distribuição, campanhas e relatórios.

## Primeira aplicação real

A Sala de Comando exibe abaixo da prioridade principal uma faixa compacta com:

- a decisão atual, derivada da prioridade real visível ao usuário;
- quem responde pela decisão naquele papel;
- quando o ciclo deve ser fechado;
- qual resultado operacional se espera;
- qual registro comprova que a ação aconteceu.

O componente não executa, delega ou altera dados. Ele esclarece o contrato da ação existente.

## Proteções

- Diretor, Superintendente, Gerente e Corretor recebem decisões diferentes sem duplicar a tela.
- Papel desconhecido recebe o contrato do Corretor, que é o menor escopo de decisão.
- Rotas de detalhe de leads e projetos herdam o contrato da área canônica.
- Resultado esperado descreve mudança operacional, não apenas clique ou atividade.
- Comprovação exige registro no histórico, tarefa, decisão ou módulo correspondente.
- Nenhuma decisão sensível é executada automaticamente pela IA.

## Arquivos

- Matriz: `lib/ui/screen-decision-contract.ts`
- Componente: `components/atlas/decision-contract-strip.tsx`
- Aplicação: `app/(crm)/dashboard/page.tsx`
- Configuração: `config/operational-ux-phase-005-decision-matrix.json`
- Testes: `tests/contracts/screen-decision-contract.test.mjs`
- Gate: `scripts/check-operational-ux-phase-005.mjs`

Não houve alteração de schema, dados reais, RLS, autenticação ou integrações. Build e ZIP permanecem reservados para o fechamento do ciclo.
