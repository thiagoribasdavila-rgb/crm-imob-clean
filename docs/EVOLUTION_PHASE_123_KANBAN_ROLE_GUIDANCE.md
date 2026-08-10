# Fase 123 — Kanban Role-Based Bottleneck Guidance

Objetivo: fazer o Kanban falar a língua de cada perfil da operação.

## O que mudou

- O radar de gargalos agora adapta a recomendação conforme a lente ativa:
  - corretor;
  - gerente;
  - diretor.
- A mesma etapa travada gera mensagens diferentes:
  - corretor: o que executar agora;
  - gerente: onde cobrar cadência e organizar o time;
  - diretor: onde existe risco de receita ou forecast.
- A explicação principal do radar também muda conforme o perfil.

## Impacto operacional

O Kanban deixa de ser apenas um quadro visual e passa a orientar decisão. Isso reduz ruído porque cada usuário recebe uma sugestão compatível com sua responsabilidade real.

## Proteções

- Não altera banco.
- Não cria migrations.
- Não muda a hierarquia ou RBAC.
- Não executa automações sozinho.
- Mantém humano no controle da decisão.

## Validação

- Check de fase: `npm run evolution:phase-123:check`
- Typecheck: obrigatório por alterar TSX.
- Lint: obrigatório por alterar interface React.

## Próxima evolução sugerida

Fase 124: adicionar microcopy de ação rápida no topo de cada coluna, conectando o gargalo principal à próxima movimentação recomendada.
