# Fase 119 — Kanban Queue Quick Actions

Objetivo: transformar a fila inteligente do Kanban em uma área de execução comercial imediata.

## O que mudou

- Cada item da fila inteligente agora possui ações rápidas.
- O card deixou de ser um link inteiro e passou a ter botões internos seguros.
- Ações disponíveis:
  - Lead 360 para abrir o perfil completo.
  - Ligar quando houver telefone válido.
  - WhatsApp quando houver telefone válido.
  - IA para gerar próxima abordagem de follow-up.
  - Tarefa para registrar compromisso ou próxima ação.
- Quando não existe telefone, o Atlas mostra um estado compacto de “Sem telefone” em vez de criar ação quebrada.

## Impacto operacional

O corretor não precisa sair caçando onde agir. A fila mostra quem priorizar e já oferece a execução em um toque. Isso diminui fricção, melhora o tempo de resposta e fortalece a missão central do Atlas: transformar leads em vendas.

## Proteções de experiência

- Sem links aninhados dentro de cards clicáveis.
- Ações compactas para reduzir ruído visual.
- Fallback quando telefone não existe.
- Mantém busca, filtros, lente comercial e ranking da fase anterior.

## Validação

- Check de fase: `npm run evolution:phase-119:check`
- Typecheck: obrigatório por alterar TSX.
- Lint: obrigatório por alterar interface React.

## Próxima evolução sugerida

Fase 120: adicionar micro-fluxo seguro para movimentar lead entre etapas a partir da fila inteligente, com confirmação visual e sem exigir arrastar cards.
