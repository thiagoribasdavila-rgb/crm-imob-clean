# ATLAS AI OS — Fase 112

## Kanban com roteiro de ação

Objetivo: deixar cada card do Kanban mais decisivo, orientando o corretor sobre o que fazer agora, o que completar e como avançar a oportunidade.

## O que mudou

- Cada card ganhou um bloco `Roteiro rápido`.
- O roteiro tem três passos:
  - contato ou retomada;
  - qualificação, visita ou envio de material;
  - avanço para agenda, proposta, fechamento ou registro de aprendizado.
- A prioridade considera:
  - SLA vencido;
  - próxima ação atrasada;
  - ausência de próxima ação;
  - score;
  - temperatura;
  - etapa atual do funil.
- O modo compacto mostra somente o essencial para reduzir ruído visual.

## Impacto operacional

- O corretor não precisa interpretar o card inteiro para decidir.
- A próxima melhor ação fica explícita.
- Leads sem compromisso futuro são pressionados para registro.
- Leads quentes são conduzidos mais rápido para visita ou proposta.
- A IA passa a receber melhor histórico de ação, objeção e aprendizado.

## Segurança

- Nenhuma ação é executada automaticamente.
- Nenhuma mensagem é disparada sem revisão humana.
- Nenhuma migration é necessária.
- O roteiro apenas orienta a execução e mantém o controle com o usuário.

## Validação

- `npm run evolution:phase-112:check`
- `npm run typecheck`
- `npm run lint`
