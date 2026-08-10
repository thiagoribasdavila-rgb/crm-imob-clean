# Fase 120 — Kanban Queue Safe Advance

Objetivo: permitir que a fila inteligente avance oportunidades com segurança, sem depender de arrastar cards.

## O que mudou

- Cada item da fila inteligente ganhou uma ação principal:
  - `Avançar: próxima etapa`.
- O botão usa a mesma função oficial de movimentação do Kanban: `moveLead`.
- O Atlas mantém:
  - validações de etapa;
  - salvamento via API;
  - atualização otimista;
  - feedback visual;
  - opção de desfazer movimento;
  - proteção para etapas finais.
- Quando a lead está na última etapa disponível, a ação aparece como revisão e fica bloqueada.

## Impacto operacional

O corretor ou gestor pode olhar a fila, decidir e mover o negócio em um toque. Isso torna o Kanban menos dependente de arrastar e mais compatível com uso rápido, inclusive em tela menor.

## Proteções

- Não cria novo caminho de atualização.
- Não duplica regras de negócio.
- Não pula confirmações de venda ganha, perdida ou compra em outro lugar.
- Mantém o histórico centralizado no fluxo existente.

## Validação

- Check de fase: `npm run evolution:phase-120:check`
- Typecheck: obrigatório por alterar TSX.
- Lint: obrigatório por alterar interface React.

## Próxima evolução sugerida

Fase 121: criar indicador visual de “tempo parado na etapa” dentro da fila inteligente para destacar gargalos antes de virarem perda de oportunidade.
