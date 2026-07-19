# ATLAS AI OS — Fase 66/3000

## Objetivo

Permitir que uma tarefa real da fila diária seja reagendada dentro do Copilot somente depois de o usuário revisar e confirmar um novo prazo. A alteração precisa permanecer explicável, idempotente, protegida contra concorrência e refletida imediatamente na rotina comercial.

## O que existia antes

- A fila diária autenticada já separava tarefas reais de oportunidades sem tarefa.
- O Copilot já conseguia preparar ações e concluir tarefas com confirmação humana.
- A API possuía o adiamento manual de um dia, mas o Copilot era corretamente impedido de usá-lo.
- Não havia escolha governada de uma nova data dentro do Copilot.

## Problema resolvido

Quando uma tarefa não podia ser executada no prazo atual, o usuário precisava abandonar o contexto do Copilot ou usar um adiamento rígido. Liberar uma escrita genérica seria perigoso: poderia sobrescrever uma mudança feita por outra pessoa, repetir auditorias ou ocultar que a tarefa já foi concluída.

## Alterações realizadas

### Copilot

- Tarefas reais recebem a autoridade explícita `reschedule-task`; oportunidades sem tarefa não recebem essa ação.
- O cartão mostra estado, prazo atual e um campo editável para o novo prazo.
- O usuário precisa marcar que revisou a data antes de confirmar.
- Alterar a data invalida a confirmação e gera uma nova chave idempotente.
- O sucesso diferencia uma alteração nova de uma repetição segura.
- A fila diária é recarregada depois da alteração.

### API de tarefas

- A ação `reschedule` exige sessão, organização, RLS, confirmação, status observado, prazo observado, novo prazo futuro e chave idempotente quando a origem é o Copilot.
- A atualização compara atomicamente o status e o `due_date` vistos pelo usuário.
- Uma tarefa concluída não pode ser reagendada.
- Se o novo prazo já foi aplicado, a repetição retorna sucesso sem nova transição.
- Se status ou prazo mudaram para outro valor, a API responde conflito e pede nova revisão.
- Responsável, prioridade, lead e pipeline não são alterados.
- Tarefas ligadas a leads registram `copilot_task_rescheduled`; falhas do histórico usam log estruturado seguro.

## Impacto operacional

- O corretor reorganiza a rotina sem sair do contexto que explicou a prioridade.
- O gerente recebe um histórico mais confiável de mudança de prazo.
- A fila deixa de continuar exibindo uma tarefa no prazo antigo após o reagendamento.
- A IA permanece assistiva: ela prepara o contexto, mas não escolhe nem confirma a data pelo usuário.

## Segurança e governança

- Nenhuma chave administrativa é usada no navegador ou na rota.
- A atualização continua sob o cliente autenticado e as políticas RLS existentes.
- O identificador de idempotência é reduzido a uma impressão digital no log.
- Status e prazo formam a trava de concorrência.
- O endpoint não amplia a ação para mensagens, distribuição, responsável, prioridade ou pipeline.
- Nenhuma tabela, coluna, migration ou dado de produção foi criado nesta fase.

O changelog do Supabase foi revisado em 18/07/2026. As mudanças recentes sobre exposição automática de novas tabelas não afetam esta fase porque ela reutiliza a tabela já ativa e não altera schema.

## Validação

- verificação dedicada da Fase 66;
- regressão das filas e ações governadas anteriores;
- segurança das APIs;
- TypeScript sem emissão e sem cache incremental;
- ESLint;
- revisão de práticas React;
- varredura de segredos;
- `git diff --check`;
- programa contínuo completo.

Build e ZIP permanecem reservados ao gate único de release.

## Risco identificado

O Atlas valida formato, futuro, concorrência e evidência, mas não pode garantir que a data escolhida seja comercialmente ideal. A decisão continua atribuída ao usuário que a confirmou.

## Próxima etapa recomendada

Fase 67 — coletar, com confirmação humana, o resultado observado após a execução de uma tarefa e transformar esse resultado em memória comercial auditável, sem inferir sucesso automaticamente.
