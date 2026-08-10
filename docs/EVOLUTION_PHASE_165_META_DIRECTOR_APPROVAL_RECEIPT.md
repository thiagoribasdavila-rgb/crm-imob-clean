# ATLAS ONE — Fase 165

## Meta Director Lead Approval Receipt

Objetivo: converter a seleção segura da fase 164 em uma decisão formal da diretoria, persistida e verificável, sem enviar sinais para a Meta.

## O que foi entregue

- O painel “Lead real elegível para o teste Meta” voltou à tela de Campanhas.
- A seleção mostra apenas identidade mascarada, projeto, prontidão e pendências.
- A API `/api/v1/integrations/meta/test-approvals`:
  - exige perfil `admin`, `director_decisor` ou `director`;
  - aplica rate limit;
  - confirma novamente o tenant e a elegibilidade no servidor;
  - rejeita lead sem origem Meta, identificador, consentimento ou projeto;
  - registra justificativa entre 10 e 500 caracteres;
  - reutiliza aprovação ainda válida para evitar duplicidade.
- O recibo é persistido em `atlas_events` com validade de 24 horas.
- Uma fingerprint SHA-256 identifica o contexto aprovado sem guardar PII no payload do evento.

## Limite desta fase

A aprovação é um gate interno. Ela não autoriza entrega externa, não chama CAPI, não altera campanha e não muda verba.

Os campos `deliveryAuthorized` e `externalEventSent` permanecem `false` por contrato.

## Impacto comercial

A diretoria passa a saber qual lead foi aprovada, quem aprovou, por quê e até quando a decisão vale. Isso reduz ensaio com sinal inadequado e prepara uma ativação Meta/Andromeda controlada, reversível e auditável.

## Próximo passo recomendado

Congelar o payload mínimo do ensaio e vincular sua fingerprint ao recibo vigente, ainda sem realizar envio externo.
