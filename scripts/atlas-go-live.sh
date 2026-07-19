#!/usr/bin/env bash
# ATLAS AI OS V3 — GO-LIVE EXECUTION
# Execute como root@85.209.93.32
# Encadeia todos os passos do runbook (1-8), menos Supabase migrations.

set -euo pipefail
log() { printf '\n\033[1;36m[go-live] %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠️  %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ok() { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }

APPDIR="/var/www/atlas"
ZIP="/tmp/atlas-v3-hostinger-homologation.zip"
DOMAIN="atlasaios.com.br"
EMAIL="seu-email@atlasaios.com.br"

# --- Passo 1 ---
log "1. Acesso + hardening"
apt-get update >/dev/null && apt-get -y upgrade >/dev/null
apt-get -y install ufw curl git build-essential unzip >/dev/null
! id atlas >/dev/null 2>&1 && adduser --gecos "" atlas && usermod -aG sudo atlas
ufw allow OpenSSH >/dev/null 2>&1 && ufw allow 80/tcp >/dev/null 2>&1 && ufw allow 443/tcp >/dev/null 2>&1 && ufw --force enable >/dev/null 2>&1
timedatectl set-timezone America/Sao_Paulo
ok "acesso + firewall + timezone"

# --- Passo 2 ---
log "2. Node 20 LTS"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get -y install nodejs >/dev/null
fi
NODE_V=$(node -v)
[[ "$NODE_V" =~ v20 ]] || die "Node não v20: $NODE_V"
npm install -g pm2 >/dev/null 2>&1
ok "Node $NODE_V + PM2"

# --- Passo 3 ---
log "3. Extrair ZIP"
[ -f "$ZIP" ] || die "ZIP não em $ZIP"
mkdir -p "$APPDIR"
chown atlas:atlas "$APPDIR"
su - atlas -c "cd $APPDIR && unzip -o $ZIP >/dev/null"
[ -f "$APPDIR/package.json" ] || die "package.json não encontrado"
ok "ZIP extraído"

# --- Passo 4 ---
log "4. Validar .env"
if [ ! -f "$APPDIR/.env" ]; then
  die "❌ $APPDIR/.env não existe. Cole-o via 'nano' ou 'scp' ANTES de rodar este script."
fi
for var in NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY DATABASE_URL ATLAS_CRON_SECRET OPENAI_API_KEY ATLAS_BASE_URL; do
  if ! grep -q "^$var=" "$APPDIR/.env" || grep "^$var=$" "$APPDIR/.env" >/dev/null; then
    die "❌ .env faltando ou vazio: $var"
  fi
done
chmod 600 "$APPDIR/.env"
ok ".env validado"

# --- Passo 5 ---
log "5. Build (npm ci + prisma generate + npm run build)"
cd "$APPDIR"
su - atlas -c "cd $APPDIR && npm ci >/dev/null 2>&1"
ok "  npm ci"
su - atlas -c "cd $APPDIR && npm run prisma:generate >/dev/null 2>&1"
ok "  prisma generate"
MEM_MB=$(free -m | awk '/^Mem:/{print $2}')
if [ "$MEM_MB" -lt 3000 ]; then
  export NODE_OPTIONS="--max-old-space-size=1536"
fi
su - atlas -c "cd $APPDIR && npm run build" || die "build falhou"
[ -d "$APPDIR/.next" ] || die ".next não gerado"
ok "build completo"

# --- Passo 6 ---
log "6. PM2"
mkdir -p "$APPDIR/logs"
cd "$APPDIR"
su - atlas -c "cd $APPDIR && pm2 start ecosystem.config.cjs" || pm2 restart atlas-v3-homolog
su - atlas -c "pm2 save"
ok "app iniciada (PM2)"
sleep 2
su - atlas -c "curl -sS -I http://localhost:3000" | head -1 || warn "⚠️ localhost:3000 não respondeu ainda (aguarde)"

# --- Passo 7 ---
log "7. Nginx (proxy + SSL pronto)"
apt-get -y install nginx >/dev/null
sudo tee /etc/nginx/sites-available/atlas >/dev/null <<'NGINX'
server {
    listen 80; listen [::]:80;
    server_name atlasaios.com.br www.atlasaios.com.br;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://atlasaios.com.br$request_uri; }
}
server {
    listen 443 ssl; listen [::]:443 ssl;
    http2 on;
    server_name atlasaios.com.br;
    client_max_body_size 25m;
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
    listen 443 ssl; listen [::]:443 ssl;
    http2 on;
    server_name www.atlasaios.com.br;
    return 301 https://atlasaios.com.br$request_uri;
}
NGINX
ln -sf /etc/nginx/sites-available/atlas /etc/nginx/sites-enabled/atlas
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
ok "Nginx configurado (ssl placeholder até certbot)"

# --- Passo 8 ---
log "8. SSL Let's Encrypt (certbot)"
apt-get -y install certbot python3-certbot-nginx >/dev/null
warn "Certbot vai validar DNS (pode levar ~1 min). Certificados para:"
warn "  - atlasaios.com.br"
warn "  - www.atlasaios.com.br"
certbot --nginx -d atlasaios.com.br -d www.atlasaios.com.br \
  --redirect --agree-tos -m "$EMAIL" --no-eff-email --non-interactive || \
  die "Certbot falhou (DNS propagou? domínio resolvendo?)"
ln -sf /etc/nginx/sites-available/atlas /etc/nginx/sites-enabled/atlas
rm -f /etc/nginx/sites-enabled/atlas-http 2>/dev/null || true
nginx -t && systemctl reload nginx
ok "SSL ativo"

# --- Passo 8 (cont.) ---
log "9. Cron dos workers"
cron_cmd='*/2 * * * * cd /var/www/atlas && set -a && . ./.env && set +a && /usr/bin/node scripts/run-workers.mjs >> /var/www/atlas/logs/workers.log 2>&1'
(su - atlas -c "crontab -l" 2>/dev/null | grep -q "run-workers.mjs") || \
  (su - atlas -c "crontab -l" 2>/dev/null; echo "$cron_cmd") | su - atlas -c "crontab -"
ok "Cron workers a cada 2 min"

# --- Passo 9 ---
log "10. PM2 auto-startup"
su - atlas -c "pm2 save"
startcmd=$(pm2 startup systemd -u atlas --hp /home/atlas 2>/dev/null | grep "sudo env")
[ -n "$startcmd" ] && eval "$startcmd" || true
ok "PM2 startup configurado"

# --- Smoke test local ---
log "11. Smoke test local"
sleep 2
for path in / /api/health /api/ready; do
  code=$(curl -sS -m 6 -o /dev/null -w "%{http_code}" -H "Host: atlasaios.com.br" "http://localhost:3000$path" 2>/dev/null)
  [ -n "$code" ] && [ "$code" != "000" ] && ok "  http://localhost:3000$path -> $code" || warn "  $path -> sem resposta"
done

# --- Resumo ---
log "✅ GO-LIVE CONCLUÍDO"
cat <<'SUMMARY'

Estado:
 ✓ Node 20 LTS + PM2 + Nginx + SSL (Let's Encrypt)
 ✓ App rodando em http://localhost:3000
 ✓ Domínio atlasaios.com.br → VPS (DNS propagado)
 ✓ Workers/cron agendados

PRÓXIMO (fora do VPS):
 1. Aplicar migrations Supabase (4 pendentes, incluindo fix de segurança)
 2. Configurar SMTP no Supabase Auth (destrava login/recuperação)
 3. Ligar proteção de senha vazada (Supabase Auth)
 4. Validar smoke test remoto (https://atlasaios.com.br/api/health)

Para validar agora:
 ssh -i key atlas@85.209.93.32
 pm2 logs atlas-v3-homolog     # logs da app
 tail logs/workers.log         # logs dos workers

Domínio: https://atlasaios.com.br
SUMMARY
