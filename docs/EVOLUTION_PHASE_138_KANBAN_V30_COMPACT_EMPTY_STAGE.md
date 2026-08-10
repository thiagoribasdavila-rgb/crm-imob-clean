# Fase 138 — Kanban V30 Compact Empty Stage

## Objetivo

Diminuir ruído visual no Kanban quando uma coluna está vazia. A etapa vazia deixa de parecer uma área grande e sem utilidade e passa a ser um espaço compacto, claro e acionável.

## O que foi implementado

- Empty state compacto por etapa.
- Texto de orientação para mostrar que a etapa está livre.
- Botão `Monitorar etapa` para abrir a visão ampla do Kanban sem esconder colunas.
- CSS responsivo com borda tracejada leve e visual premium.

## Impacto operacional

O quadro fica mais limpo, principalmente em funis com muitas etapas. O corretor foca nos cards reais, o gerente identifica gargalos de verdade e o diretor enxerga o fluxo sem ruído desnecessário.

## Segurança

- Não altera banco.
- Não movimenta leads.
- Não envia mensagem.
- Não executa automação.
- Apenas melhora visualização e foco.

## Validação

- `npm run evolution:phase-138:check`
- `npm run typecheck`
- `npm run lint`
