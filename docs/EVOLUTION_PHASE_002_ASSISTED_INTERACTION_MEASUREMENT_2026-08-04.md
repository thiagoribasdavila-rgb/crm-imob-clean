# Atlas One — Fase 2: medição da captura assistida

## Objetivo

Medir se a captura assistida reduz o trabalho administrativo sem registrar conteúdo de conversas em telemetria ou executar ações externas.

## Métricas reais

- rascunhos gerados;
- registros confirmados por revisão humana;
- rascunhos descartados;
- taxa de confirmação e descarte;
- mediana entre rascunho e confirmação;
- média até a próxima atividade comercial registrada para a mesma lead.

## Privacidade e operação

Os eventos técnicos usam `atlas_events`, com `captureId`, canal e origem do gerador. Não incluem anotação original, resumo, objeções, nome, telefone, e-mail ou qualquer conteúdo de conversa. A confirmação continua sendo o único momento em que o atendimento revisado entra em `lead_events`.

O endpoint de leitura é `GET /api/v1/analytics/assisted-interaction?days=30`, disponível apenas à diretoria, superintendência e administrador. Ele devolve somente números agregados e nunca altera a operação.

## Validação

Os testes de contrato confirmam o cálculo das métricas e que a telemetria não recebe `sourceText` nem `originalNote`.
