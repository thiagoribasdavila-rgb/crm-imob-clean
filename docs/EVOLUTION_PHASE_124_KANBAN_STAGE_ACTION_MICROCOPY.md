# Fase 124 — Kanban Stage Action Microcopy

Objetivo: deixar cada coluna do Kanban mais decisiva, proativa e fácil de usar.

## O que mudou

- Cada etapa do Kanban agora mostra uma ação objetiva:
  - ação principal;
  - motivo comercial;
  - próximo clique sugerido.
- A orientação muda conforme a lente ativa:
  - corretor: execução imediata;
  - gerente: cadência, cobrança e redistribuição;
  - diretor: receita, forecast e risco.
- A microcopy usa a saúde real da etapa:
  - urgências;
  - leads parados;
  - leads sem próxima ação;
  - oportunidades quentes.

## Impacto operacional

O Kanban deixa de exigir interpretação manual de números e passa a orientar o próximo movimento. Isso reduz ruído visual e acelera a rotina comercial.

## Proteções

- Não altera banco.
- Não muda permissões.
- Não executa automações.
- Não cria dependência externa.
- Não substitui o fluxo atual do Kanban.

## Validação

- Check de fase: `npm run evolution:phase-124:check`
- Typecheck: obrigatório por alterar TSX.
- Lint: obrigatório por alterar interface React.

## Próxima evolução sugerida

Fase 125: criar modo “Próxima melhor ação” para destacar apenas o melhor card de cada etapa quando o corretor quiser foco máximo.
