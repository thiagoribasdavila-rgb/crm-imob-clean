# Fase 135 — Kanban V30 Decision Card

## Objetivo

Redesenhar o card individual do Kanban para deixar o corretor, gerente e diretor decidirem mais rápido, com menos ruído visual e mais clareza sobre a ação primária.

## O que foi melhorado

- O card agora abre com identidade da lead, contato principal e score.
- A recomendação da IA virou comando central, não texto perdido no meio do card.
- Os três fatos essenciais aparecem antes do contexto completo: projeto, potencial e prazo/último contato.
- A ação primária fica destacada: WhatsApp agora, preparar proposta, confirmar visita ou pedir abordagem da IA.
- A próxima etapa pode ser acionada diretamente pelo botão de avanço, reaproveitando `moveLead`.
- O restante do histórico, roteiro e atalhos fica em contexto progressivo expansível.

## Impacto comercial

O Kanban passa a funcionar mais como mesa de decisão e menos como um mural carregado. O usuário vê primeiro o que importa para converter: quem é a lead, qual o risco, qual a próxima ação e para onde ela deve avançar.

## Segurança operacional

- Não altera banco.
- Não muda permissões.
- Não dispara WhatsApp automaticamente.
- Não executa automação sem comando humano.
- Mantém o fluxo existente de histórico, Copilot e movimentação de etapa.

## Validação

- `npm run evolution:phase-135:check`
- `npm run typecheck`
- `npm run lint`
