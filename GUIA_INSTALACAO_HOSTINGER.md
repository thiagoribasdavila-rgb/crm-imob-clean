# GUIA DE INSTALAÇÃO — HOSTINGER (pacote de homologação)

Complementa `docs/deploy/RUNBOOK_DEPLOY_HOSTINGER.md` (que continua sendo o
runbook canônico, com o passo 0.5 de auditoria). Este guia é o caminho curto e
o que MUDOU nesta frente.

Requisitos: Node ≥20.9 <21 · PM2 · acesso SSH · domínio com HTTPS.

## 1. Pacote

```bash
unzip atlas-one-homologacao-*.zip -d atlas-one && cd atlas-one
sha256sum -c ../atlas-one-homologacao-*.zip.sha256   # confere integridade
npm ci --omit=dev=false                               # instala exatamente o lockfile
```

## 2. Ambiente

```bash
cp .env.production.example .env
```

Preencher no servidor (NUNCA por commit/ZIP/chat). Além do bloco Supabase/Meta
já documentado no exemplo, o que esta frente acrescentou ou corrigiu:

| Variável | Valor / observação |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | `527541623768288` (número do corretor na WABA "Diego Dutra") |
| `WHATSAPP_ACCESS_TOKEN` | token do System User `ATLAS INTEGRACOES` (o mesmo app dos tokens que funcionam — o antigo era de outro app e não passava no `/me`) |
| `META_AD_ACCOUNT_ID` | `act_893242765778454` DEPOIS de o System User receber acesso (hoje 403 — ver BLOQUEIOS §2). Até lá, manter o atual ciente de que é a conta parada |
| `META_CONVERSIONS_ACCESS_TOKEN` | regerar do System User (BLOQUEIOS §1); até lá deixar como está |
| `ATLAS_META_CAPI_ENABLED` | **vazio/false** até o token certo existir |
| `ATLAS_AI_*_PROVIDER_ORDER` | `perplexity,openai,anthropic` (fast/commercial) e `perplexity,anthropic,openai` (reasoning) |
| `ATLAS_AI_PRICE_TABLE` | linha pronta no exemplo (luna + sonnet + sonar, preços conferidos em 2026-07-27) |
| `ATLAS_TENTATIVAS_MINIMAS` | vazio (=0, decisão do dono); `3` religa o piso de descarte |
| `ATLAS_WHATSAPP_BRIDGE_SECRET` | só se optar pela ponte por QR (`openssl rand -hex 32`); vazio = ponte desligada com recusa explícita |

Validações: `npm run database:target:check` (banco certo) e
`node scripts/check-environment.mjs` se disponível no pacote.

## 3. Migrations (obrigatório)

Aplicar no banco alvo, nesta ordem, se ainda não aplicadas:

1. `supabase/migrations/20260727050000_corrige_move_pipeline_lead.sql` — sem ela o Kanban NÃO MOVE lead (a RPC insere numa coluna que não existe).
2. `supabase/migrations/20260728010000_mapeia_crm_projects_para_developments.sql` — sem ela a lead de formulário com empreendimento é PERDIDA por violação de FK. Idempotente; rollback documentado no próprio arquivo.

## 4. Build e processo

```bash
npm run build          # recusa se houver alteração não commitada
pm2 start ecosystem.config.cjs --only atlas-web   # nome conforme o ecosystem do pacote
pm2 save
```

## 5. Crontab dos workers (obrigatório)

As cadências estão versionadas em `config/workers-schedule.json`. Instalar o
crontab é ETAPA DO DEPLOY — sem ela não rodam outbox (ingestão de leads,
envios), vigias de SLA e recorrências. Seguir a seção correspondente do runbook
canônico; todos os workers autenticam com `ATLAS_CRON_SECRET`.

## 6. Supabase Auth (uma vez, no painel)

Site URL `https://atlasaios.com.br` e Redirect URLs
`https://atlasaios.com.br/auth/callback` + `/**` — sem isso a recuperação de
senha do corretor não fecha.

## 7. Prova de vida

```bash
curl -fsS https://SEU_DOMINIO/api/health
npm run meta:diagnostico    # lê o .env do diretório atual
npm run ia:diagnostico
TESTE_BASE_URL=https://SEU_DOMINIO npm run teste:varredura   # 0 quedas esperado
```

Depois, seguir CHECKLIST_HOMOLOGACAO_REAL.md fase por fase.

## 8. WhatsApp — decisão de caminho

O código suporta DOIS caminhos, mutuamente independentes:

- **Oficial (Cloud API)** — recomendado; bloqueado até o número ser verificado
  (BLOQUEIOS §3). O envio real tem preflight: número não verificado não envia.
- **Ponte por QR (Baileys)** — não oficial, risco de bloqueio do número
  pessoal ACEITO CONSCIENTEMENTE pelo dono. Ativar só se necessário:
  dependências já no lockfile, `ATLAS_WHATSAPP_BRIDGE_SECRET` + URL no `.env`,
  `pm2 start ecosystem.config.cjs --only atlas-whatsapp-bridge`.
