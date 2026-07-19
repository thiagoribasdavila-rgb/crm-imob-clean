#!/usr/bin/env bash
# Bootstrap de deploy do ATLAS AI OS numa Hostinger VPS (Ubuntu 22.04/24.04).
# Executar DENTRO do VPS, como o usuário "atlas" (com sudo disponível).
# Encadeia os blocos 2..9 do runbook docs/VPS_DEPLOY_ATLASAIOS.md.
#
# Pré-requisitos (faça ANTES):
#   1) bloco 1 do runbook (usuário atlas + UFW já configurados);
#   2) o ZIP verificado já copiado para /tmp/ (scp do seu Mac);
#   3) o arquivo /var/www/atlas/.env preenchido (ver bloco 4) — o script NÃO cria segredos.
#
# Uso:
#   chmod +x deploy-vps.sh
#   ./deploy-vps.sh
#
# NÃO edita DNS (hPanel) nem aplica migrations (Supabase) nem emite SSL — esses
# são passos manuais (blocos 6, 10 e 11 do runbook), por segurança.

set -euo pipefail

APP_DIR="/var/www/atlas"
ZIP="${ATLAS_ZIP:-/tmp/atlas-v3-hostinger-homologation.zip}"
NODE_MAJOR="20"

log() { printf '\n\033[1;36m[deploy] %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m[deploy] ERRO: %s\033[0m\n' "$*" >&2; exit 1; }

# --- pré-checagens ---
[ -f "$ZIP" ] || die "ZIP não encontrado em $ZIP (copie via scp antes, ou defina ATLAS_ZIP=)."

# --- bloco 2: Node 20 LTS + build tools + PM2 ---
log "Instalando dependências de build e Node ${NODE_MAJOR} LTS"
sudo apt-get update -y
sudo apt-get install -y curl git build-essential unzip
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" != "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v
command -v pm2 >/dev/null 2>&1 || sudo npm install -g pm2

# --- swap se RAM < 3 GB (evita OOM no build) ---
MEM_MB=$(free -m | awk '/^Mem:/{print $2}')
if [ "$MEM_MB" -lt 3000 ] && ! sudo swapon --show | grep -q /swapfile; then
  log "RAM ${MEM_MB}MB < 3GB — criando swap de 2GB"
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# --- bloco 3: descompactar o pacote ---
log "Descompactando o pacote em ${APP_DIR}"
sudo mkdir -p "$APP_DIR"
sudo chown "$USER":"$USER" "$APP_DIR"
unzip -o "$ZIP" -d "$APP_DIR" >/dev/null
cd "$APP_DIR"
[ -f package.json ] || die "package.json não está na raiz de $APP_DIR (ZIP errado?)."

# --- bloco 4: exigir .env preenchido ---
[ -f "$APP_DIR/.env" ] || die "Crie $APP_DIR/.env preenchido (bloco 4 do runbook) antes de rodar."
chmod 600 "$APP_DIR/.env"
for k in NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY DATABASE_URL ATLAS_CRON_SECRET ATLAS_BASE_URL OPENAI_API_KEY; do
  grep -qE "^${k}=.+" "$APP_DIR/.env" || die ".env sem valor para ${k} (obrigatória)."
done

# --- bloco 5: deps + prisma + build ---
log "npm ci"
npm ci
log "prisma generate"
npm run prisma:generate
log "next build (pode levar alguns minutos)"
if [ "$MEM_MB" -lt 3000 ]; then
  NODE_OPTIONS=--max-old-space-size=1536 npm run build
else
  npm run build
fi

# --- bloco 7: PM2 ---
log "Iniciando PM2 (atlas-v3-homolog)"
mkdir -p "$APP_DIR/logs"
pm2 start ecosystem.config.cjs || pm2 restart atlas-v3-homolog
pm2 save
log "Confira a app local:"
curl -sS -I http://localhost:3000 | head -n 1 || true

# --- bloco 9: Nginx (server_name usa o domínio, não o IP) ---
log "Instalando/configurando Nginx"
sudo apt-get install -y nginx
sudo tee /etc/nginx/sites-available/atlas >/dev/null <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name atlasaios.com.br www.atlasaios.com.br;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://atlasaios.com.br$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
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
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name www.atlasaios.com.br;
    return 301 https://atlasaios.com.br$request_uri;
}
NGINX
sudo ln -sf /etc/nginx/sites-available/atlas /etc/nginx/sites-enabled/atlas
sudo rm -f /etc/nginx/sites-enabled/default

# Nginx só valida os blocos 443 depois que o certbot instalar o certificado.
# Antes do SSL, sobe só o :80 para o desafio ACME funcionar.
if sudo nginx -t 2>/dev/null; then
  sudo systemctl reload nginx
else
  log "Nginx ainda sem cert SSL — mantendo só :80 até rodar o certbot."
  sudo tee /etc/nginx/sites-available/atlas-http >/dev/null <<'NGINXHTTP'
server {
    listen 80;
    listen [::]:80;
    server_name atlasaios.com.br www.atlasaios.com.br;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINXHTTP
  sudo rm -f /etc/nginx/sites-enabled/atlas
  sudo ln -sf /etc/nginx/sites-available/atlas-http /etc/nginx/sites-enabled/atlas-http
  sudo nginx -t && sudo systemctl reload nginx
fi

cat <<'DONE'

============================================================
 App + PM2 + Nginx (:80) prontos. Faltam os passos MANUAIS:
------------------------------------------------------------
 1) DNS: no hPanel, aponte A @ e www para o IP deste VPS.
 2) SSL: quando o DNS propagar, rode:
      sudo apt -y install certbot python3-certbot-nginx
      sudo certbot --nginx -d atlasaios.com.br -d www.atlasaios.com.br \
           --redirect --agree-tos -m seu-email@dominio --no-eff-email
    (o certbot ativa os blocos 443 e o redirect http->https)
    Depois: sudo ln -sf /etc/nginx/sites-available/atlas /etc/nginx/sites-enabled/atlas \
            && sudo rm -f /etc/nginx/sites-enabled/atlas-http && sudo nginx -t && sudo systemctl reload nginx
 3) Migrations + SMTP no Supabase (bloco 6 do runbook).
 4) Cron dos workers (bloco 8 do runbook).
 5) pm2 startup systemd -u atlas --hp /home/atlas   (arranque no boot)
============================================================
DONE
log "Bootstrap concluído."
