# Webhooks e integrações — cadastro externo para produção

Tudo aqui usa variáveis de ambiente. **Nenhum ID ou token está neste documento de
propósito** — os valores moram só no `.env` do servidor.

Domínio de produção: `https://atlasaios.com.br` (o valor real vem de `ATLAS_BASE_URL`).

---

## 1. Meta Lead Ads (webhook de leadgen)

### URL a cadastrar no painel Meta (App → Webhooks → Page)

```
https://atlasaios.com.br/api/webhooks/meta
```

| campo no painel | valor |
|---|---|
| Callback URL | a URL acima |
| Verify token | o valor que você definir em `META_WEBHOOK_VERIFY_TOKEN` |
| Campo assinado | **`leadgen`** (é o único que a rota processa; outros são ignorados) |

### Como a rota se comporta (já implementado e auditado)

- `GET` responde ao desafio `hub.challenge` quando o `hub.verify_token` confere.
- `POST` valida `X-Hub-Signature-256` (HMAC-SHA256 com `META_APP_SECRET`, comparação
  timing-safe). Assinatura errada → 401.
- Evento duplicado não duplica lead (unique em `external_lead_id` + autocura do outbox).
- O dado completo do lead é buscado na Graph API (`META_LEAD_ACCESS_TOKEN`) pela fila,
  com retry, backoff e dead-letter; token expirado **não** consome tentativas.
- Campanha/adset/ad/form/page ficam gravados no evento e no lead (`leads.campaign_id`).

### Pré-requisitos SEM os quais o lead não entra

1. **Linhas em `meta_lead_sources`** ligando `page_id`/`form_id` → organização → dono
   padrão. Sem esse mapa, o evento é registrado como `unmapped` (só log) e **não vira lead**.
2. **RPC `consume_api_rate_limit` no banco alvo** — sem ela o `POST` responde 503 *antes*
   de checar assinatura (comportamento fail-closed, documentado na auditoria).
3. **Cron do worker** (ver seção 4).

### Teste de ponta a ponta sem esperar lead real

`Configurações → Integrações → Meta` na aplicação, ou:

```
POST https://atlasaios.com.br/api/v1/integrations/meta/webhook-test   (diretoria)
```

O ensaio assina um payload sintético com o `META_APP_SECRET` real, entrega **duas vezes**
(prova a deduplicação), roda o worker e confere a atribuição.

### Troca de token sem tocar em código

Os três tokens são independentes e trocáveis a quente no `.env` + restart do PM2:
`META_LEAD_ACCESS_TOKEN` (leitura de leads), `META_ADS_ACCESS_TOKEN` (insights/campanhas),
`META_CONVERSIONS_ACCESS_TOKEN` (CAPI). Erro 190/463 aparece no log com `fbtrace_id` e a
fila espera sem queimar tentativas até o token novo entrar.

---

## 2. Meta CAPI (conversões)

**Estado honesto:** o caminho de teste está completo (hash SHA-256, `event_id`
determinístico, `external_id`, `test_event_code`, gate de consentimento) e é exercitável
por `conversion-test` na tela de integrações. O caminho de produção existe atrás de
`ATLAS_META_CAPI_ENABLED=true` + `META_CONVERSIONS_ACCESS_TOKEN` + `META_CAPI_DATASET_ID`,
com dry-run em `GET /api/v1/integrations/meta/capi-export` (diretoria).

**Limitações conhecidas, por decisão de não maquiar:** sem Pixel client-side não há
`fbp`/`fbc` (a correspondência usa `em`/`ph`/`external_id`); `Purchase` com valor depende
de coluna de valor de venda que ainda não existe; e o modo produção do caminho de teste é
travado por CHECK no banco. Ligar CAPI de produção é decisão explícita, após dry-run.

---

## 3. WhatsApp Cloud API

### URL a cadastrar no painel Meta (App → WhatsApp → Configuration)

```
https://atlasaios.com.br/api/webhooks/whatsapp
```

| campo no painel | valor |
|---|---|
| Callback URL | a URL acima |
| Verify token | **o mesmo `META_WEBHOOK_VERIFY_TOKEN`** (não existe `WHATSAPP_VERIFY_TOKEN` — o código usa as variáveis `META_*` de propósito) |
| Campos assinados | `messages` (mensagens e statuses chegam por ele) |

### Onde cadastrar os identificadores

| o quê | onde |
|---|---|
| Phone Number ID | `WHATSAPP_PHONE_NUMBER_ID` no `.env` **e** uma linha em `integrations` com `external_account_id` = esse ID apontando para a organização (é assim que o webhook roteia multi-tenant) |
| Token | `WHATSAPP_ACCESS_TOKEN` |
| Template da abordagem noturna | `WHATSAPP_NIGHTLY_APPROACH_TEMPLATE` (nome exato do template aprovado) |

### O que já está garantido pela rota (auditado)

Assinatura HMAC fail-closed · idempotência por índice único · opt-out imediato
("SAIR"/"PARE") com supressão verificada antes de todo envio · statuses
enviado/entregue/lido/falhou gravados · pausa automática de lote com falha ≥10% ·
aprovação humana obrigatória antes de qualquer envio · **janela de 24h respeitada**
(texto livre fora da janela é recusado antes de ir à Meta, com instrução de usar
template) · conversa de entrada ligada à lead por telefone quando o número bate.

### Como testar

1. Recebimento: envie uma mensagem real para o número conectado → deve aparecer em
   `Conversas`, e na timeline da lead se o telefone bater.
2. Envio: `Configurações → Integrações → WhatsApp` tem o ensaio com template
   (exige `WHATSAPP_TEST_RECIPIENT` no `.env` para o destinatário de teste).
3. Status: após o envio, o webhook atualiza para entregue/lido sozinho.

### Números adicionais no futuro

O roteamento já é multi-tenant por `external_account_id`: número novo = nova linha em
`integrations` + credencial. A limitação atual é **um** `WHATSAPP_PHONE_NUMBER_ID` de
envio por ambiente (o recebimento já aceita vários).

---

## 4. O cron que faz tudo andar (OBRIGATÓRIO)

Toda saída (WhatsApp, busca de lead Meta, conversões) passa pela fila. **Sem o cron, a
fila para** — o webhook recebe, mas nada é processado. No VPS:

```cron
* * * * * cd /caminho/da/aplicacao && node scripts/run-workers.mjs >> logs/workers.log 2>&1
```

O script chama os workers autenticando com `ATLAS_CRON_SECRET`. Confirme no primeiro dia:
`grep worker_completed logs/workers.log`.

---

## 5. IA (OpenAI, Anthropic, Perplexity, econômicos)

Chaves só no backend (`server-only`; zero `NEXT_PUBLIC_`). Sem chave, o provedor sai da
rota e o fallback responde — o CRM não cai. Modelos por variável (`ATLAS_AI_*_MODEL*`).

**Duas pendências de configuração que valem dinheiro:**
- `anthropic` não está em nenhuma `ATLAS_AI_*_PROVIDER_ORDER` — a chave configurada nunca
  é usada até entrar na ordem (ex.: `ATLAS_AI_REASONING_PROVIDER_ORDER=anthropic,openai,...`).
- `ATLAS_AI_PRICE_TABLE` vazia faz todo custo aparecer como US$ 0,00 no painel. Preencha
  com o JSON de preços por `provedor/modelo`.

## 6. E-mail (recuperação de senha, convites)

Sai pelo **SMTP do Supabase Auth** — configure em *Authentication → SMTP* no painel do
projeto Supabase. Não existem variáveis `SMTP_*` na aplicação, de propósito. Os links de
e-mail usam `ATLAS_BASE_URL`, então apontam para `atlasaios.com.br` automaticamente.
O endpoint de recuperação tem rate limit (5/15min) e resposta neutra (não revela se o
e-mail existe).
