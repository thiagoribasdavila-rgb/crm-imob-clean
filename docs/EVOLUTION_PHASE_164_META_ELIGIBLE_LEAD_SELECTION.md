# ATLAS AI OS — Fase 164

## Meta Eligible Lead Selection

Objetivo: transformar a preparação do teste Meta/Andromeda em uma escolha segura de lead real, antes de qualquer envio oficial.

## O que foi implementado

- API protegida em `/api/v1/integrations/meta/test-candidates`.
- Seleção de candidatas com origem Meta preservada.
- Máscara de privacidade: a tela não expõe telefone, e-mail, CPF, renda ou documento.
- Cálculo de prontidão por quatro sinais:
  - origem Meta;
  - telefone ou e-mail disponível para deduplicação;
  - consentimento/base legal;
  - projeto vinculado.
- Nova seção “Lead real elegível para o teste Meta” na tela de Campanhas.
- Handoff copiável para diretoria e operação técnica, sem disparar CAPI real.

## Proteção operacional

Esta fase não envia evento para Meta.

Ela apenas responde:

- existe uma lead real de origem Meta?
- ela tem identificador para deduplicação?
- ela tem consentimento ou base legal registrada?
- ela está vinculada a um projeto?
- o diretor pode liberar o ensaio oficial ou precisa completar dados?

## Impacto para o negócio

A diretoria deixa de fazer teste Meta com lead aleatória ou incompleta. O Atlas passa a orientar o primeiro ensaio oficial com uma candidata segura, aumentando a chance de a Meta/Andromeda receber sinal útil de comprador real.

## Próximo passo recomendado

Criar recibo interno de aprovação da lead selecionada antes do primeiro envio oficial no módulo de Integrações Meta.
