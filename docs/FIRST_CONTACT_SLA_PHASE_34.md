# Fase 34 — SLA de primeiro contato

## Resultado

Toda lead recebe um prazo de primeiro contato no momento da entrada. A configuração padrão é de 5 minutos para Meta, Facebook e Instagram e de 15 minutos para as demais origens. A política fica isolada por organização e pode ser alterada sem mudar o histórico já medido.

## Medição confiável

O relógio só encerra com uma interação comercial válida: ligação, e-mail, WhatsApp, visita, reunião, mensagem ou contato registrado. Eventos internos e automações sem contato com o cliente não contam. Mensagens enviadas ou recebidas pela conversa também encerram o SLA de forma idempotente.

O sistema grava o horário do primeiro contato, os minutos de resposta e se o prazo foi cumprido. O Kanban mostra o resultado concluído ou o tempo restante; a visão do gerente consolida cumprimento e tempo médio por corretor.

## Homologação

Aplicar a migration e testar uma lead de Meta e outra origem. Confirmar: prazo inicial; evento automático sem encerramento; interação válida; minutos calculados; resultado no Kanban; taxa e média na visão gerencial; isolamento entre duas organizações.

Execute `npm run first-contact-sla:check`. A aferição final exige tráfego e usuários reais em homologação.
