# Runbook — Deploy do ATLAS AI OS na Hostinger VPS (`atlasaios.com.br`)

> Objetivo: subir o Atlas v3 num VPS Node, servir em **https://atlasaios.com.br** com Nginx + SSL, e deixar workers/cron rodando. Execute os blocos na ordem. Comandos assumem **Ubuntu 22.04/24.04** (imagem padrão da Hostinger VPS).
>
> Fatos do projeto (confirmados): Node **`>=20.9 <21`** (linha 20 LTS) · app inicia com `next start -p 3000` via PM2 (`ecosystem.config.cjs`) · ZIP é **source-only** (`git archive HEAD`) → **o build roda no servidor** · workers = `scripts/run-workers.mjs` (4 jobs HTTP) via **crontab**.

---

## 0. Requisitos mínimos de servidor

| Recurso | Mínimo | Recomendado | Porquê |
|---|---|---|---|
| Plano Hostinger | KVM 1 | **KVM 2** | `next build` pode passar de 1 GB de RAM |
| vCPU | 1 | 2 | build + runtime + Nginx |
| **RAM** | **2 GB** | **4 GB** | build do Next é o ponto de pressão (evita OOM) |
| Disco | 20 GB | 40 GB SSD | app + node_modules + logs |
| SO | Ubuntu 22.04 | Ubuntu 24.04 LTS | comandos deste runbook |
| Rede | IPv4 público | IPv4 público | alvo do registro A do DNS |

> Se ficar no KVM 1 (2 GB): antes do build crie swap (bloco 2.3) para não dar OOM.

---

## 1. Acesso e hardening básico

```bash
# 1.1 conectar (troque pelo IP do seu VPS)
ssh root@<VPS_IP>

# 1.2 atualizar SO
apt update && apt -y upgrade

# 1.3 usuário de deploy sem root (recomendado)
adduser --gecos "" atlas
usermod -aG sudo atlas

# 1.4 firewall — só SSH + HTTP + HTTPS
apt -y install ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status

# 1.5 fuso (opcional, logs em horário local)
timedatectl set-timezone America/Sao_Paulo
```

Reconecte como o usuário `atlas` para os próximos blocos: `ssh atlas@<VPS_IP>`.

---

## 2. Node 20 LTS + ferramentas de build

```bash
# 2.1 dependências de build (prisma/next precisam)
sudo apt -y install curl git build-essential

# 2.2 Node 20 via NodeSource (respeita engines >=20.9 <21)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt -y install nodejs
node -v    # deve mostrar v20.x (>=20.9)
npm -v

# 2.3 (só se RAM = 2 GB) swap de 2 GB para o build não dar OOM
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 2.4 PM2 global
sudo npm install -g pm2
```

---

## 3. Enviar e descompactar o pacote

Use o ZIP **verificado** (não compacte a pasta na mão). Do seu Mac:

```bash
# no seu Mac, na raiz do projeto — gera o pacote + SHA-256
npm run package:hostinger
# copia para o VPS
scp dist/hostinger/atlas-v3-hostinger-homologation.zip atlas@<VPS_IP>:/tmp/
```

No VPS:

```bash
sudo mkdir -p /var/www/atlas && sudo chown atlas:atlas /var/www/atlas
cd /var/www/atlas
sudo apt -y install unzip
unzip -o /tmp/atlas-v3-hostinger-homologation.zip -d /var/www/atlas
ls package.json ecosystem.config.cjs   # sanity: arquivos na raiz
```

---

## 4. Variáveis de ambiente (`.env`)

Crie `/var/www/atlas/.env` (o Next lê `.env` em produção). **Preencha só os valores; nunca versione este arquivo.** Base: `.env.example` do projeto, com as URLs já no domínio oficial.

```bash
cd /var/www/atlas
nano .env     # cole o bloco abaixo e preencha
chmod 600 .env
```

```dotenv
# --- Supabase (mesmo projeto de homologação — preserva o aprendizado) ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=

# --- Segurança operacional (workers/cron) ---
ATLAS_CRON_SECRET=

# --- Bootstrap do 1º admin (remova a variável após criar o admin) ---
ATLAS_BOOTSTRAP_SECRET=

# --- URLs OFICIAIS (o ponto que muda vs. local) ---
ATLAS_BASE_URL=https://atlasaios.com.br
NEXT_PUBLIC_APP_URL=https://atlasaios.com.br

# --- Identidade do ambiente (mantém homologation nesta 1ª operação real) ---
ATLAS_ENV=homologation
ATLAS_ENVIRONMENT_ID=atlas-v3-hostinger-homolog
ATLAS_DATABASE_ENVIRONMENT=homologation
ATLAS_HOSTING_PROVIDER=hostinger
ATLAS_DEFAULT_ORGANIZATION_ID=

# --- IA (OpenAI obrigatória; demais opcionais/opt-in) ---
OPENAI_API_KEY=
# Anthropic/Claude e provedores economy: opcionais. Só entram se a chave existir
# E "anthropic"/provedor estiver numa ordem ATLAS_AI_*_PROVIDER_ORDER. Custo externo.
# ANTHROPIC_API_KEY=
# ATLAS_ANTHROPIC_MODEL=claude-opus-4-8

# --- Storage de materiais (mantenha supabase até validar S3/R2) ---
ATLAS_MATERIAL_STORAGE_PROVIDER=supabase

# --- Integrações externas: DEIXAR VAZIAS neste primeiro deploy ---
# Meta/WhatsApp/Calendars entram só depois da base validada no domínio.
ATLAS_WHATSAPP_NLU_ENABLED=false
```

> Regras de ouro: o `SUPABASE_SERVICE_ROLE_KEY` e o `DATABASE_URL` são segredos — só neste `.env` (chmod 600). Não coloque `ATLAS_TEST_EMAIL/PASSWORD` em produção. Remova `ATLAS_BOOTSTRAP_SECRET` assim que o admin master existir.

---

## 5. Instalar deps, Prisma e build

```bash
cd /var/www/atlas
npm ci                      # instala exatamente o package-lock
npm run prisma:generate     # gera o Prisma Client (prisma generate)
npm run build               # node scripts/build.mjs (gera .next)
```

Se o build morrer por memória no KVM 1: confirme o swap (2.3) e rode
`NODE_OPTIONS=--max-old-space-size=1536 npm run build`.

> Opcional (gate completo): `npm run validate` roda ~80 checagens (typecheck, lint, segurança, RLS, build). Exige todas as env vars preenchidas. Para o primeiro deploy, `npm run build` basta.

---

## 6. Migrations (Supabase) — ação sua, fora do VPS

As 4 migrations pendentes ficam em `supabase/migrations/` e **não são aplicadas pelo deploy** — o Atlas usa Supabase gerenciado. Aplique-as no **projeto vivo** pelo SQL Editor do Supabase ou pela CLI:

| Migration | O que faz |
|---|---|
| `20260720000000_portal_lead_ingestion.sql` | ingestão de leads de portais |
| `20260720010000_rbac_enterprise_foundation.sql` | fundação RBAC enterprise |
| `20260720020000_whatsapp_conversation_intelligence.sql` | insights de conversa WhatsApp |
| `20260720030000_security_revoke_anon_knowledge_search.sql` | **fix de segurança** (revoga busca anônima) |

> ⚠️ **Drift de projeto:** o Supabase vivo é `atlas-ai-crm-v1` (`ietwopslgqxlenfyghqk`), mas as migrations declaram alvo `crm-imob-clean`. Ao aplicar, **confirme que o destino é `ietwopslgqxlenfyghqk`** — senão não terão efeito.
>
> Via CLI: `supabase link --project-ref ietwopslgqxlenfyghqk && supabase db push`. Faça um **snapshot/backup antes** (aditivas e reversíveis, mas backup é regra).

Ainda no Supabase, **Authentication → SMTP**: configure com a conta de e-mail da **Hostinger** (MX/SPF/DKIM já existem no domínio) — destrava login, recuperação de senha e convites. **Site URL** = `https://atlasaios.com.br`; **Redirect URL** = `https://atlasaios.com.br/auth/callback`.

---

## 7. PM2 — web app

O `ecosystem.config.cjs` já define a app (`next start -p 3000`, fork, autorestart, `max_memory_restart 1G`).

```bash
cd /var/www/atlas
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 status                         # atlas-v3-homolog: online
curl -sS -I http://localhost:3000  # deve responder do Next (não do parking)

# arranque automático no boot
pm2 save
pm2 startup systemd -u atlas --hp /home/atlas
# rode o comando que o PM2 imprimir (começa com sudo env PATH=...)
```

> O `.env` da raiz é lido pelo Next. As env do bloco `env:` do ecosystem (NODE_ENV, ATLAS_ENV etc.) complementam — os valores do `.env` de Supabase/IA/URLs precisam estar no `.env`.

---

## 8. Workers / cron (outbox, nightly, tarefas)

`scripts/run-workers.mjs` dispara 4 jobs (`nightly-sales`, `outbox`, `task-recurrences`, `task-reminders`) via HTTP autenticado por `ATLAS_CRON_SECRET`. Rode em **crontab** (não é processo persistente).

```bash
# carrega o .env e chama o runner; loga em /var/www/atlas/logs/workers.log
crontab -e
```

Adicione (a cada 2 min; ajuste a frequência conforme necessário):

```cron
*/2 * * * * cd /var/www/atlas && set -a && . ./.env && set +a && /usr/bin/node scripts/run-workers.mjs >> /var/www/atlas/logs/workers.log 2>&1
```

> `run-workers.mjs` chama `ATLAS_BASE_URL` (= domínio). Funciona assim que o Nginx/SSL estiverem no ar (blocos 9–10). Enquanto valida, dá para trocar temporariamente por `ATLAS_BASE_URL=http://localhost:3000` no comando do cron.

---

## 9. Nginx — proxy reverso

```bash
sudo apt -y install nginx
sudo nano /etc/nginx/sites-available/atlas
```

```nginx
# HTTP: será usado pelo certbot e depois redireciona para HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name atlasaios.com.br www.atlasaios.com.br;

    # necessário para o desafio HTTP-01 do Let's Encrypt
    location /.well-known/acme-challenge/ { root /var/www/html; }

    location / { return 301 https://atlasaios.com.br$request_uri; }
}

# HTTPS: apex serve o Atlas; www redireciona para apex.
# (os blocos ssl_* são adicionados/gerenciados pelo certbot no bloco 10)
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name atlasaios.com.br;

    client_max_body_size 25m;   # uploads de materiais/imagens

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 75s;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name www.atlasaios.com.br;
    return 301 https://atlasaios.com.br$request_uri;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/atlas /etc/nginx/sites-enabled/atlas
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t          # testa a config
sudo systemctl reload nginx
```

> O Atlas já envia **HSTS** — não adicione `Strict-Transport-Security` no Nginx (evita duplicar).

---

## 10. SSL Let's Encrypt

Pré-requisito: o **registro A** de `atlasaios.com.br` (e `www`) já apontando para `<VPS_IP>` (bloco 11) e propagado.

```bash
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d atlasaios.com.br -d www.atlasaios.com.br \
     --redirect --agree-tos -m seu-email@dominio --no-eff-email
# renovação automática já vem via systemd timer:
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

O certbot preenche os `ssl_certificate*` nos blocos 443 e garante o redirect `http→https`.

---

## 11. DNS — apontar o domínio para o VPS

No **hPanel → DNS Zone Editor** de `atlasaios.com.br`, troque o A de parking (`2.57.91.91`) pelo IP do VPS:

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| A | `@` | `<VPS_IP>` | 300 |
| A | `www` | `<VPS_IP>` | 300 |

E-mail (MX/SPF/DKIM/DMARC da Hostinger) **não muda**. Aguarde a propagação (`dig +short A atlasaios.com.br` retornar `<VPS_IP>`) antes do bloco 10 (SSL).

---

## 12. Start / restart / logs (operação do dia a dia)

```bash
# web app
pm2 restart atlas-v3-homolog      # reiniciar
pm2 stop atlas-v3-homolog         # parar
pm2 logs atlas-v3-homolog         # logs ao vivo
pm2 monit                         # painel

# deploy de nova versão (novo ZIP)
cd /var/www/atlas
unzip -o /tmp/atlas-v3-hostinger-homologation.zip -d /var/www/atlas
npm ci && npm run prisma:generate && npm run build
pm2 restart atlas-v3-homolog

# nginx
sudo nginx -t && sudo systemctl reload nginx

# workers (teste manual)
cd /var/www/atlas && set -a && . ./.env && set +a && node scripts/run-workers.mjs
```

---

## 13. Checklist pós-deploy

| # | Verificação | Como | OK |
|---|---|---|---|
| 1 | DNS aponta para o VPS | `dig +short A atlasaios.com.br` = `<VPS_IP>` | ⬜ |
| 2 | App responde local | `curl -I http://localhost:3000` = 200 do Next | ⬜ |
| 3 | HTTPS + SSL válido | `curl -I https://atlasaios.com.br` = 200, cert Let's Encrypt | ⬜ |
| 4 | **Não é mais o parking** | header `x-powered-by`/nginx e `<title>` do Atlas (não "Parked Domain") | ⬜ |
| 5 | `www` → apex (301) | `curl -I https://www.atlasaios.com.br` = 301 | ⬜ |
| 6 | `http` → `https` (301) | `curl -I http://atlasaios.com.br` = 301 | ⬜ |
| 7 | Health/Ready | `curl https://atlasaios.com.br/api/health` = JSON do Atlas | ⬜ |
| 8 | Migrations aplicadas | 4 migrations no projeto `ietwopslgqxlenfyghqk` | ⬜ |
| 9 | SMTP Supabase | e-mail de teste/recuperação chega | ⬜ |
| 10 | PM2 no boot | `pm2 save` feito + `pm2 startup` ativo | ⬜ |
| 11 | Cron dos workers | `tail logs/workers.log` mostra jobs 200 | ⬜ |
| 12 | Firewall | `ufw status` = só 22/80/443 | ⬜ |

Quando 1–7 estiverem verdes, **me avise (ou passe o IP)** que eu re-rodo o smoke test remoto e sigo para a próxima etapa.

---

## Próxima etapa (após o app no ar) — primeiro acesso real + CRM + IA

1. **Admin master** — primeiro acesso via `ATLAS_BOOTSTRAP_SECRET`; criar o admin; **remover a variável** do `.env` e `pm2 restart`.
2. **Hierarquia** — admin cria diretor → gerentes → corretores em `/settings/team` (respeita `allowedNewRoles`; cada convite depende do SMTP).
3. **Empreendimentos** — cadastrar em `/developments` (book/tabela/estoque reais).
4. **Primeiros leads** — importação supervisionada, site/webhook, ou conectores (Meta/portais) quando ligados.
5. **Validação CRM** — pipeline/kanban, SLAs, distribuição explicável, timeline 360.
6. **IA** — OpenAI já ativa; ligar Claude/economy (opt-in por env) e, por último, Meta Ads + WhatsApp.

> Só depois desta base validada no domínio é que se liga Meta/WhatsApp (sua própria ordem — correta).
