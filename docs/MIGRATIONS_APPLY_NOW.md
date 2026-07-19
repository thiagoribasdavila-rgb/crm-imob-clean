# Aplicar as 4 Migrations — Guia Rápido

Projeto Supabase: **`atlas-ai-crm-v1` (`ietwopslgqxlenfyghqk`)**

---

## Pré-requisito: Backup
Supabase Dashboard → **Backups** → **Create Manual Backup**

---

## Passo 1: Via CLI (recomendado — automático)

No seu Mac, na raiz do projeto:

```bash
cd ~/atlas-v3
supabase link --project-ref ietwopslgqxlenfyghqk
# (confirma o projeto — digite y)
supabase db push
# (aplica TODAS as migrations pendentes em supabase/migrations/)
```

**Resultado esperado:**
```
Applied migration: 20260720000000_portal_lead_ingestion
Applied migration: 20260720010000_rbac_enterprise_foundation
Applied migration: 20260720020000_whatsapp_conversation_intelligence
Applied migration: 20260720030000_security_revoke_anon_knowledge_search
```

---

## Passo 2: Manual (via SQL Editor, se a CLI não funcionar)

### Setup: Supabase Dashboard
1. Vá para **SQL Editor**
2. Clique **New query**
3. Copie cada bloco abaixo e execute (Run)

### Migration 1: Portal Lead Ingestion
Arquivo: `supabase/migrations/20260720000000_portal_lead_ingestion.sql`

**O que faz:** Tabelas + FKs para ingestão de leads de portais imobiliários (ZAP, Viva Real, OLX).

Para copiar o SQL:
```bash
cd ~/atlas-v3
cat supabase/migrations/20260720000000_portal_lead_ingestion.sql
# (copie TUDO e cole no SQL Editor do Supabase, clique Run)
```

### Migration 2: RBAC Enterprise Foundation
Arquivo: `supabase/migrations/20260720010000_rbac_enterprise_foundation.sql`

**O que faz:** Tabelas de permissões configuráveis no banco (complementa o catálogo em código).

```bash
cat supabase/migrations/20260720010000_rbac_enterprise_foundation.sql
# (copie e execute no SQL Editor)
```

### Migration 3: WhatsApp Conversation Intelligence
Arquivo: `supabase/migrations/20260720020000_whatsapp_conversation_intelligence.sql`

**O que faz:** Tabelas para armazenar insights de conversas WhatsApp (intenção, objeções, próxima ação).

```bash
cat supabase/migrations/20260720020000_whatsapp_conversation_intelligence.sql
# (copie e execute no SQL Editor)
```

### Migration 4: Security Fix (Revoke Anon Knowledge Search)
Arquivo: `supabase/migrations/20260720030000_security_revoke_anon_knowledge_search.sql`

**O que faz:** **FIX DE SEGURANÇA** — revoga acesso anônimo à RPC `search_knowledge_chunks`. Sem isto, visitantes não-logados podem consultar a base de conhecimento.

```bash
cat supabase/migrations/20260720030000_security_revoke_anon_knowledge_search.sql
# (copie e execute no SQL Editor)
```

---

## Validar: Migrations aplicadas

Supabase Dashboard → **Migrations** → deve listar as 4 acima (status: applied).

---

## Próximo: SMTP + Proteção de Senha Vazada

1. **SMTP** (Supabase → Authentication → SMTP Settings)
   - Host: smtp.hostinger.com
   - Port: 465 (SSL)
   - User: seu-email@atlasaios.com.br
   - Password: [sua senha Hostinger]

2. **Proteção de Senha Vazada** (Supabase → Authentication → Password Security)
   - Enable "Leaked Password Protection"

---

## Troubleshoot: Migração falhou

- **Erro de sintaxe:** Confira se copiou o SQL completo (sem quebras no meio)
- **"Relation already exists":** Migração já foi aplicada (OK, não roda de novo)
- **Drift de projeto:** Confirme que você está no projeto `ietwopslgqxlenfyghqk`, não em outro

**Restore do backup** (se precisar desfazer):
- Supabase → Backups → clique no snapshot pré-deploy → **Restore**
