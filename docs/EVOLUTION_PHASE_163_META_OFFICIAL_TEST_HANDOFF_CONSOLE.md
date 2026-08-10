# ATLAS AI OS — Fase 163

## Meta Official Test Handoff Console

Objetivo: transformar o ensaio oficial da Meta em um processo guiado, auditável e seguro para a diretoria.

## O que foi implementado

- Seção “Ensaio oficial controlado” na tela de Campanhas.
- Prontidão do handoff baseada em:
  - ambiente Meta validado;
  - payload aprovado;
  - evento comercial certo;
  - lead elegível;
  - recibo Meta pendente.
- Roteiro copiável do ensaio.
- Guardrails para evitar envio acidental ou aprendizado errado.
- Atalho para `/integrations/meta`, onde o ensaio real deve acontecer.

## Proteção operacional

Esta fase não dispara CAPI real nesta página.

Ela prepara o handoff para o teste oficial e deixa claro que:

- o envio real acontece somente no módulo de integrações Meta;
- a campanha não muda verba, público ou criativo durante o ensaio;
- a lead escolhida precisa ter origem Meta, identificador e consentimento;
- o recibo do Events Manager precisa ser anexado antes da aprovação final;
- falhas devem ser registradas antes de nova tentativa.

## Impacto para o negócio

O diretor ganha uma visão objetiva do que falta para transformar campanhas ativas em aprendizado de público comprador para o Meta/Andromeda. Isso reduz risco de alimentar a Meta com sinal fraco, duplicado ou sem valor comercial.

## Próximo passo recomendado

Criar uma seleção assistida de lead elegível para ensaio, mostrando origem Meta, consentimento, identificadores disponíveis e risco de duplicidade antes de habilitar o teste real.
