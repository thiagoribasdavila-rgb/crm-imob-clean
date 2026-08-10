# Fase 141 — Kanban V30 Decision Strip

## Objetivo

Criar uma faixa de decisão no topo do Kanban com as três ações mais importantes do recorte atual.

## Problema resolvido

O Kanban já tinha muitos sinais úteis, mas parte da decisão ficava espalhada entre filas, colunas e cards. A fase 141 compacta a leitura para o corretor enxergar rapidamente:

- quem precisa de ação;
- por que precisa de ação;
- qual etapa está travando;
- qual ação executar;
- quando chamar o Copilot.

## Alterações realizadas

- Adicionada a seção `Decisões do dia` antes do quadro.
- A seção usa a `kanbanV30NextMoveQueue` existente.
- Mostra até três ações priorizadas por urgência, valor, score e etapa.
- Cada card traz ação de foco no quadro, execução e Copilot.
- Incluído estado vazio seguro quando não há decisão crítica.
- Nenhuma alteração em banco, permissões ou regra de movimentação.

## Impacto operacional

O corretor não precisa interpretar o pipeline inteiro antes de começar. O Atlas passa a dizer as três ações que mais movem o funil agora, mantendo o quadro completo logo abaixo para profundidade.

## Validação

- `npm run evolution:phase-141:check`
- `npm run typecheck`
- `npm run lint`
