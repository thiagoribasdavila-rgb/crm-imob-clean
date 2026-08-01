# Fase 24 — Dashboard do diretor

## Missão

Reunir em uma única visão executiva a saúde comercial, financeira, de mídia, incorporadoras, IA e riscos da organização. O objetivo é acelerar decisões diárias sem transformar correlação em causalidade ou recomendação em execução automática.

## Visão executiva

- pipeline bruto e forecast ponderado pela probabilidade registrada no CRM;
- vendas ganhas, comissões a receber e comissões vencidas;
- leads ativos, quentes, sem responsável e SLAs vencidos;
- campanhas, investimento, receita atribuída, CPL, conversão e amostra decisória;
- incorporadoras, projetos, leads e ganhos;
- superintendências diretamente subordinadas e suas estruturas;
- custo, chamadas, tokens e latência da IA nos últimos 30 dias;
- fila de riscos comerciais, financeiros, operacionais e de governança.

## Confiança e decisão

O forecast não é uma promessa: é a soma do valor aberto ponderado pela probabilidade registrada. Sem snapshot anterior, o painel não afirma movimento. Campanhas exigem 30 leads e superintendências 50 leads antes de qualquer comparação de conversão.

O endpoint é exclusivo de diretor/admin e filtra todas as fontes por `organization_id`. A resposta é somente leitura. Orçamento, campanhas, pessoas, metas e transferências continuam sujeitos à aprovação humana em seus fluxos próprios.

## Homologação

1. Validar dois diretores em organizações diferentes e confirmar isolamento total.
2. Reconciliar pipeline, vendas e comissões com o relatório financeiro.
3. Conferir campanha com e sem 30 leads.
4. Conferir superintendência com e sem 50 leads.
5. Simular SLA, comissão vencida e lacuna hierárquica para validar a fila de riscos.
6. Confirmar telemetria real da IA e ausência de valores inventados.
7. Medir se o diretor encontra as três decisões mais importantes em menos de dois minutos.
