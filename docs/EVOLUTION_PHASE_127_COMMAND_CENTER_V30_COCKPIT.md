# Fase 127 — Command Center V30 Decision Cockpit

## Objetivo
Redesenhar o início do Command Center para apoiar decisão imediata, com menos ruído e mais clareza comercial.

## O que mudou
- Foi criado um cockpit V30 logo após o hero principal.
- A tela agora mostra um foco único: SLA, distribuição, leads quentes, estabilidade ou cadência.
- Quatro cards levam direto para as ações que mais destravam a operação:
  - ação imediata;
  - distribuição;
  - pipeline/vendas;
  - memória e evolução da IA.
- A saúde V30 mede módulos operacionais e o ruído operacional mostra se existem gargalos ativos.
- O botão de IA pede um plano curto de três passos usando o contexto real da prioridade.

## Impacto operacional
- O usuário não precisa interpretar o painel inteiro para descobrir o que fazer.
- O diretor enxerga a prioridade executiva com evidência.
- O gerente identifica rápido se o gargalo está em SLA, distribuição ou equipe.
- O corretor ganha uma rota curta para executar a próxima ação.

## Limites desta fase
- Não altera estrutura de banco.
- Não muda permissões.
- Não cria automações novas.
- Não substitui relatórios existentes; apenas adiciona uma camada de decisão mais premium e proativa.

## Validação
- `npm run evolution:phase-127:check`
- `npm run typecheck`
- `npm run lint`
