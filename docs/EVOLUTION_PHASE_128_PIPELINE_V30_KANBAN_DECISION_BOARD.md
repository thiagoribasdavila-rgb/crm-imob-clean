# Fase 128 — Pipeline V30 Kanban Decision Board

## Objetivo
Transformar o Pipeline/Kanban em uma tela de decisão comercial, com menos ruído visual e mais clareza da próxima melhor ação.

## O que mudou
- Foi criada a camada `Kanban V30 · próxima decisão`.
- O topo do pipeline agora destaca:
  - modo operacional atual;
  - lead que merece atenção;
  - ações de responder, converter, proteger e fechar;
  - índice de clareza do quadro e ruído estimado.
- Os cards do Kanban receberam marcação V30 e texto de ação mais direto: `IA: preparar abordagem`.
- Em modo compacto, detalhes secundários ficam recolhidos para reduzir sobrecarga visual.
- O quadro continua usando os mesmos dados, etapas, movimentações, histórico e permissões.

## Impacto operacional
- O corretor trabalha por prioridade em vez de procurar manualmente no quadro.
- O gerente vê cadência e gargalos com mais velocidade.
- A IA fica conectada à execução do pipeline, ajudando a preparar abordagem e follow-up.
- A experiência fica mais próxima de um produto premium: menos ruído, mais ação.

## Limites desta fase
- Não altera schema do banco.
- Não cria novas automações.
- Não muda regras de permissão.
- Não substitui a lógica atual do Kanban; apenas adiciona uma camada decisiva e melhora a leitura.

## Validação
- `npm run evolution:phase-128:check`
- `npm run typecheck`
- `npm run lint`
