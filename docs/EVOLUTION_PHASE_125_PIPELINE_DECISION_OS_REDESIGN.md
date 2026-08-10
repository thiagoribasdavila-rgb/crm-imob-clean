# Fase 125 — Pipeline Decision OS redesign

## Objetivo
Redesenhar o pipeline para reduzir ruído visual, aumentar decisão e deixar a IA mais proativa na rotina comercial.

## O que mudou
- O topo do pipeline passou a comunicar “Pipeline inteligente”.
- Foi criado o Pipeline OS Cockpit com a melhor ação do momento.
- O quadro ganhou classe V30 para colunas mais compactas, limpas e orientadas a ação.
- Cards mantêm os dados completos, mas priorizam ação, score, projeto, risco e execução.
- Detalhes continuam disponíveis em blocos recolhidos para preservar contexto sem poluir a tela.

## Impacto operacional
- Corretor começa por urgências, leads sem ação ou oportunidades quentes.
- Gerente usa a mesma tela para identificar gargalos sem abrir múltiplos relatórios.
- Diretor preserva visão de forecast e saúde comercial com menos ruído.

## Validação
- `npm run evolution:phase-125:check`
- `npm run typecheck`
- `npm run lint`
