# Fase 58 — Reserva, aceite e devolução segura

Cada nova distribuição cria uma reserva de cinco minutos para o corretor. A Lead 360 mostra o prazo e permite o aceite explícito. A lead mantém um único responsável durante todo o processo.

O worker protegido da Hostinger processa reservas vencidas. Se o corretor já registrou uma interação, a reserva é aceita automaticamente e o atendimento permanece. Sem interação e com o mesmo responsável, a lead e suas tarefas abertas voltam à fila. Mudança de responsável torna a reserva superada, sem sobrescrever o estado atual. Nenhum cliente é contatado pelo worker.

Homologar aceite, expiração, interação antes do prazo, troca concorrente de responsável, tarefas, capacidade liberada, dois tenants, worker sem segredo e lote de 500. Execute `npm run lead-reservation:check`.
