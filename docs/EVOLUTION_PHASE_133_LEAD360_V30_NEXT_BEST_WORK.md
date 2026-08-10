# Fase 133 — Lead 360 V30 Next Best Work

## Objetivo

Reduzir o ruído dentro da Lead 360 e entregar para o corretor uma fila simples de próximo trabalho: responder, organizar tarefas e follow-up, completar perfil ou avançar o negócio.

## Problema resolvido

A Lead 360 já reunia muito contexto, materiais e inteligência, mas o corretor ainda precisava interpretar várias áreas para decidir o próximo passo. A fase 133 compacta essa leitura em uma fila de trabalho orientada por impacto comercial.

## Alterações realizadas

- Criado o tipo `Lead360V30WorkItem`.
- Criada a lista `lead360V30WorkItems`.
- Adicionado o bloco `V30 NEXT BEST WORK` na Lead 360.
- Conectadas quatro ações:
  - Responder agora.
  - Organizar follow-up.
  - Completar perfil.
  - Avançar negócio.
- Integrado Copilot supervisionado para preparar cada ação.
- Criado CSS responsivo premium para desktop e mobile.

## Impacto operacional

O corretor passa a enxergar a próxima melhor ação sem abrir várias telas. Isso melhora tempo de resposta, reduz lead esquecida, aumenta qualidade de qualificação e cria uma transição mais clara para simulação, proposta ou pipeline.

## Política de segurança

Esta fase não executa nenhuma automação. O Copilot apenas sugere e prepara o trabalho; a decisão e a execução continuam humanas.

## Validação

- `npm run evolution:phase-133:check`
- `npm run typecheck`
- `npm run lint`

## Próxima etapa recomendada

Fase 134 — levar o mesmo conceito de próximo melhor trabalho para o Kanban, priorizando cards por risco, SLA, score, valor e próxima ação.
