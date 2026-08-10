# Atlas One — Fase 17: hierarquia de métricas

Data: 04/08/2026

## Objetivo

Fazer a Sala de Comando responder rapidamente “onde agir” sem eliminar informação útil. A leitura imediata passa a ter cinco métricas essenciais; indicadores de contexto ficam disponíveis sob demanda.

## Alterações

- Criado o componente canônico `AtlasMetricDeck`, com camadas principal e complementar.
- A Sala de Comando prioriza: leads ativos, leads quentes, leads sem responsável, tarefas atrasadas e pipeline estimado.
- Visitas, sinais Meta/CAPI e recebíveis permanecem disponíveis em “Ver indicadores complementares”.
- Removida a regra visual que ocultava silenciosamente o sexto indicador e os seguintes.
- A divulgação usa `details` e `summary` nativos, preservando teclado, foco e tecnologia assistiva.

## Impacto operacional

- Menos números competem pela primeira decisão.
- SLA, distribuição, intenção e valor permanecem visíveis sem interação.
- Diretor ainda acessa recebíveis e indicadores Meta sem trocar de tela.
- Nenhum cálculo, dado, endpoint, permissão ou integração foi modificado.

## Validação

```text
npm run ux:phase-017:check
npm test
npm run typecheck
npm run lint
```

## Próxima fase

Aplicar a mesma hierarquia à entrada diária e aos painéis específicos de diretor, superintendente, gerente e corretor, escolhendo cinco métricas por decisão e perfil.
