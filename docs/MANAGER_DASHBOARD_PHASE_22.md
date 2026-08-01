# Fase 22 — Dashboard diário do gerente

## Missão

O gerente recebe uma visão curta do time direto: quem está online, onde o SLA rompeu, qual carteira está sem próxima ação, como está a conversão e quando a carga sugere redistribuição.

## Áreas

- Equipe direta, presença e disponibilidade.
- Leads ativos e quentes por corretor.
- Primeiro contato e follow-up vencidos.
- Carteiras sem próxima ação.
- Conversão com indicação explícita de amostra baixa.
- Leads recebidos nas últimas 24 horas.
- Média e diferença de carga entre corretores.
- Fila priorizada de intervenções de coaching.

## Governança

Somente perfis `broker` cujo `reports_to` é o gerente entram no painel. Estruturas paralelas e outra organização ficam excluídas. Conversão só é comparada após vinte leads; antes disso, a interface mostra “Amostra baixa”. Redistribuição é recomendada, nunca executada pelo dashboard, e não deve romper atendimento ativo.

## Homologação

Testar dois gerentes com times paralelos. Confirmar totais, presença, SLAs e carga; verificar que nenhum corretor ou lead do outro gerente aparece. Medir se o gerente identifica as três intervenções mais importantes em menos de dois minutos.
