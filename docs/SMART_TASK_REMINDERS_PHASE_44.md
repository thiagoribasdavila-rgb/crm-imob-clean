# Fase 44 — Lembretes inteligentes

## Resultado

A antiga tela vazia virou uma caixa pessoal. Tarefas altas alertam com 24 horas; normais, com 4; baixas, com 1; vencidas entram imediatamente. Leitura e descarte pertencem ao responsável.

## Controle de ruído

Cada tarefa, tipo e prazo gera no máximo um lembrete. Reagendamento permite um novo alerta para o novo prazo. Tarefas encerradas desaparecem da caixa. Nenhum lembrete contata cliente ou conclui trabalho.

## Homologação

Aplicar migration, ativar worker e validar janelas, fuso, reagendamento, conclusão, descarte, liderança, corretor, concorrência e dois tenants. Execute `npm run smart-reminders:check`.
