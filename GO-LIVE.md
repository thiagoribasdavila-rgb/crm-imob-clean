> ## ⚠️ DESATUALIZADO — NÃO SEGUIR: o caminho vigente é [docs/deploy/RUNBOOK_HOMOLOG_ESPELHO.md](docs/deploy/RUNBOOK_HOMOLOG_ESPELHO.md)
>
> Este documento está preservado apenas como histórico. Em especial, **NÃO rode `supabase db push` contra o projeto de produção**: o repo acumula ~128 migrations e o banco vivo tem só 23 tabelas com drift conhecido — o push dispararia todas as migrations num banco que o repo NÃO reconstrói, com risco real de quebra. O deploy vigente usa homologação espelho (dump da prod, prod intocada).

# 🚀 ATLAS AI OS V3 — GO-LIVE RÁPIDO

**Você está aqui:** documento histórico — o estado real e o caminho de deploy estão no runbook acima.

---

## ⚡ 3 COMANDOS — É SÓ ISTO

### 1️⃣ Preencher credenciais (seu Mac — 3 min)
```bash
nano ~/atlas-v3/.env.hostinger
```
Preencha estes campos vazios:
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Supabase → Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` → Supabase → Settings → API  
- `DATABASE_URL` → Supabase → Settings → Database → Connection Pooler (escolha us-west-2, TCP)
- `ATLAS_CRON_SECRET` → rode: `openssl rand -base64 32`
- `ATLAS_BOOTSTRAP_SECRET` → rode de novo: `openssl rand -base64 32`
- `OPENAI_API_KEY` → OpenAI API Keys
- `ANTHROPIC_API_KEY` → Anthropic Console (opcional mas recomendado)

**Salve:** Ctrl+O, Enter, Ctrl+X

---

### 2️⃣ Deploy automático (SSH — 15 min)
```bash
scp ~/atlas-v3/scripts/atlas-go-live.sh ~/atlas-v3/.env.hostinger root@85.209.93.32:/tmp/ && \
ssh root@85.209.93.32 'cp /tmp/.env.hostinger /var/www/atlas/.env && bash /tmp/atlas-go-live.sh'
```
**Aguarde a mensagem `✅ GO-LIVE CONCLUÍDO`** (aparece no terminal)

---

### 3️⃣ Aplicar migrations (Supabase — 10 min)

> ⚠️ **NÃO EXECUTAR.** Este `db push` apontava para o banco vivo (ietwopslgqxlenfyghqk) e dispararia ~128 migrations num banco com 23 tabelas e drift de schema. Siga docs/deploy/RUNBOOK_HOMOLOG_ESPELHO.md.

```bash
# NÃO EXECUTAR — mantido apenas como histórico
cd ~/atlas-v3
supabase link --project-ref ietwopslgqxlenfyghqk
supabase db push
```
**Esperado (à época; não reflete o estado real):**
```
Applied migration: 20260720000000_portal_lead_ingestion
Applied migration: 20260720010000_rbac_enterprise_foundation
Applied migration: 20260720020000_whatsapp_conversation_intelligence
Applied migration: 20260720030000_security_revoke_anon_knowledge_search
```

---

## ⚙️ PASSOS PARALELOS (enquanto rodava o deploy)

**No Supabase Dashboard** (browser):

1. **SMTP** (Authentication → SMTP Settings)
   - Host: `smtp.hostinger.com`
   - Port: `465`
   - User: `seu-email@atlasaios.com.br`
   - Password: [sua senha Hostinger]
   - Click **Save** → **Test** (mande um e-mail de teste)

2. **Proteção de Senha Vazada** (Authentication → Password Security)
   - ☑ Enable "Leaked Password Protection"
   - Save

---

## ✅ VALIDAÇÕES (depois que tudo subir)

Eu rodo isto automaticamente assim que a app responder:

```bash
D="atlasaios.com.br"
curl -I https://$D              # 200 (não 000, não parking)
curl https://$D/api/health      # JSON
curl https://$D/api/ready       # JSON  
curl https://$D/login           # form (não erro)
```

**Resultado esperado:** ✅ todos os 4 OK

---

## 🔐 PRIMEIRO ACESSO (3 min)

1. Abra **https://atlasaios.com.br/login**
2. Clique **Sign up**
3. Email + password (qualquer um, você é admin)
4. Confirme via e-mail (SMTP que você configurou)
5. Faça login

### IMEDIATAMENTE após:
```bash
ssh atlas@85.209.93.32
nano /var/www/atlas/.env
# Apague a linha ATLAS_BOOTSTRAP_SECRET completamente
# Salve: Ctrl+O, Enter, Ctrl+X
pm2 restart atlas-v3-homolog
```
(BOOTSTRAP_SECRET só serve pra criar o primeiro admin; depois remova.)

---

## 👥 CRIAR EQUIPE (3 min)

Dashboard → Settings → Team → **Add Member**

```
Email: diretor@atlasaios.com.br  | Role: admin_diretor
Email: gerente@atlasaios.com.br  | Role: admin_gerente  
Email: corretor@atlasaios.com.br | Role: comercial_corretor
```

Convites saem por e-mail (SMTP). Eles confirmam e ganham acesso.

---

## 📊 TESTAR CRM (5 min)

**Como corretor:**

- Dashboard (SLA, ranking, conversão)
- Leads (criar, editar, buscar)
- Timeline (histórico 360)
- Empreendimentos (listar/criar)
- IA Panel (lado direito) → vê Lead Score, Smart Reply, Next Action

**Teste:** abra um lead → painel de IA à direita deve mostrar score + sugestões em <3s.

---

## 🤖 TESTAR IA

**No lead aberto:**
- Score de conversão (% verde/amarelo/vermelho)
- Explicação ("porque estes fatores…")
- Smart Reply (clique "Generate" → sugestão de resposta)
- Next Action (recomendação automática)

Se Claude está ativo (`ANTHROPIC_API_KEY` preenchido), SmartReply usa Claude + OpenAI (fallback).

---

## 📝 CHECKLIST FINAL

| # | Tarefa | Tempo | Status |
|---|---|---|---|
| 1 | Preencher `.env.hostinger` | 3 min | ⏳ |
| 2 | Rodar `atlas-go-live.sh` | 15 min | ⏳ |
| 3 | ~~Aplicar migrations (`supabase db push`)~~ ⚠️ não fazer — ver runbook | 5 min | ❌ |
| 4 | Configurar SMTP + proteção de senha | 5 min | ⏳ |
| 5 | Primeiro login + remover BOOTSTRAP | 3 min | ⏳ |
| 6 | Criar equipe (diretor/gerente/corretor) | 3 min | ⏳ |
| 7 | Testar CRM (leads, timeline, etc) | 5 min | ⏳ |
| 8 | Testar IA (score, reply, action) | 2 min | ⏳ |
| **TOTAL** | **Atlas operacional** | **~45 min** | ⏳ |

---

## 🆘 TROUBLESHOOT RÁPIDO

**Script parou com erro?**
```bash
ssh atlas@85.209.93.32
pm2 logs atlas-v3-homolog
# veja o erro, cole aqui
```

**SMTP não envia?**
- Valida credenciais no Supabase → SMTP Settings → Test
- Confirma que é `smtp.hostinger.com:465` (não Gmail/Outlook)

**Login falha?**
- Falta SMTP configurado (é o bloqueador)
- Confirma que ANON_KEY + PUBLISHABLE_KEY não estão vazios

**IA não responde?**
- Checa que `OPENAI_API_KEY` está preenchido (obrigatório)
- Se Claude parou: `ANTHROPIC_API_KEY` vazio → cai para OpenAI (fallback automático)

**App não sobe (porta 80 fechada)?**
- `ssh atlas@85.209.93.32`
- `pm2 logs atlas-v3-homolog` → vê o erro
- `sudo systemctl status nginx` → valida proxy
- `curl http://localhost:3000` → app roda local?

---

## 📚 Docs detalhados (se precisar)

- **[docs/GO_LIVE_SEQUENCE.md](docs/GO_LIVE_SEQUENCE.md)** — fases completas (8 etapas)
- **[docs/MIGRATIONS_APPLY_NOW.md](docs/MIGRATIONS_APPLY_NOW.md)** — como aplicar SQL
- **[docs/POST_DEPLOY_CHECKLIST.md](docs/POST_DEPLOY_CHECKLIST.md)** — pós-script detalhado
- **[docs/VPS_DEPLOY_ATLASAIOS.md](docs/VPS_DEPLOY_ATLASAIOS.md)** — runbook VPS (tudo)

---

## ⚠️ Documento histórico — o caminho vigente é docs/deploy/RUNBOOK_HOMOLOG_ESPELHO.md

O sistema NÃO estava "100% pronto" quando este arquivo foi escrito: há drift de schema conhecido (banco vivo com 23 tabelas vs ~128 migrations no repo) e o repo não reconstrói o banco. Não siga os comandos acima.
