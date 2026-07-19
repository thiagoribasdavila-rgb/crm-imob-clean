# ATLAS AI OS V3 — POST-DEPLOY CHECKLIST

Após o `atlas-go-live.sh` terminar com ✅ no VPS, execute AQUI (seu navegador + Supabase).

---

## 1. APLICAR 4 MIGRATIONS (Supabase SQL Editor)

Projeto: `atlas-ai-crm-v1` (`ietwopslgqxlenfyghqk`)

**Backup primeiro:**
- Supabase → Backups → Create Manual Backup
- (aditivas, mas backup é regra)

**Aplicar cada migration:**
1. Supabase → SQL Editor
2. Crie uma nova query
3. Cole o SQL de cada arquivo abaixo
4. Execute (Run)
5. Avance para a próxima

### Migration 1: Portais (`20260720000000_portal_lead_ingestion.sql`)
```sql
-- [COPIE O CONTEÚDO COMPLETO DE supabase/migrations/20260720000000_portal_lead_ingestion.sql]
```
**Propósito:** ingestão de leads de portais imobiliários (ZAP/Viva Real, OLX).

### Migration 2: RBAC Enterprise (`20260720010000_rbac_enterprise_foundation.sql`)
```sql
-- [COPIE O CONTEÚDO COMPLETO DE supabase/migrations/20260720010000_rbac_enterprise_foundation.sql]
```
**Propósito:** fundação de RBAC configurável no banco (complementa o catálogo em código).

### Migration 3: WhatsApp Intelligence (`20260720020000_whatsapp_conversation_intelligence.sql`)
```sql
-- [COPIE O CONTEÚDO COMPLETO DE supabase/migrations/20260720020000_whatsapp_conversation_intelligence.sql]
```
**Propósito:** insights por mensagem recebida do cliente (opt-in via `ATLAS_WHATSAPP_NLU_ENABLED`).

### Migration 4: Fix de segurança (`20260720030000_security_revoke_anon_knowledge_search.sql`)
```sql
-- [COPIE O CONTEÚDO COMPLETO DE supabase/migrations/20260720030000_security_revoke_anon_knowledge_search.sql]
```
**Propósito:** revoga acesso anônimo à busca de conhecimento (SECURITY DEFINER).

---

## 2. CONFIGURAR SMTP (Supabase Auth)

Supabase Dashboard → Authentication → SMTP Settings

| Campo | Valor |
|---|---|
| **Sender Email** | noreply@atlasaios.com.br |
| **SMTP Host** | smtp.hostinger.com |
| **SMTP Port** | 465 (SSL) |
| **SMTP User** | seu-email@atlasaios.com.br |
| **SMTP Password** | [sua senha Hostinger] |

Salve. Teste enviando um e-mail de recuperação de senha (`/auth/forgot-password`) — deve chegar.

---

## 3. ATIVAR PROTEÇÃO DE SENHA VAZADA

Supabase → Authentication → Password Security

- [ ] Enable "Leaked Password Protection" (via HaveIBeenPwned)

---

## 4. SMOKE TEST REMOTO (eu rodo assim que a app subir)

Quando o script terminar, me avise. Vou validar:

```bash
# Domínio resolvendo
dig +short A atlasaios.com.br          # deve retornar 85.209.93.32

# HTTPS + certificado válido
curl -I https://atlasaios.com.br       # HTTP 200-399 (não 000/timeout)

# APIs respondendo
curl https://atlasaios.com.br/api/health       # JSON
curl https://atlasaios.com.br/api/ready        # JSON

# Página inicial carrega
curl https://atlasaios.com.br | grep -i "<title>.*atlas" # Atlas na página

# Login acessível
curl https://atlasaios.com.br/login | grep -i "login|senha" # form presente

# Headers corretos (não "Parked Domain", Next.js sim)
curl -I https://atlasaios.com.br | grep -i "server:"        # nginx/Next, não hcdn

# www → apex (301)
curl -I https://www.atlasaios.com.br | grep "301"            # redirect

# http → https (301)
curl -I http://atlasaios.com.br | grep "301"                 # redirect
```

---

## 5. PRIMEIRO ACESSO (admin bootstrap)

1. **Abra** https://atlasaios.com.br/login
2. **Clique** "Criar conta" / "Sign up"
3. Email + senha (use `ATLAS_BOOTSTRAP_SECRET` do `.env` como dica)
4. Confirme o e-mail (Supabase SMTP acabou de ser ativado)
5. Faça login — você é o **admin master**
6. **Imediatamente após criar o admin:**
   - **Remova** `ATLAS_BOOTSTRAP_SECRET` do `.env` do VPS
   - SSH: `nano /var/www/atlas/.env` → apague a linha
   - `pm2 restart atlas-v3-homolog`

(BOOTSTRAP_SECRET só serve para criar o primeiro admin; deixar ativo é risco.)

---

## 6. CRIAR EQUIPE (RBAC)

Após o admin master estar logado:

1. Dashboard → Settings → Team
2. Clique "Add member"
3. **Diretor** → convidado como `admin_diretor`
4. **Gerente** → convidado como `admin_gerente`
5. **Corretor** → convidado como `comercial_corretor`

Cada convite é validado pelo RBAC (permissões em `lib/auth/permissions.ts`).

---

## 7. VALIDAR CRM

Após a equipe estar criada, todos entram em:

- **Dashboard** — broker/manager/superintendent views (SLA, ranking, productivity)
- **Leads** — funil, busca inteligente, ações em massa
- **Timeline** — histórico 360 de cliente
- **Empreendimentos** — catálogo de projetos com book
- **Tasks** — tarefas, SLAs, recorrências
- **Calendar** — agenda + integração com Google/Outlook

---

## 8. VALIDAR IA

Com um corretor logado:

1. Abra um lead no CRM
2. **Painel de IA** (direita) mostra:
   - **Lead Scoring** — prob de conversão + explicação
   - **Smart Reply** — sugestão de resposta (Claude se `ANTHROPIC_API_KEY` está ativo)
   - **Next Action** — ação recomendada (roteamento, call, follow-up)
3. **Comando Center** — orquestração de corretores + IA (se habilitado)

---

## Checklist pós-deploy

| # | Tarefa | Status |
|---|---|---|
| 1 | 4 migrations aplicadas | ⬜ |
| 2 | SMTP Hostinger configurado | ⬜ |
| 3 | Proteção de senha vazada ligada | ⬜ |
| 4 | Smoke test remoto (7 validações) | ⬜ |
| 5 | Admin master criado | ⬜ |
| 6 | ATLAS_BOOTSTRAP_SECRET removido do .env | ⬜ |
| 7 | Equipe criada (diretor/gerente/corretor) | ⬜ |
| 8 | CRM operacional (leads/timeline/empreendimentos) | ⬜ |
| 9 | IA respondendo (scoring + smart reply + next action) | ⬜ |
| 10 | Domínio https://atlasaios.com.br abrindo normalmente | ⬜ |

---

## Troubleshoot

**App não responde (porta 80/443 fechada após o script)**
```bash
ssh atlas@85.209.93.32
pm2 logs atlas-v3-homolog     # vê o erro da app
sudo systemctl status nginx    # valida Nginx
curl http://localhost:3000    # app roda local?
```

**Migrações falharam (SQL error)**
- Supabase → Backup History — restore o snapshot pré-deploy
- Verifique o `ietwopslgqxlenfyghqk` (projeto vivo, não staging)

**SMTP não funciona (e-mail não chega)**
- Supabase → SMTP Settings → Test
- Confirme credenciais Hostinger (não é Gmail/Outlook)
- MX records já existem (configurado antes)

**Login falha ("Algo deu errado")**
- SMTP não configurado (destrava o login)
- Confirme `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` não vazios

---

## Próximos passos (futuro)

1. **Meta Ads + WhatsApp** (conectar oficialmente, após validar a base)
2. **Loop de aprendizado de IA** (calibração de conversão realimentando o scoring)
3. **Cutover para produção limpa** (novo Supabase quando o piloto validar)
4. **SaaS multi-tenant** (billing, planos, limites por organização)
