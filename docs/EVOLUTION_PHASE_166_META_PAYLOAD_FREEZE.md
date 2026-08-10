# ATLAS ONE — Fase 166

## Meta Approved Payload Freeze

Objetivo: materializar exatamente qual sinal mínimo foi aprovado para o ensaio Meta, vinculando-o ao recibo vigente da diretoria sem executar entrega externa.

## O que foi entregue

- O contrato `atlas.meta.test-event.v1` contém somente:
  - identificador interno da lead;
  - identificador da aprovação;
  - projeto e origem;
  - nome do evento e fonte da ação;
  - fingerprint do contexto aprovado;
  - guardrails de entrega e envio mantidos em `false`.
- A API `/api/v1/integrations/meta/test-payloads`:
  - exige perfil `admin`, `director_decisor` ou `director`;
  - aplica rate limit;
  - confirma tenant, aprovação vigente e lead atual no servidor;
  - recalcula a fingerprint do contexto e rejeita qualquer divergência;
  - reutiliza o recibo já congelado para a mesma aprovação;
  - persiste o recibo em `atlas_events`.
- A tela de Campanhas permite à diretoria congelar o payload somente após uma aprovação válida e exibe as duas fingerprints para auditoria.

## Privacidade e segurança

O payload congelado não contém telefone, e-mail, CPF, renda, documentos ou texto livre. A rota não chama CAPI, não acessa token Meta, não grava em fila externa e não usa `fetch`.

`deliveryAuthorized` e `externalEventSent` permanecem `false` em todos os níveis do contrato.

## Impacto comercial

A operação agora consegue provar não apenas quem aprovou uma lead, mas também qual conteúdo exato seria avaliado no próximo gate. Isso evita que uma mudança silenciosa de dados produza um sinal diferente do aprovado e melhora a qualidade futura do aprendizado Meta/Andromeda.

## Limite desta fase

Esta fase não envia evento, não altera campanha, não muda orçamento e não ativa automação externa.

## Próximo passo recomendado

Fase 167: gate explícito de execução, com dupla verificação humana e técnica antes de qualquer entrega controlada.
