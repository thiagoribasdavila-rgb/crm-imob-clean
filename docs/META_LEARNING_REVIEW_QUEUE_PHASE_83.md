# Fase 83 — fila humana de revisão do aprendizado

O Atlas pode exibir uma fila agregada para revisão de memória: vencida, revogada, próxima do vencimento ou bloqueada. Registros vencidos e revogados recebem prioridade urgente e um responsável de gestão.

A fila não cria tarefas, não envia notificações, não altera memória e não toca produção. Ela não expõe payload, segredos ou dados de clientes.

```bash
node scripts/preflight-meta-learning-review-queue.mjs --self-test
```
