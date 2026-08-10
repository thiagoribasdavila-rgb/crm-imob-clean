# Fase 367 — Qualidade da captura do WhatsApp para IA

## Objetivo

Medir, sem abrir o conteúdo das conversas, se as mensagens do WhatsApp possuem estrutura suficiente para alimentar a memória comercial do Atlas com eventos canônicos e se existe autorização específica para uso de conteúdo bruto pela IA.

## Entrega

- diagnóstico agregado e somente leitura para `admin` e `director`;
- isolamento explícito por organização e canal WhatsApp;
- cobertura de direção, data, conversa e vínculo com lead;
- rastreabilidade por identificador externo;
- cobertura da memória canônica em `lead_behavior_events`;
- leitura da configuração operacional de gravação das linhas;
- fronteira explícita: gravar conversa não autoriza usar o texto para aprendizado;
- interface na Central WhatsApp sem conteúdo, telefone, remetente, destinatário, mídia ou IDs.

## Regra segura

O modo de aprendizado permanece `structured_only`. A autorização de conteúdo bruto fica como `not_proven` até existir evidência específica, auditável e separada do consentimento de contato ou da configuração de gravação.

## Arquivos principais

- `lib/analytics/whatsapp-learning-capture-quality.ts`
- `app/api/v1/integrations/whatsapp/learning-capture-quality/route.ts`
- `app/(crm)/integrations/whatsapp/page.tsx`
- `tests/contracts/whatsapp-learning-capture-quality.test.mjs`
- `config/evolution-phase-367-whatsapp-learning-capture-quality.json`

## Banco e operação

Não há migration nesta fase. O endpoint lê apenas metadados mínimos de `messages`, vínculos de `conversations`, eventos de `lead_behavior_events` e configuração das integrações WhatsApp. Nenhum estado remoto é alterado.

## Validação

- contrato da Fase 367: **5/5 aprovado**;
- regressão das Fases 365 e 366: **10/10 aprovada**;
- typecheck: **aprovado**;
- lint: **aprovado, zero warnings**;
- varredura de segredos: **4.408 arquivos, zero credenciais**;
- governança de segredos: **aprovada**;
- segurança de APIs: **171 rotas classificadas e aprovadas**;
- auditoria de segurança: **9 gates aprovados**.

Build, ZIP e deploy não foram executados nesta fase incremental.

## Próxima fase sugerida

A Fase 368 deve medir a completude do contexto comercial estruturado usado pela IA — projeto, etapa, responsável e próxima ação — sem consultar texto bruto e sem inferir autorização inexistente.
