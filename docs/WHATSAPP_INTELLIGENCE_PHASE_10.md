# WhatsApp Intelligence (entrada) — Fase 10

## Objetivo

Transformar a **resposta do cliente** no WhatsApp em inteligência comercial: intenção, objeções, resumo e próxima ação — surgindo na timeline do lead para o corretor agir. Complementa (não substitui) a detecção determinística de atrito que já existia (`assessCustomerExperience` → `lead_experience_signals`).

## Como funciona

1. O webhook `app/api/webhooks/whatsapp` já persiste a mensagem de entrada e a conversa (com `lead_id`). Quando `ATLAS_WHATSAPP_NLU_ENABLED=true` e a mensagem está ligada a um lead, ele **enfileira** um job de outbox `whatsapp.inbound.analyze` (best-effort — nunca derruba o webhook).
2. O worker (`app/api/v2/outbox/process`) processa o job: monta o contexto das últimas mensagens da conversa e chama `analyzeInboundWhatsApp` (`lib/ai/whatsapp-conversation-intelligence.ts`).
3. A análise é feita por LLM via `generateAIText` com `containsPersonalData: true` → **rota OpenAI-only**, respeitando a governança de dados pessoais. Se a IA falhar, há **fallback determinístico** por palavras-chave (a IA nunca é ponto único de falha).
4. O resultado é gravado em `whatsapp_message_insights` (idempotente por `message_id`) e, para leads, gera uma `activities` do tipo `whatsapp_insight` (intenção, temperatura, resumo, próxima ação e objeções) — visível ao corretor.

## Custo é opt-in

Desligado por padrão (`ATLAS_WHATSAPP_NLU_ENABLED=false`). Sem a flag, **nenhum job é enfileirado e nenhum custo de LLM é gerado**. Para ligar: aplicar a migration `20260720020000_whatsapp_conversation_intelligence.sql` e setar a env como `true`.

## Saída estruturada

- `intent`: interesse_alto · duvida · negociacao · agendamento · desinteresse · suporte · outro
- `objection_keys`: preco · localizacao · prazo_entrega · financiamento · tamanho · concorrencia · indeciso
- `recommended_action_key`: responder_agora · ligar · enviar_material · agendar_visita · apresentar_projeto · envolver_gerente · aguardar
- `temperature_signal`: frio · morno · quente
- `source`: `ai` ou `fallback`; `model` do provedor usado.

## Segurança / não-quebra

Aditivo: o fluxo existente (opt-out, status, jornada noturna, atrito) permanece inalterado. A tabela nova tem RLS org-scoped. A gravação é best-effort no worker (padrão outbox com DLQ).
