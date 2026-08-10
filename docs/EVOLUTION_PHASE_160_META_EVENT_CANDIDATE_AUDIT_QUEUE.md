# Fase 160 — Meta Event Candidate Audit Queue

## Objetivo

Criar uma fila auditável de eventos candidatos para Meta/Andromeda antes de qualquer envio real.

## Problema resolvido

Até esta fase, o Atlas já diferenciava lead recebido, lead qualificado, visita, proposta e venda como sinais de aprendizado. Faltava uma camada de decisão antes do envio para a Meta: quais eventos têm volume, quais precisam de aprovação, qual deduplicação será usada e quais cuidados de privacidade bloqueiam automação cega.

## O que foi implementado

- Fila visual de eventos candidatos na área de campanhas.
- Classificação por sinal médio, forte e ouro.
- Status de volume por evento.
- Regras explícitas de deduplicação.
- Exibição de consentimento, privacidade e origem preservada.
- Aprovação humana antes de evento forte ou ouro.
- Requisitos mínimos antes de liberar futura camada CAPI.

## Impacto operacional

O diretor passa a enxergar o que pode ensinar o público comprador para Meta/Andromeda sem depender de volume bruto. O marketing consegue preparar o ciclo de feedback com mais segurança, preservando origem e evitando que eventos fracos comandem orçamento.

## Segurança e governança

Esta fase não envia eventos para Meta, não aciona API externa, não cria migrations, não altera banco e não expõe dados pessoais. Nenhuma migration é executada nesta etapa. A fila é uma preparação operacional para homologar CAPI com deduplicação, consentimento, origem preservada e aprovação humana.

## Próxima etapa recomendada

Criar o rascunho técnico da camada de envio controlado: payload validado, botão de aprovação do diretor, modo teste e recibo de observação antes de qualquer evento real.

## Validação

- `npm run evolution:phase-160:check`
- `npm run typecheck`
- `npm run lint`
