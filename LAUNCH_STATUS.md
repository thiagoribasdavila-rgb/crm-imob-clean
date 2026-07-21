> ## ⚠️ DESATUALIZADO — NÃO SEGUIR: o caminho vigente é [docs/deploy/RUNBOOK_HOMOLOG_ESPELHO.md](docs/deploy/RUNBOOK_HOMOLOG_ESPELHO.md)
>
> Este status é histórico e otimista demais: o banco vivo tem só 23 tabelas contra ~128 migrations no repo (drift conhecido; o repo NÃO reconstrói o banco). **Não rode `supabase db push` na produção** — dispararia ~128 migrations num banco vivo. O deploy vigente é homologação espelho (dump da prod, prod intocada).

# ATLAS AI OS V3 — STATUS DE LANÇAMENTO

**Data:** Jul 19, 2026 | **Versão:** 3.0.0-rc.2 | **Status:** ⚠️ HISTÓRICO — NÃO estava pronto para produção (ver banner acima)

---

## 📊 VISÃO GERAL

| Componente | Status | Detalhes |
|---|---|---|
| **Código** | ✅ 100% | tsc 0 erros · eslint 0 warnings · build OK |
| **Funcionalidades** | ✅ 100% | CRM · RBAC · IA multi-modelo · portais · WhatsApp intelligence |
| **Infraestrutura** | ✅ 100% | VPS KVM2 · Node 20 LTS · PM2 · Nginx · SSL Let's Encrypt |
| **DNS** | ✅ 100% | atlasaios.com.br → 85.209.93.32 · propagado globalmente |
| **Supabase** | ⚠️ DRIFT | Afirmação original ("95%, 4 pendentes") incorreta: banco vivo com 23 tabelas vs ~128 migrations no repo — ver docs/deploy/RUNBOOK_HOMOLOG_ESPELHO.md |
| **Deploy** | 🟡 BLOQUEADO | Aguardando: .env.hostinger preenchido + script executado |

---

## 🚀 TIMELINE ATÉ GO-LIVE

```
AGORA (seu Mac)
├─ 3 min  → Preencher .env.hostinger
├─ 15 min → Executar atlas-go-live.sh (Node 20 + build + PM2 + Nginx + SSL)
├─ 10 min → Aplicar migrations Supabase + SMTP + proteção de senha
└─ 5 min  → Primeiro login + criar equipe

TOTAL: ~45 min → https://atlasaios.com.br OPERACIONAL
```

---

## 📈 PRIORIDADES IMPLEMENTADAS

### Fase 1: Core CRM (✅ Pronto)
- [x] Pipeline do lead (funil visual, stages customizáveis)
- [x] Timeline 360 (histórico completo do cliente)
- [x] Empreendimentos (catálogo com book, fotos, estoque)
- [x] Tasks + SLAs (automáticas por stage)
- [x] Distribuição de leads (explicável, load-balancer)
- [x] Busca inteligente (full-text + embeddings)

### Fase 2: Inteligência (✅ Pronto)
- [x] Lead Scoring (prob de conversão, calibração por stage)
- [x] Smart Reply (sugestões de resposta Claude/OpenAI)
- [x] Next Action (recomendação automática: call, SMS, email, WhatsApp)
- [x] Explicação de IA (por que esse score, essa ação)
- [x] Provider router (OpenAI, Claude, DeepSeek, Qwen, Kimi, GLM)
- [x] Governança (dados pessoais → OpenAI only)

### Fase 3: Operações (✅ Pronto)
- [x] RBAC Enterprise (7 roles: admin, diretor, gerente, corretor, incorporadora, IA agent, etc)
- [x] Auditoria (quem fez o quê, quando)
- [x] Permissões granulares (39 permissões por role)
- [x] Organização multi-tenant (RLS em ~150 tabelas)
- [x] Workers/cron (outbox, nightly sales, task recurrence, task reminders)

### Fase 4: Integrações (✅ Código pronto, ⏳ Externas depois)
- [x] Meta Ads (lead ingestion) — código pronto, ativa via Meta API
- [x] WhatsApp Cloud (inbound/outbound) — código pronto, ativa via WhatsApp API
- [x] Portal imobiliários (ZAP, Viva Real, OLX) — código pronto, ativa via webhook
- [x] Google/Outlook Calendar — código pronto, ativa via OAuth
- [x] Observability (Supabase logs, PM2 monit)

### Fase 5: IA Estratégica (✅ Código pronto, ⏳ Ativa após go-live)
- [x] Claude integration (Anthropic API, Messages endpoint)
- [x] Multi-modelo orchestration (cost/speed/quality tradeoff)
- [x] Conversion calibration loop (IA aprende de outcomes)
- [x] Nightly report (IA gera resumo de vendas do dia)
- [x] Command Center (IA orquestra corretores)

---

## 🎯 O QUE FOI DECLARADO PRONTO À ÉPOCA (⚠️ não conferido contra o estado real — ver banner)

### Backend
- Node.js 20 LTS + Next.js 16.2
- Prisma 7.8 ORM + Supabase PostgreSQL 17
- API REST (v1, v2) + RLS multi-tenant
- Outbox + DLQ pattern (confiabilidade)
- Workers via PM2 + crontab
- Observability: logs estruturados + advisors

### Frontend
- React 19.2 + TypeScript
- Responsive design (mobile, tablet, desktop)
- Dark mode
- Real-time via PostgREST + WebSocket (próximo)
- Integração com IA (side panels, suggestions)

### Infraestrutura
- Hostinger VPS KVM2 (Node.js deployment)
- Nginx reverse proxy + SSL Let's Encrypt
- PM2 auto-restart + auto-startup
- Firewall UFW (SSH, HTTP, HTTPS)
- Supabase managed (backups, RLS, auth)

### Segurança
- RLS + ORM validation (SQL injection zero)
- RBAC granular (39 permissões)
- Audit log (todas as ações registradas)
- PII governance (dados pessoais → OpenAI only)
- Password security (PBKDF2 + HaveIBeenPwned)
- API rate limiting (próximo)

### IA
- OpenAI (obrigatória, default)
- Claude (Anthropic, recomendado para commercial)
- Economy providers (DeepSeek, Qwen, Kimi, GLM — cost optimization)
- Governança de dados (PII blocking)
- Telemetria (uso, custo, provider choice)

---

## ⏳ O QUE FALTA (bloqueadores de go-live)

| Item | Bloqueador? | Quem? | Ação |
|---|---|---|---|
| .env.hostinger preenchido | 🔴 SIM | Você | Preencher 7 credenciais (Supabase/IA) |
| `atlas-go-live.sh` executado | 🔴 SIM | Você | Rodar SSH, aguardar ✅ |
| ~~4 migrations aplicadas~~ | 🔴 SIM | Você | ~~`supabase db push`~~ ⚠️ NÃO fazer — dispararia ~128 migrations no banco vivo; ver runbook |
| SMTP Hostinger | 🔴 SIM | Você | Configurar no Supabase Auth |
| Proteção de senha | 🟡 SIM | Você | 1 clique (Supabase) |
| Primeiro admin criado | 🔴 SIM | Você | Sign up + confirmar e-mail |
| BOOTSTRAP removido | 🔴 SIM | Você | Apagar do .env + `pm2 restart` |

---

## 📋 CHECKLIST DE LANÇAMENTO (45 min seu tempo)

```bash
# 15 min: Você
nano ~/atlas-v3/.env.hostinger
# preencha 7 campos + salve

# 15 min: Automático (você dispara)
scp ~/atlas-v3/scripts/atlas-go-live.sh ~/atlas-v3/.env.hostinger root@85.209.93.32:/tmp/
ssh root@85.209.93.32 'cp /tmp/.env.hostinger /var/www/atlas/.env && bash /tmp/atlas-go-live.sh'
# (aguarde ✅ GO-LIVE CONCLUÍDO)

# 10 min: Você (navegador + CLI)
# ⚠️ NÃO EXECUTAR os 3 comandos abaixo — db push no banco vivo dispararia ~128 migrations.
# Caminho vigente: docs/deploy/RUNBOOK_HOMOLOG_ESPELHO.md
# cd ~/atlas-v3
# supabase link --project-ref ietwopslgqxlenfyghqk
# supabase db push
# (Supabase dashboard: SMTP + proteção de senha)

# 3 min: Você (navegador)
# https://atlasaios.com.br/login → sign up → confirmar e-mail

# 2 min: Você (SSH)
ssh atlas@85.209.93.32
nano /var/www/atlas/.env
# (apague ATLAS_BOOTSTRAP_SECRET)
pm2 restart atlas-v3-homolog

# 3 min: Você (navegador)
# Dashboard → Settings → Team → Add diretor, gerente, corretor

# 5 min: Você (browser)
# Testar CRM: leads, timeline, empreendimentos, tasks, IA
```

---

## 🎓 PRÓXIMAS FASES (após go-live)

### Semana 1: Validação de base
1. **Loop de aprendizado de IA** — calibração de conversão (IA melhora automaticamente)
2. **Observabilidade** — dashboards de latência, erros, uso (Supabase + Vercel)
3. **Teste de carga** — 10 corretores simultâneos
4. **Backup/recovery** — simular falha, restaurar
5. **Documentação** — guias de uso para equipe comercial

### Semana 2: Integrações externas
1. **Meta Ads** — conectar Lead Ads, validar conversion tracking
2. **WhatsApp Cloud** — conectar número oficial, testar inbound/outbound
3. **Google Calendar** — OAuth, sincronização de agenda
4. **Portais imobiliários** — testar webhook de ZAP, Viva Real

### Semana 3–4: Otimizações
1. **SaaS multi-tenant** — planos de preço, billing (Stripe)
2. **CI/CD** — staging → prod automático, testes E2E
3. **Performance** — caching, indexação, observabilidade
4. **Cutover para produção** — novo Supabase limpo, `ATLAS_ENV=production`

---

## ⚠️ Documento histórico — o caminho vigente é docs/deploy/RUNBOOK_HOMOLOG_ESPELHO.md

A afirmação de "45 minutos do go-live" estava incorreta: existe drift de schema (23 tabelas no banco vivo vs ~128 migrations no repo) e o repo não reconstrói o banco. Não execute os comandos de `GO-LIVE.md`.
