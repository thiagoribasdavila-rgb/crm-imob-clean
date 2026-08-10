# ATLAS ONE — Fase 167

## Meta Controlled Execution Gate

Objetivo: criar a última autorização interna antes de um ensaio Meta real, mantendo a entrega externa bloqueada nesta fase.

## O que foi entregue

- O contrato `atlas.meta.execution-gate.v1` registra:
  - aprovação e payload congelado vinculados;
  - fingerprint exata do payload;
  - confirmação explícita da diretoria;
  - dry-run técnico aprovado;
  - validade máxima de dez minutos;
  - limite de uma entrega futura;
  - chave idempotente;
  - prova de que o evento externo ainda não foi enviado.
- A API `/api/v1/integrations/meta/test-execution-gates`:
  - exige perfil `admin`, `director_decisor` ou `director`;
  - aplica rate limit;
  - isola todas as consultas pela organização autenticada;
  - revalida a aprovação e o payload congelado no servidor;
  - recalcula a fingerprint do payload;
  - rejeita recibos expirados, alterados ou já autorizados indevidamente;
  - reutiliza o mesmo gate quando a chave idempotente já existe;
  - persiste o recibo em `atlas_events`.
- A tela de Campanhas permite à diretoria abrir o gate por dez minutos e exibe o recibo de uso único.

## Dry-run obrigatório

Antes de gerar o recibo, o servidor comprova:

1. aprovação ativa;
2. schema válido;
3. fingerprint íntegra;
4. isolamento pelo tenant;
5. nenhuma entrega anterior declarada.

## Segurança

O gate não carrega telefone, e-mail, CPF, renda ou documentos. A rota não chama CAPI, não lê token Meta, não grava em fila externa e não utiliza `fetch`.

O campo `externalEventSent` permanece `false`. A existência do gate não equivale a sucesso de entrega.

## Impacto comercial

A diretoria passa a controlar uma janela curta e de uso único para o ensaio. Isso reduz duplicidade, impede execução com contexto alterado e cria uma trilha clara entre decisão humana, payload congelado e futura resposta técnica da Meta.

## Limite desta fase

Esta fase não envia evento, não consome o gate, não altera campanha e não muda orçamento.

## Próximo passo recomendado

Fase 168: consumir um gate vigente em uma única entrega real controlada e registrar o recibo técnico, com bloqueio de repetição.
