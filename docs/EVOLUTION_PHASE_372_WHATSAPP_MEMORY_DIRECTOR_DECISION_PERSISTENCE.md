# Fase 372 — Persistência segura da decisão do diretor

## Objetivo

Preparar localmente o registro imutável, isolado por organização e auditável da futura decisão humana sobre a memória estruturada do WhatsApp.

## Entrega

- ledger append-only com RLS habilitada e forçada;
- leitura somente para diretor autenticado da mesma organização;
- nenhuma permissão de `insert`, `update` ou `delete` para navegador autenticado;
- RPC de escrita exclusiva do `service_role`;
- decisor ativo e pertencente à organização obrigatórios;
- decisão explícita, justificativa de 20 a 1.000 caracteres e duas confirmações humanas;
- evidência técnica completa, sem PII, conteúdo bruto ou decisão automática;
- evidência com validade máxima de 24 horas;
- idempotência por organização, replay seguro e conflito detectado;
- decisão e evento em `audit_logs` gravados na mesma transação;
- registro explícito de que nenhuma aprendizagem é ativada pela decisão.

## Estado real

A migration existe apenas no workspace. Ela não foi aplicada ao Supabase remoto e não há endpoint ou botão de decisão. Portanto, nenhuma aprovação ou rejeição foi persistida.

## Próximo gate

Reconciliar a migration com o banco remoto e, somente após validação, criar um endpoint autenticado que recalcule a evidência no servidor antes de chamar a RPC. A interface continuará sem ação de aprovação até essa prova ponta a ponta.
