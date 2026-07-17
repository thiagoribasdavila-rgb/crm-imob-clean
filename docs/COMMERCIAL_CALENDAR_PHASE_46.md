# Fase 46 — Agenda comercial unificada

## Resultado

A agenda passa a consumir uma API autenticada e reúne tarefas abertas, visitas ativas e `leads.next_action_at`. Uma próxima ação igual a uma visita ativa aparece somente como visita.

## Experiência

O usuário alterna entre hoje, sete dias, mês, atrasados e todos. Indicadores separam tarefas, visitas e follow-ups; atualizações visíveis chegam por Realtime e o botão Atualizar permanece como fallback.

## Segurança

As três fontes são consultadas no cliente autenticado, com organização, hierarquia e RLS. A agenda não conclui ações, não muda responsáveis e não contata clientes.

## Homologação

Validar corretor, gerente, superintendente e diretor; dois tenants; fusos e virada do mês; tarefa, visita e follow-up no mesmo horário; perda e retorno de conexão. Execute `npm run commercial-calendar:check`.
