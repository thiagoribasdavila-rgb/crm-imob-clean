# Fase 117 — Kanban Lens Ranking

Objetivo: fazer o Kanban priorizar automaticamente o lead certo para cada perfil comercial.

## O que mudou

- Foi criado um peso de prioridade específico para cada lente:
  - Corretor: contato, SLA, próxima ação e capacidade de executar agora.
  - Gerente: gargalos, atrasos, risco e ausência de compromisso futuro.
  - Diretor: valor, forecast, proposta e impacto no resultado.
- Cada etapa do Kanban passa a reordenar seus cards pela lente ativa.
- O cabeçalho da etapa mostra discretamente qual lead está sendo priorizado.
- Cada card recebe um selo curto explicando o motivo da posição no ranking.
- Em caso de empate, o Atlas usa a prioridade operacional existente como fallback.

## Impacto operacional

O corretor sabe quem abordar primeiro, o gerente enxerga onde o time está travando e o diretor identifica onde existe maior impacto financeiro. A informação fica mais ativa, sem aumentar o ruído visual do quadro.

## Validação

- Check de fase: `npm run evolution:phase-117:check`
- Typecheck: obrigatório por alterar TSX.
- Lint: obrigatório por alterar interface React.

## Próxima evolução sugerida

Fase 118: fila única por lente ativa, reunindo os cards mais importantes do Kanban em uma lista de execução rápida acima do quadro.
