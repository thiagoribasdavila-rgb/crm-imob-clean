# Fase 145 — Kanban V30 Mobile Decision Mode

## Objetivo

Deixar o Kanban mais eficiente no celular, colocando a próxima decisão comercial da etapa ativa antes da navegação e dos cards.

## Problema resolvido

O Kanban estava ganhando inteligência, mas no celular o corretor ainda precisava procurar a etapa, abrir cards e entender manualmente onde agir primeiro.

## Alterações realizadas

- Criada a faixa `Decisão mobile` para a etapa ativa do Kanban.
- A faixa reaproveita o lead prioritário já calculado na etapa.
- Incluídas ações rápidas:
  - abrir lead;
  - executar próxima ação;
  - chamar IA/Copilot.
- Quando não há card visível, a faixa orienta limpar filtros, cadastrar lead ou reativar base.
- A navegação mobile por etapas agora mostra também sinal de urgência ou leads quentes.
- A melhoria aparece apenas no recorte mobile, mantendo o desktop sem ruído extra.

## Impacto operacional

- Corretor decide em menos tempo.
- Menos cliques para ligar, abrir WhatsApp ou pedir ajuda da IA.
- O Kanban fica mais próximo de um cockpit comercial, não apenas uma lista de cards.
- A experiência mobile fica mais prática para uso real em plantão, rua e atendimento rápido.

## Próxima etapa recomendada

Fase 146 — Kanban V30 Stage Detail Drawer: abrir um painel lateral/compacto da oportunidade sem obrigar o corretor a sair do quadro.

## Riscos identificados

- Nenhuma alteração em banco.
- Nenhuma alteração em API.
- Nenhuma mudança nas regras de distribuição ou pipeline.
- A nova camada depende dos dados já existentes no Kanban.

## Checklist de validação

- `npm run evolution:phase-145:check`
- `npm run typecheck`
- `npm run lint`
