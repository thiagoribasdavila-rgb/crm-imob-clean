# ATLAS AI OS V3 — GO-LIVE SEQUENCE (Sequência completa)

**Objetivo final:** deixar https://atlasaios.com.br funcional, com CRM operacional, IA rodando, equipe criada.

**Cronograma estimado:** 30 min (você) + 15 min (automático) + 10 min (Supabase) = ~55 min total.

---

## FASE 1: Preparação (seu Mac — 5 min)

```bash
cd ~/atlas-v3

# 1. Preencher o .env.hostinger (todas as credenciais)
nano .env.hostinger
# Edite e salve:
# - SUPABASE_PUBLISHABLE_KEY / SERVICE_ROLE_KEY
# - DATABASE_URL (Supabase Pooler, us-west-2)
# - ATLAS_CRON_SECRET (openssl rand -base64 32)
# - ATLAS_BOOTSTRAP_SECRET (outra senha)
# - OPENAI_API_KEY
# - ANTHROPIC_API_KEY (opcional)

# 2. Validar que não ficou vazio (checagem rápida)
grep "^[A-Z_]*=$" .env.hostinger || echo "✓ nenhuma variável vazia"
```

---

## FASE 2: Deploy no VPS (via SSH — 10–15 min automático)

```bash
# 1. Enviar script + .env
scp scripts/atlas-go-live.sh root@85.209.93.32:/root/
scp .env.hostinger root@85.209.93.32:/var/www/atlas/.env

# 2. Executar o script
ssh root@85.209.93.32 'bash /root/atlas-go-live.sh'

# Aguarde até terminar com ✅
# O script faz: Node 20 → build → PM2 → Nginx → SSL certbot → cron
```

**Esperado ao terminar:**
```
✅ GO-LIVE CONCLUÍDO
✓ Node 20 LTS + PM2 + Nginx + SSL (Let's Encrypt)
✓ App rodando em http://localhost:3000
✓ Domínio atlasaios.com.br → VPS
✓ Workers/cron agendados
```

---

## FASE 3: Supabase (seu navegador + CLI — 10 min)

```bash
# 1. Aplicar 4 migrations (CLI automático)
cd ~/atlas-v3
supabase link --project-ref ietwopslgqxlenfyghqk
supabase db push
# Aguarde: "Applied migration: 202607200*"

# 2. Configurar SMTP (Supabase Dashboard)
# Supabase → Authentication → SMTP Settings
# Host: smtp.hostinger.com
# Port: 465 (SSL)
# User: seu-email@atlasaios.com.br
# Password: [sua senha Hostinger]
# Salve e teste

# 3. Ativar proteção de senha vazada
# Supabase → Authentication → Password Security
# ☑ Enable "Leaked Password Protection"
```

**Esperado:**
```
✓ 4 migrations aplicadas (portais, RBAC, WhatsApp, security fix)
✓ SMTP funcionando (teste enviando um e-mail)
✓ Proteção de senha vazada ligada
```

---

## FASE 4: Smoke Test Remoto (eu rodo — 2 min)

Você me avisa: **"app no ar"** ou **cole a saída do script**

Eu executo este teste (você pode acompanhar):

```bash
D="atlasaios.com.br"
curl -I https://$D                    # ✓ HTTP 200-399
curl https://$D/api/health            # ✓ JSON valido
curl https://$D/api/ready             # ✓ JSON valido
curl https://$D/login                 # ✓ form presente
curl -I https://www.$D                # ✓ 301 → apex
curl -I http://$D                     # ✓ 301 → https
```

**Resultado esperado:** ✅ todos os endpoints respondendo

---

## FASE 5: Primeiro Acesso (seu navegador — 3 min)

1. Abra https://atlasaios.com.br/login
2. Clique "Sign up" (criar conta)
3. Email + senha (use `ATLAS_BOOTSTRAP_SECRET` como dica)
4. Confirme o e-mail (chegará via SMTP que você configurou)
5. Faça login — você é o **admin master**
6. **Imediatamente:**
   ```bash
   # SSH
   ssh atlas@85.209.93.32
   nano /var/www/atlas/.env
   # Apague a linha ATLAS_BOOTSTRAP_SECRET (complete)
   # Salve (Ctrl+O, Ctrl+X)
   pm2 restart atlas-v3-homolog
   ```

---

## FASE 6: Criar Equipe (5 min)

**No Dashboard** → Settings → Team → Add Member

| Função | Email | Papel | Permissões |
|---|---|---|---|
| Diretor | thiago@atlasaios.com.br | `admin_diretor` | tudo |
| Gerente | gerente@atlasaios.com.br | `admin_gerente` | leads, team, reports |
| Corretor | corretor@atlasaios.com.br | `comercial_corretor` | leads, CRM, IA |

Cada convite é enviado por SMTP — confirme que chegam.

---

## FASE 7: Validar CRM (5 min)

Com um **corretor** logado:

1. **Dashboard** — broker view (SLA, ranking, conversão)
2. **Leads** — criar/editar leads, busca inteligente
3. **Timeline** — histórico 360 de cliente
4. **Empreendimentos** — cadastrar 1 projeto teste
5. **Tasks** — criar tarefa, SLA automático
6. **IA Panel** (lado direito do lead):
   - Lead Scoring (% conversão)
   - Smart Reply (sugestão de resposta)
   - Next Action (ação recomendada)

---

## FASE 8: Validar IA (2 min)

Com um lead aberto no CRM:

1. **Painel de IA** (lado direito) mostra:
   - ✓ Lead Score (prob de conversão)
   - ✓ Explicação (por que esse score)
   - ✓ Smart Reply (sugestão Claude/OpenAI conforme `ANTHROPIC_API_KEY`)
   - ✓ Next Action (roteamento automático)

2. Teste: clique em "Regenerate" → IA responde em <5s

---

## Checklist Final

| # | Tarefa | Fase | Status |
|---|---|---|---|
| 1 | `.env.hostinger` preenchido | 1 | ⬜ |
| 2 | ZIP enviado + script rodou | 2 | ⬜ |
| 3 | 4 migrations aplicadas | 3 | ⬜ |
| 4 | SMTP configurado + testado | 3 | ⬜ |
| 5 | Proteção de senha ligada | 3 | ⬜ |
| 6 | Smoke test remoto (9 validações) | 4 | ⬜ |
| 7 | Admin master criado + BOOTSTRAP removido | 5 | ⬜ |
| 8 | Equipe criada (diretor/gerente/corretor) | 6 | ⬜ |
| 9 | CRM operacional (6 seções) | 7 | ⬜ |
| 10 | IA respondendo (scoring + reply + action) | 8 | ⬜ |
| **11** | **https://atlasaios.com.br operacional** | **N/A** | **⬜** |

---

## Próximos Passos (após o go-live)

1. **Meta Ads + WhatsApp** (conectar oficialmente)
2. **Loop de aprendizado de IA** (calibração de conversão)
3. **Cutover para produção** (novo Supabase limpo)
4. **SaaS multi-tenant** (billing, planos, limites)
5. **Otimizações de performance** (caching, indexação, observabilidade)

---

## Troubleshoot Rápido

| Problema | Solução |
|---|---|
| Script parou com erro | Cole a mensagem aqui — eu diagnostico |
| SMTP não funciona | Valide credenciais Hostinger (não é Gmail) |
| Login falha | SMTP não configurado (é o bloqueador) |
| IA não responde | Checa `OPENAI_API_KEY` + `ANTHROPIC_API_KEY` preenchidos |
| App não responde | `ssh atlas@85.209.93.32 && pm2 logs atlas-v3-homolog` |

---

## Você está a ~45 min do go-live completo 🚀
