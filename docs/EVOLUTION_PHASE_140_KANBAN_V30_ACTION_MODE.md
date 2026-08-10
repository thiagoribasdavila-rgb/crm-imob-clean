# Fase 140 — Kanban V30 Action Mode

## Objetivo

Fazer o Kanban deixar de ser apenas um quadro de cards e passar a orientar a execução. Cada coluna agora destaca a próxima melhor ação, usando o lead mais prioritário já ordenado pela lente ativa do usuário.

## O que foi implementado

- Helper `kanbanV30StageActionLead`.
- Bloco `Próxima melhor ação` no topo de cada coluna com lead, score, valor e ação sugerida.
- Botão contextual para WhatsApp, Copilot, agenda ou proposta.
- Visual por urgência: risco, alerta, sucesso ou informação.
- Integração com a renderização progressiva da Fase 139.

## Impacto operacional

O corretor abre o pipeline e já entende o que fazer primeiro em cada etapa. O gerente identifica a ponta do gargalo e o diretor consegue avaliar onde existe risco ou receita potencial sem navegar por todos os cards.

## Segurança

- Não altera banco.
- Não move leads sozinho.
- Não envia mensagens automaticamente.
- Não cria tarefas automáticas.
- Mantém decisão humana como regra principal.

## Validação

- `npm run evolution:phase-140:check`
- `npm run typecheck`
- `npm run lint`
