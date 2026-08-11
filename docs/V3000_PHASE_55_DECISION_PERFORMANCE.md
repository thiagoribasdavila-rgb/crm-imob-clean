# V3000 — Fase 55: performance e telemetria de decisão

## Resultado entregue

O Pipeline preserva o mesmo fluxo comercial e passa a preparar sua leitura em
índices únicos por lead, etapa e posição do funil. A mudança reduz varreduras
repetidas durante a renderização dos cards e registra quatro tempos do percurso
decisório usando o endpoint autenticado de eventos já existente.

Nenhuma métrica é apresentada como aumento de conversão. A prova desta fase é
exclusivamente computacional e operacional: menos operações comparáveis para
montar o quadro e tempos reais para identificar, abrir, iniciar e concluir uma
decisão.

## Orçamento de performance

| Indicador                          |       Orçamento |
| ---------------------------------- | --------------: |
| Feedback de interação              |      até 100 ms |
| Payload por evento                 | até 1.024 bytes |
| Carteira operacional de referência |       500 leads |

O orçamento de 100 ms é o limite de resposta local percebida. A telemetria é
assíncrona, usa `keepalive` e nunca bloqueia a operação quando o coletor estiver
indisponível.

## Prova comparável

O quadro anterior precisava comparar cada lead com cada etapa para formar as
colunas: `O(leads × etapas)`. O índice atual agrupa os leads uma vez e percorre
as etapas uma vez: `O(leads + etapas)`.

Na carga de referência de 500 leads e sete etapas:

| Implementação      | Operações comparáveis |
| ------------------ | --------------------: |
| Varredura anterior |                 3.500 |
| Índice agrupado    |                   507 |
| Redução calculada  |                85,51% |

Essa redução não afirma ganho de receita. Ela demonstra somente a eliminação de
2.993 comparações redundantes na mesma carga controlada.

## Percurso decisório medido

1. `atlas.pipeline_priority_identified`: tempo entre entrar no Pipeline e a
   primeira prioridade operacional estar disponível.
2. `atlas.pipeline_opportunity_opened`: tempo entre a prioridade identificada e
   a abertura do contexto da oportunidade.
3. `atlas.pipeline_action_started`: tempo entre abrir/priorizar e iniciar uma
   movimentação governada.
4. `atlas.pipeline_result_registered`: tempo de confirmação ou falha da
   movimentação persistida.

Os eventos usam `/api/v3/events/ingest`, autenticação existente e a tabela
`atlas_events`. A fase não cria endpoint, tabela ou migration paralela.

## Privacidade e minimização

O construtor de eventos aceita somente versão, duração, volume carregado,
quantidade de etapas, método, etapa de origem, etapa de destino e resultado.
Campos como nome, telefone, e-mail, mensagem, observação e conteúdo de conversa
são descartados antes da serialização. O identificador da lead também não é
enviado nessa telemetria.

## Preservação operacional

- a movimentação continua passando pelo mesmo `moveLead` e pela mesma API;
- validações de fechamento e reversão continuam obrigatórias;
- o estado otimista continua revertendo quando a persistência falha;
- RLS, organização e escopo comercial não foram ampliados;
- não há chamada de IA, dados sintéticos de negócio ou alteração de banco.

## Validação

O contrato automatizado comprova o orçamento, a comparação controlada, os
quatro eventos, a remoção de conteúdo pessoal e a adoção dos índices únicos no
Pipeline. TypeScript e ESLint permanecem como gates técnicos desta fase; o
build completo fica reservado ao fechamento da Fase 56.
