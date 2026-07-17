# Fase 36 — SLA de visitas

## Resultado

A visita passa a ser uma entidade operacional real, vinculada à organização, lead, corretor e projeto. O fluxo diferencia agendada, confirmada, realizada, cancelada e ausência, com transições terminais protegidas no banco.

## Experiência comercial

O corretor agenda no Lead 360, informa formato, local e preparação, depois confirma ou registra o resultado em poucos cliques. O agendamento atualiza a próxima ação da lead e a timeline recebe eventos objetivos. Tarefas e visitas aparecem juntas no calendário.

## Medição e segurança

O histórico mede tempo até confirmação e atraso da realização. Ausência não pode ser registrada antes do horário; resultados terminais não podem ser reabertos silenciosamente. RLS e a hierarquia comercial protegem leitura, enquanto mutações passam pela API autenticada.

## Homologação

Aplicar a migration e testar visita presencial, videochamada, confirmação, realização, cancelamento, ausência antecipada e válida, atualização concorrente, corretor lateral e duas organizações. Execute `npm run visit-sla:check`.
