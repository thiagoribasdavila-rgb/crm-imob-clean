# Fase 161 — Meta Test Event Approval Workspace

## Objetivo

Criar um espaço de homologação para payload de teste Meta/Andromeda com aprovação do diretor antes do envio real.

## Problema resolvido

A Fase 160 criou a fila auditável de eventos candidatos. A Fase 161 transforma essa fila em um ensaio seguro: o Atlas monta um payload local, mostra os campos críticos e permite copiar o pacote para revisão, sem chamar a API da Meta.

## O que foi implementado

- Seção de modo teste Meta na página de campanhas.
- Payload local em modo `test_only_no_delivery`.
- Indicador de prontidão do teste.
- Campos de revisão: modo, evento, origem, deduplicação, privacidade e aprovação.
- Botão para copiar payload de teste.
- Botão para registrar recibo simulado.
- Checklist do diretor antes do teste real.

## Impacto operacional

O diretor passa a enxergar exatamente qual evento será ensaiado, qual campanha está vinculada, qual regra de deduplicação será usada e quais bloqueios ainda precisam ser resolvidos antes de enviar qualquer sinal para Meta/Andromeda.

## Segurança e governança

Esta fase não envia eventos reais, não aciona Meta API, não cria migrations e não altera banco. Nenhuma migration é executada nesta etapa. O objetivo é preparar homologação com aprovação humana e preservar dados pessoais.

## Próxima etapa recomendada

Criar o conector técnico em modo teste oficial: validação de token, identificação de Pixel/CAPI, test event code, envio apenas em sandbox controlado e recibo observado no ambiente Meta.

## Validação

- `npm run evolution:phase-161:check`
- `npm run typecheck`
- `npm run lint`
