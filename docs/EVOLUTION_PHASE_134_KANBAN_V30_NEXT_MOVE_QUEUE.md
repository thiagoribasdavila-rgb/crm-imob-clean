# Fase 134 — Kanban V30 Next Move Queue

## Objetivo

Reduzir o ruído do Pipeline/Kanban e transformar a tela em uma fila objetiva de próximo movimento para o corretor.

## Problema resolvido

O Kanban já tinha muitos sinais úteis, mas o corretor ainda precisava interpretar colunas, score, SLA, valor, etapa, temperatura e próxima ação ao mesmo tempo. A Fase 134 cria uma camada de decisão curta: o Atlas mostra quais oportunidades exigem ação primeiro e por quê.

## O que foi implementado

- Faixa `V30 NEXT MOVE · KANBAN` acima dos blocos de foco.
- Fila priorizada por impacto comercial.
- Sinais usados:
  - SLA vencido;
  - follow-up atrasado;
  - proposta em aberto;
  - lead quente sem próxima ação;
  - lead sem próxima ação;
  - card parado na etapa.
- Ações rápidas:
  - abrir Lead 360;
  - preparar abordagem com IA;
  - acionar WhatsApp ou tarefa;
  - avançar etapa usando o fluxo já existente.

## Impacto operacional

O corretor deixa de olhar o Kanban como uma parede de cards e passa a enxergar uma ordem de execução. O gerente também ganha leitura rápida de gargalo sem abrir relatórios.

## Segurança operacional

A fase não executa nenhuma automação de disparo e não altera o banco. A IA atua como Copilot supervisionado: prepara contexto, recomendação e rota de ação, mas a decisão continua humana.

## Validação

- `npm run evolution:phase-134:check`
- `npm run typecheck`
- `npm run lint`

## Próxima etapa recomendada

Fase 135: redesenhar o card individual do Kanban para uma versão ainda mais limpa, com ação primária única, detalhes progressivos e menor carga visual nas colunas.
