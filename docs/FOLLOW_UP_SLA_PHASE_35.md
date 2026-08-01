# Fase 35 — SLA de follow-up

## Resultado

Cada alteração de `next_action_at` abre um ciclo de follow-up. O sistema preserva quando o compromisso foi criado, seu prazo, a execução e o resultado, sem substituir a agenda canônica da lead.

## Cadência e recuperação

Uma ligação, e-mail, WhatsApp, visita, reunião, mensagem ou contato válido conclui o ciclo aberto. Cumprimentos no prazo e recuperações tardias ficam separados. Reagendamentos encerram o ciclo anterior como substituído; remoções manuais ficam canceladas e não contaminam a taxa de execução.

O gerente acompanha, nos últimos 30 dias, taxa de cumprimento, tempo médio entre agendamento e execução, quantidade recuperada e atrasos ainda abertos. A visão permanece restrita ao time direto.

## Homologação

Aplicar a migration e testar: agendamento futuro; conclusão antecipada; conclusão atrasada; reagendamento; cancelamento manual; mensagem oficial; transferência de corretor; duas organizações. Confirmar que há somente um ciclo aberto por lead e que o painel reconcilia os eventos.

Execute `npm run follow-up-sla:check`. A meta operacional deve ser definida depois da primeira amostra real de 30 dias.
