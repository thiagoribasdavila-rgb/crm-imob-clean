# Fase 42 — Criação rápida de tarefas

## Resultado

Uma tarefa nasce na própria Central com título, prazo, prioridade, lead opcional e responsável. Ao selecionar uma lead, o Atlas preserva automaticamente seu corretor único; sem lead, usa o próprio usuário ou um responsável visível para a liderança.

## Segurança

A API valida texto, prazo futuro, prioridades permitidas, organização, lead e responsável sob RLS. O navegador não grava diretamente, a rota possui limite de uso e nenhuma IA cria tarefas sem comando humano.

## Homologação

Validar corretor próprio, liderança, lead lateral, responsável lateral, data passada, campos extremos, vínculo sem responsável e dois tenants. Execute `npm run task-quick-create:check`.
