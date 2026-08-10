# Fase 350 — Baseline real da entrada de leads

## Resultado desta entrega

O contrato existente de entrada diária de leads foi ampliado para medir, sem dados fictícios:

- mediana entre criação e primeira ação observada;
- cobertura da medição de primeira ação;
- percentual de leads com responsável;
- percentual de leads com próxima ação agendada;
- entrada por dia, projeto e origem;
- recebimentos por corretor e por dia.

A resposta continua agregada e não devolve dados pessoais. O escopo de organização, papel e hierarquia permanece aplicado por `requireAccessContext`.

## Limites de verdade aplicados

- Importações históricas e bases de reativação não entram na baseline operacional.
- Ausência de amostra retorna `null`, nunca uma falsa métrica zero.
- `first_response_minutes = null` não é interpretado como atendimento imediato.
- Origens equivalentes, como `Meta Ads` e `meta_ads`, são consolidadas.
- A mediana usa apenas uma primeira ação realmente observada.
- O endpoint não grava nem altera leads, usuários ou distribuição.

## Arquivos alterados

- `lib/analytics/lead-intake.ts`
- `app/api/v1/analytics/lead-intake/route.ts`
- `tests/contracts/lead-intake-analytics.test.mjs`
- `config/value-delivery-phase-350-baseline.json`

## Validações concluídas

- Regressão específica: 9/9 cenários aprovados.
- TypeScript ativo: aprovado.
- ESLint dos arquivos alterados: aprovado, sem warnings.
- Contrato dos ciclos 350–399: aprovado (10 ciclos e 50 fases contínuas).
- Varredura de segredos: aprovada (0 credenciais detectadas).

Por política do programa, o build não foi executado: existe apenas um build no fechamento da versão/release.

## Evidência real pendente

A leitura autenticada não foi executada porque as variáveis necessárias estão declaradas no `.env.local`, porém seus valores estão vazios. Nenhuma credencial foi impressa ou copiada.

Enquanto essa prova não existir:

- a implementação está validada localmente;
- a fase 350 não é marcada como homologada;
- `currentPhase` permanece em 349;
- nenhum percentual real de conversão é alegado;
- nenhum ZIP, deploy, migration ou escrita remota é autorizado.

Variáveis locais necessárias para a prova: URL e chave pública do Supabase, service role, conta de teste e organização padrão. Elas devem ser preenchidas somente no ambiente seguro, nunca em documentação ou chat.

## Prova de retomada

Com as variáveis preenchidas, executar uma leitura autenticada de `GET /api/v1/analytics/lead-intake?days=14` e registrar apenas:

- status HTTP;
- tamanho agregado da amostra;
- presença ou ausência das métricas;
- quantidades de dimensões por projeto, origem e corretor;
- nenhuma informação pessoal ou token.

Somente após essa prova a memória do programa pode avançar para 350 e a fase 351 pode iniciar.

## Reversão segura

Os campos da resposta são aditivos. Consumidores atuais podem ignorá-los. A reversão exige apenas retirar os novos campos do agregador e da rota; não há migration, alteração de schema ou dado remoto a desfazer.
