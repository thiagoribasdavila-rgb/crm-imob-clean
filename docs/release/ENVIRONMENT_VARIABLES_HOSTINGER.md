# VARIÁVEIS DE AMBIENTE — HOSTINGER NODE.JS APP

**Onde cadastrar:** hPanel → sua aplicação Node.js → **Environment Variables**.

> **Nenhum valor aparece neste documento** — só nomes, finalidade e onde obter.

## ⛔ A ORDEM QUE IMPORTA

**1) cadastrar as variáveis → 2) subir o ZIP → 3) disparar o build.**

Inverter reproduz o incidente de 31/07: as variáveis `NEXT_PUBLIC_*` são
**gravadas no JavaScript do navegador durante o build**. Cadastrar depois e
reiniciar **não funciona** — é preciso construir de novo.

---

## GRUPO A — SEM ESTAS, O BUILD FALHA (exit 1)

| variável | finalidade | onde obter |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | endereço do Supabase **no navegador**; sem ela a tela de login não tem para onde autenticar | Supabase → Settings → API → **Project URL** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | credencial pública do cliente; respeita RLS | Supabase → API → **anon / public** |

O projeto também aceita `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` como nome
alternativo da segunda (o Supabase renomeou). **Basta uma das duas.**

## GRUPO B — SEM ESTA, O SERVIDOR NÃO ALCANÇA O BANCO

| variável | finalidade | onde obter |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | acesso administrativo **server-side**: rotas de API, workers, RLS bypass | Supabase → API → **service_role** |

> ⚠️ **NUNCA** com prefixo `NEXT_PUBLIC_`. Ela ignora RLS — no navegador seria
> acesso total ao banco para qualquer visitante. Verificado no build atual:
> **0 arquivos** do bundle a contêm.

## GRUPO C — SEM ESTA, OS 19 WORKERS RECUSAM TUDO

| variável | finalidade | como gerar |
|---|---|---|
| `ATLAS_CRON_SECRET` | autentica as rotas de worker; falha **fechada** (401) | `openssl rand -hex 32` |

## GRUPO D — IDENTIDADE E AMBIENTE

| variável | valor | finalidade |
|---|---|---|
| `NODE_ENV` | `production` | modo de produção |
| `ATLAS_BUILD_COMMIT` | `41ebf2fc` | **sem ela ninguém sabe qual versão está no ar**; aparece em `/api/version` |
| `NEXT_PUBLIC_APP_URL` | `https://atlasaios.com.br` | montagem de links absolutos no cliente |
| `ATLAS_BASE_URL` | `https://atlasaios.com.br` | chamadas internas server-side |

## GRUPO E — INTEGRAÇÕES OPCIONAIS

Cada uma desliga **só a sua** integração e falha fechada por conta própria.
**Nenhuma bloqueia o deploy.**

| variável | desliga o quê |
|---|---|
| `META_APP_SECRET` | webhook da Meta responde 401 — nenhuma lead entra |
| `META_ADS_ACCESS_TOKEN` · `META_AD_ACCOUNT_ID` | importação de investimento (R$/campanha/dia) |
| `META_LEAD_ACCESS_TOKEN` | leitura de formulários de lead |
| `META_GRAPH_API_VERSION` | usa o padrão do código |
| `ATLAS_META_CAPI_ENABLED` | devolução de conversões à Meta |
| `WHATSAPP_ACCESS_TOKEN` · `WHATSAPP_PHONE_NUMBER_ID` | envio por WhatsApp |
| `OPENAI_API_KEY` · `ANTHROPIC_API_KEY` · `PERPLEXITY_API_KEY` | provedores de IA |
| `TELEGRAM_BOT_TOKEN` | alerta de SLA por Telegram (a tarefa no CRM continua) |

## O ERRO QUE JÁ CUSTOU CARO

> **NUNCA copie o `.env` da máquina de desenvolvimento.**

Um runbook antigo mandava copiar `.env.hostinger` inteiro. Aquele arquivo tinha
`META_APP_SECRET` com **9 caracteres** (placeholder). Provado assinando o mesmo
payload contra produção:

| segredo usado | resposta |
|---|---|
| placeholder de 9 chars | **HTTP 401** `invalid_signature` |
| segredo real de 32 chars | **HTTP 200** |

## COMO CONFERIR SEM EXPOR VALOR

```bash
node scripts/validate-production-env.mjs
```

Imprime apenas `NOME = PRESENT | MISSING | INVALID`. Sai com **1** se faltar
variável crítica.
