# CHECKLIST DE VARIÁVEIS — HOSTINGER

**2026-07-31.** `.env.production.example` declara **73** variáveis. Este
checklist separa as que **impedem o sistema de subir** das que apenas desligam
uma função — porque tratar as 73 como igualmente urgentes faz ninguém
preencher nenhuma.

> **Nenhum valor real aparece aqui nem no pacote.** Só nomes.

## BLOQUEIA A SUBIDA — sem estas, a aplicação sobe e não fala com nada

| variável | o que quebra sem ela |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | tudo. `/api/v1/ready` responde **503** nomeando esta |
| `SUPABASE_SERVICE_ROLE_KEY` | idem — **nunca** vai para o frontend |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | login não funciona |

**Confira antes de tudo:**

```bash
curl -s https://SEU-DOMINIO/api/v1/ready | head -c 300
```

Se vier `"estado":"banco_fora"`, a resposta **lista exatamente** o que falta.

## BLOQUEIA A AUTOMAÇÃO

| variável | o que quebra sem ela |
|---|---|
| `ATLAS_CRON_SECRET` | os **19 workers** recusam toda chamada (401). Falha fechada, de propósito |

## BLOQUEIA UMA INTEGRAÇÃO ESPECÍFICA — o resto do CRM funciona

| variável | desliga |
|---|---|
| `META_APP_SECRET` | webhook da Meta responde 401 e nenhuma lead entra |
| `META_ADS_ACCESS_TOKEN` · `META_AD_ACCOUNT_ID` | importação de investimento |
| `ATLAS_META_CAPI_ENABLED` | devolução de conversão à Meta |
| `TELEGRAM_BOT_TOKEN` | alerta de SLA por Telegram (a tarefa no CRM continua) |

## O ERRO QUE JÁ CUSTOU CARO

> **NUNCA copie o `.env` da máquina de desenvolvimento.**

Houve um runbook mandando copiar `.env.hostinger` inteiro. Aquele arquivo tinha
`META_APP_SECRET` com **9 caracteres** (placeholder). Provado à época assinando o
mesmo payload contra produção:

| segredo usado | resposta |
|---|---|
| placeholder de 9 chars | **HTTP 401** `invalid_signature` |
| segredo real de 32 chars | **HTTP 200** |

Seguir a instrução errada derruba a integração da Meta sem nenhum aviso.

## VERIFICADOR

```bash
bash scripts/validate-env-hostinger.sh
```
