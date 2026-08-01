# Matriz de integrações — auditoria de 2026-07-24

Método: duas auditorias independentes de código (Meta/CAPI e WhatsApp/IA/SMTP), com
arquivo:linha para cada afirmação. Estados: **pronto** (produção), **parcial**,
**ausente**. "Pendência externa" = o que só o dono pode fazer (credencial/cadastro).

| integração | arquivos principais | estado | variáveis | endpoint | teste disponível | pendência externa | risco | ação executada nesta entrega |
|---|---|---|---|---|---|---|---|---|
| **Supabase (auth+db)** | `lib/api/security.ts`, `lib/supabase/admin.ts` | **pronto** | `NEXT_PUBLIC_SUPABASE_URL`, `..._PUBLISHABLE_KEY`/`..._ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` | `/api/ready` | `npm run database:target:check` | escolher o projeto alvo (R-01) e aplicar migrations nele | banco errado no deploy | guarda `database:target:check`; status em `/api/ready` |
| **Meta Lead Ads (webhook)** | `app/api/webhooks/meta/route.ts`, `lib/security/webhook-signature.ts` | **pronto** | `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_LEAD_ACCESS_TOKEN` | `/api/webhooks/meta` | `webhook-test` (ensaio real com dupla entrega) | assinar campo `leadgen` no painel; popular `meta_lead_sources`; RPC `consume_api_rate_limit` no banco | lead `unmapped` sem o mapa de fontes | doc de cadastro com URL e verify token |
| **Meta CAPI (teste)** | `lib/meta/conversions.ts`, worker | **pronto** | `META_CONVERSIONS_ACCESS_TOKEN` (+config no banco) | via outbox | `conversion-test` | `test_event_code` no Events Manager | — | — |
| **Meta CAPI (produção)** | `lib/integrations/meta/capi-feedback.ts`, `capi-export` | **parcial** | + `ATLAS_META_CAPI_ENABLED`, `META_CAPI_DATASET_ID` | `GET/POST /api/v1/integrations/meta/capi-export` | dry-run no GET | decisão de ligar a flag após dry-run | sem `fbp/fbc` (não há Pixel); `Purchase` sem valor de venda; sem `test_event_code` no sender | limitações documentadas sem maquiagem |
| **WhatsApp (receber)** | `app/api/webhooks/whatsapp/route.ts` | **pronto** | `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` | `/api/webhooks/whatsapp` | mensagem real | assinar campo `messages`; linha em `integrations` por Phone Number ID | conversa órfã (corrigido) | **match de lead por telefone no inbound** |
| **WhatsApp (enviar)** | worker outbox, `messages/send` | **pronto com ressalvas** | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | fila `message.send` | ensaio na tela de integrações | preencher Phone Number ID (hoje vazio); template aprovado; **cron do worker** | janela 24h (corrigido); rate limit Meta (corrigido); template com variáveis não suportado | **janela de 24h implementada; rate limit sem queimar tentativa; chave de supressão unificada** |
| **E-mail (canal CRM)** | `messages/send` | **ausente** | — | — | — | decisão de produto (implementar canal ou manter rascunho/mailto) | mensagem presa em "queued" (corrigido) | **recusa honesta 501 na porta** |
| **E-mail (auth: recuperação/convite)** | `password-recovery`, `team` route | **pronto** | via Supabase Auth | `/api/auth/password-recovery` | fluxo real | SMTP no painel Supabase | — | documentado no `.env.production.example` |
| **OpenAI** | `lib/ai/provider-router.ts:346` | **pronto** | `OPENAI_API_KEY`, `ATLAS_AI_*` | `/api/ai/openai-test` | sim (diretoria) | chave | — | status em `/api/ready` |
| **Anthropic** | `provider-router.ts:489` | **pronto no adapter; fora da rota** | `ANTHROPIC_API_KEY`, `ATLAS_ANTHROPIC_MODEL` | — (sem rota de teste própria) | `/api/ai/status` | **incluir `anthropic` nas `ATLAS_AI_*_PROVIDER_ORDER`** | chave paga sem uso | pendência apontada no doc de webhooks §5 |
| **Perplexity** | `provider-router.ts:425` | **pronto** | `PERPLEXITY_API_KEY` | `/api/ai/perplexity-test` | sim | chave | — | status em `/api/ready` |
| **Econômicos (deepseek/qwen/kimi/glm)** | `provider-router.ts:535` | **pronto** | `*_API_KEY`, `ATLAS_*_MODEL` | `/api/ai/provider-test` | sim | chaves | — | — |
| **Custo de IA** | `provider-router.ts:140-197` | **parcial** | `ATLAS_AI_PRICE_TABLE` | painel `/api/ai/status` | — | preencher a tabela de preços | painel mostra US$ 0,00 com tabela vazia | pendência apontada |
| **Calendar (Google/Microsoft)** | rotas `calendar/*` | **parcial (OAuth pendente)** | `GOOGLE_CALENDAR_*`, `MICROSOFT_CALENDAR_*` | callbacks em `/api/v1/calendar/*/callback` | — | criar apps OAuth e redirect URIs | — | redirect URIs no `.env.production.example` |
| **Storage S3/R2 (materiais)** | catálogo de storage | **pronto (opcional)** | `ATLAS_OBJECT_STORAGE_*` | — | — | credenciais se optar por S3/R2 | — | — |
| **Workers (fila inteira)** | `scripts/run-workers.mjs`, 14 rotas worker | **pronto; agendamento VERSIONADO em `config/workers-schedule.json`** | `ATLAS_CRON_SECRET`, `ATLAS_BASE_URL` | `/api/v2/outbox/process` etc. | manual com Bearer | `npm run workers:crontab` gera as linhas; instalar no VPS | fila parada enquanto o cron não for instalado | instalar o crontab gerado |

## Gaps de código que ficaram (com motivo)

| gap | por que não entrou nesta entrega |
|---|---|
| Template com variáveis (`components`) | mexe no contrato de envio usado pelo ensaio oficial; exige teste com template real aprovado |
| Sincronização de `message_templates` com a Graph | polling/gestão de estado novo — funcionalidade, não correção |
| Precedência de status (sent após read) | inócuo para operação (statuses chegam em ordem na prática); registrado |
| 9º dígito BR na normalização | mudar normalização global arrisca duplicar threads existentes; precisa migração de dados junto |
| Rota `anthropic-test` | segue o padrão das outras; pequena, mas o bloqueio real é a ordem de provedores (config) |
