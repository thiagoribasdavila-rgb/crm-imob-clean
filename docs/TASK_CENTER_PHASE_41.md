# Fase 41 — Central de tarefas

## Resultado

A operação diária passa a ter uma fila canônica com prioridade explicável, atrasos, tarefas de hoje, itens sem prazo, responsável e vínculo com a lead. Lideranças recebem o consolidado somente da equipe visível pelo RLS.

## Escrita segura

Conclusão e reagendamento deixaram de escrever diretamente no navegador. A API autenticada aceita somente duas ações conhecidas, reconfirma organização e escopo e devolve o estado persistido. Não há atribuição automática nem ranking de pessoas.

## Homologação

Validar tarefa própria, subordinada, lateral, sem lead, sem prazo, vencida, conclusão concorrente, reagendamento, quatro perfis e dois tenants. Execute `npm run task-center:check`.
