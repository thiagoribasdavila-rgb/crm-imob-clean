# V3000 Fase 48 — Sinais comportamentais compactos

## Resultado

O card do Pipeline passa a resumir, sob demanda, no máximo três sinais que
podem alterar a próxima decisão comercial. A leitura permanece compacta; o
histórico completo continua no Lead 360.

## Sinais admitidos

- **Retorno confirmado:** existe resposta do cliente em conversa registrada e
  com canal confirmado.
- **Silêncio operacional:** não existe retorno confirmado e o CRM não registra
  interação há pelo menos 72 horas.
- **Visita:** usa data explícita registrada nos metadados. Quando existe apenas
  a etapa `visita`, informa que a conclusão não foi presumida.
- **Material consultado:** requer data explícita de abertura ou visualização no
  CRM.
- **Preferência alterada:** requer data explícita de atualização das
  preferências.

## Contrato de confiança

1. O card mostra no máximo três sinais, ordenados pelo impacto na decisão e não
   como uma timeline completa.
2. Nenhum sinal é criado a partir de texto livre, aparência, suposição da IA ou
   comportamento não registrado.
3. Silêncio não aparece quando o estado da conversa confirma retorno do
   cliente.
4. Etapa de visita não é apresentada como visita concluída.
5. Cada sinal informa origem e momento registrado, além do impacto esperado na
   próxima decisão.
6. A leitura é somente leitura: não muda etapa, responsável ou dados do lead.

## Experiência

O bloco `Sinais que mudam a decisão` usa divulgação progressiva e indica
quantos sinais foram selecionados, sempre no formato `n/3`. A ação final leva ao
Lead 360 para consultar o histórico integral, evitando duplicar uma timeline no
Kanban.

## Limites técnicos

- sem migration;
- sem nova chamada de IA;
- sem mutação comercial;
- sem evento fictício;
- sem alteração da operação atualmente publicada.

O contrato executável está em
`config/v3000-phase-48-behavioral-signals.json` e a derivação pura em
`lib/atlas/behavioral-signals.ts`.
