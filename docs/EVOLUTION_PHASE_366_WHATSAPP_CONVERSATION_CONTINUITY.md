# ATLAS ONE — Fase 366 · Continuidade e titularidade das conversas

## Objetivo

Medir se as conversas oficiais do WhatsApp permanecem vinculadas à lead e ao
mesmo responsável comercial, além de identificar paralisação, pendências de
leitura e fragmentação de histórico sem expor dados pessoais.

## Entrega

- correspondência entre responsável da conversa e responsável da lead;
- conversas órfãs, sem responsável ou com lead ausente;
- atividade nos últimos 7 dias e paralisação superior a 30 dias;
- conversas abertas e não lidas;
- leads com múltiplas conversas e conversas excedentes;
- limite observado e aviso explícito quando a leitura for truncada;
- painel factual exclusivo da diretoria.

## Regras operacionais

A medição é somente leitura. Divergências são apresentadas para revisão humana:
esta fase não redistribui leads, não troca responsáveis, não envia mensagens e
não chama a Meta. A idade usa `last_message_at` e, quando esse campo não existe,
usa `created_at` como evidência substituta.

## Arquivos alterados

- `lib/analytics/whatsapp-conversation-continuity.ts`
- `app/api/v1/integrations/whatsapp/continuity/route.ts`
- `app/(crm)/integrations/whatsapp/page.tsx`
- `tests/contracts/whatsapp-conversation-continuity.test.mjs`
- `config/evolution-phase-366-whatsapp-conversation-continuity.json`
- `package.json`

## Segurança e isolamento

O endpoint exige diretoria, filtra conversas e leads pela organização da sessão
e seleciona somente identificadores internos e metadados operacionais. A saída
é agregada e não contém nome, telefone, remetente, destinatário ou conteúdo.

## Estado

`implemented_local / authenticated_runtime_proof_pending`

Nenhum dado remoto, distribuição, mensagem, build, ZIP ou deploy foi alterado.
Para promoção ainda é necessária prova autenticada com dados reais.

## Próxima fase

A Fase 367 deve medir qualidade de captura das mensagens para aprendizado,
separando evidência estrutural de conteúdo autorizado e utilizável pela IA.
