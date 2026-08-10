# Fase 118 — Kanban Lens Queue

Objetivo: transformar a lente ativa do Kanban em uma fila única de execução rápida.

## O que mudou

- Foi criada uma Fila única acima do Kanban com as cinco próximas ações mais importantes.
- A fila respeita busca, filtros e lente ativa.
- A mesma base de ranking da Fase 117 agora também organiza uma visão global:
  - Corretor: quem ligar, retomar ou agendar primeiro.
  - Gerente: quais gargalos e atrasos destravar.
  - Diretor: quais oportunidades têm maior impacto em receita e forecast.
- Cada item mostra nome do lead, etapa atual, ação recomendada e motivo curto de prioridade.
- Quando o recorte está limpo, o Atlas mostra um estado vazio claro.

## Impacto operacional

O usuário não precisa varrer o quadro inteiro para decidir. O Atlas já coloca no topo as oportunidades mais importantes do momento, diminuindo ruído visual e aumentando velocidade de atendimento.

## Validação

- Check de fase: `npm run evolution:phase-118:check`
- Typecheck: obrigatório por alterar TSX.
- Lint: obrigatório por alterar interface React.

## Próxima evolução sugerida

Fase 119: adicionar ações rápidas contextuais na fila única, como ligar, criar tarefa, enviar mensagem IA e avançar etapa com segurança.
