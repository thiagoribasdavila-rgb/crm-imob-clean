#!/usr/bin/env bash
# ATLAS AI OS V3 — GO-LIVE EXECUTION (v2 — corrigido)
# Execute como root@85.209.93.32: bash atlas-go-live.sh
#
# CORREÇÕES v2 (vs v1, que travava sem explicação):
#  1. `adduser` sem --disabled-password pede senha interativa e TRAVA em SSH
#     não-interativo (causa mais provável do "nada acontece"). Corrigido.
#  2. npm ci / prisma generate tinham stderr jogado em /dev/null sem `|| die`
#     — se falhassem, o script morria em silêncio (set -e), sem nenhuma
#     mensagem. Agora tudo vai para um LOGFILE e qualquer falha imprime as
#     últimas 40 linhas na tela antes de sair.
#  3. PM2 fallback rodava como root em vez de atlas (processo órfão). Corrigido
#     para start-or-restart sempre no contexto do usuário atlas.

set -uo pipefail
LOGFILE="/var/log/atlas-go-live.log"
: > "$LOGFILE" 2>/dev/null || LOGFILE="/tmp/atlas-go-live.log"
: > "$LOGFILE"

log()  { printf '\n\033[1;36m[go-live] %s\033[0m\n' "$*" | tee -a "$LOGFILE"; }
warn() { printf '\033[1;33m⚠️  %s\033[0m\n' "$*" | tee -a "$LOGFILE"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*" | tee -a "$LOGFILE"; }
die() {
  printf '\033[1;31m✗ ERRO: %s\033[0m\n' "$*" | tee -a "$LOGFILE" >&2
  printf '\n\033[1;31m--- últimas 40 linhas do log (%s) ---\033[0m\n' "$LOGFILE" >&2
  tail -n 40 "$LOGFILE" >&2
  printf '\n\033[1;33mLog completo em: %s — cole aqui para diagnóstico.\033[0m\n' "$LOGFILE" >&2
  exit 1
}
# roda um comando; grava saída no log; morre com contexto visível se falhar
run() {
  local desc="$1"; shift
  printf -- '--- %s ---\n' "$desc" >>"$LOGFILE"
  if "$@" >>"$LOGFILE" 2>&1; then
    ok "$desc"
  else
    local code=$?
    die "$desc (exit $code)"
  fi
}

APPDIR="/var/www/atlas"
ZIP="/tmp/atlas-v3-hostinger-homologation.zip"
EMAIL="seu-email@atlasaios.com.br"   # troque pelo seu e-mail antes de rodar (Let's Encrypt)

log "Log completo em: $LOGFILE (se algo falhar, as últimas linhas aparecem na tela)"

# ============================================================
# PASSO 1 — Acesso + hardening
# ============================================================
log "1. Acesso + hardening"
run "apt-get update"  apt-get update
run "apt-get upgrade" apt-get -y upgrade
run "instalar utilitários base" apt-get -y install ufw curl git build-essential unzip

if ! id atlas >/dev/null 2>&1; then
  # --disabled-password é ESSENCIAL: sem isso, adduser pede senha
  # interativa e trava um script não-interativo (SSH) para sempre.
  run "criar usuário atlas" adduser --disabled-password --gecos "" atlas
  run "adicionar atlas ao sudo" usermod -aG sudo atlas
else
  ok "usuário atlas já existe"
fi

if ! ufw status | grep -q "Status: active"; then
  run "firewall: permitir SSH"  ufw allow OpenSSH
  run "firewall: permitir HTTP" ufw allow 80/tcp
  run "firewall: permitir HTTPS" ufw allow 443/tcp
  run "firewall: habilitar" ufw --force enable
else
  ok "firewall já ativo"
fi

run "timezone" timedatectl set-timezone America/Sao_Paulo

# ============================================================
# PASSO 2 — Node 20 LTS + PM2
# ============================================================
log "2. Node 20 LTS + PM2"
if ! command -v node >/dev/null 2>&1; then
  run "adicionar repositório NodeSource" bash -c 'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -'
  run "instalar nodejs" apt-get -y install nodejs
fi
NODE_V=$(node -v)
case "$NODE_V" in
  v20.*) ok "Node $NODE_V" ;;
  *) die "Node instalado não é v20.x (encontrado: $NODE_V)" ;;
esac
run "instalar PM2 global" npm install -g pm2

MEM_MB=$(free -m | awk '/^Mem:/{print $2}')
if [ "$MEM_MB" -lt 3000 ] && ! swapon --show | grep -q /swapfile; then
  log "RAM ${MEM_MB}MB < 3GB — criando swap de 2GB"
  run "criar swapfile"  fallocate -l 2G /swapfile
  run "permissões swap" chmod 600 /swapfile
  run "formatar swap"   mkswap /swapfile
  run "ativar swap"     swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ============================================================
# PASSO 3 — Extrair ZIP
# ============================================================
log "3. Extrair pacote"
[ -f "$ZIP" ] || die "ZIP não encontrado em $ZIP — envie com scp antes de rodar este script"
mkdir -p "$APPDIR"
chown atlas:atlas "$APPDIR"
run "extrair ZIP" su - atlas -c "cd '$APPDIR' && unzip -o '$ZIP'"
[ -f "$APPDIR/package.json" ] || die "package.json não está na raiz de $APPDIR após extrair (ZIP corrompido ou errado?)"
ok "pacote extraído em $APPDIR"

# ============================================================
# PASSO 4 — Validar .env
# ============================================================
log "4. Validar .env"
[ -f "$APPDIR/.env" ] || die "$APPDIR/.env não existe. Envie com scp ANTES de rodar este script:  scp .env.hostinger root@<ip>:$APPDIR/.env"
MISSING=()
for var in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY DATABASE_URL ATLAS_CRON_SECRET OPENAI_API_KEY ATLAS_BASE_URL; do
  if ! grep -qE "^${var}=.+" "$APPDIR/.env"; then
    MISSING+=("$var")
  fi
done
if [ "${#MISSING[@]}" -gt 0 ]; then
  die "variáveis obrigatórias ausentes/vazias no .env: ${MISSING[*]}"
fi
chown atlas:atlas "$APPDIR/.env"
chmod 600 "$APPDIR/.env"
ok ".env validado (${#MISSING[@]} pendências)"

# ============================================================
# PASSO 5 — Build (o ponto que mais falha — agora com log completo)
# ============================================================
log "5. npm ci (pode levar alguns minutos)"
run "npm ci" su - atlas -c "cd '$APPDIR' && npm ci"

log "5b. prisma generate"
run "prisma generate" su - atlas -c "cd '$APPDIR' && npm run prisma:generate"

log "5c. next build (pode levar vários minutos — sem saída até terminar é normal)"
if [ "$MEM_MB" -lt 3000 ]; then
  run "next build (memória limitada)" su - atlas -c "cd '$APPDIR' && NODE_OPTIONS=--max-old-space-size=1536 npm run build"
else
  run "next build" su - atlas -c "cd '$APPDIR' && npm run build"
fi
[ -d "$APPDIR/.next" ] || die "build terminou mas .next não foi gerado"
ok "build completo"

# ============================================================
# PASSO 6 — PM2 (start-or-restart idempotente, sempre como atlas)
# ============================================================
log "6. PM2"
mkdir -p "$APPDIR/logs"
chown atlas:atlas "$APPDIR/logs"
run "iniciar/reiniciar app no PM2" su - atlas -c "cd '$APPDIR' && (pm2 describe atlas-v3-homolog >/dev/null 2>&1 && pm2 restart atlas-v3-homolog --update-env || pm2 start ecosystem.config.cjs)"
run "salvar processlist do PM2" su - atlas -c "pm2 save"

log "  aguardando app abrir a porta 3000..."
UP=0
for i in $(seq 1 15); do
  if curl -sS -m 3 -o /dev/null http://localhost:3000 2>/dev/null; then
    UP=1
    break
  fi
  sleep 2
done
if [ "$UP" = "1" ]; then
  ok "app respondendo em http://localhost:3000"
else
  warn "app ainda não respondeu em localhost:3000 após 30s — verifique: su - atlas -c 'pm2 logs atlas-v3-homolog --lines 50 --nostream'"
fi

# ============================================================
# PASSO 7 — Nginx
# ============================================================
log "7. Nginx (proxy reverso)"
run "instalar nginx" apt-get -y install nginx
tee /etc/nginx/sites-available/atlas >/dev/null <<'NGINX'
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

# Os blocos 443 acima referenciam certificados que ainda não existem antes do
# certbot rodar — nginx -t vai falhar até o passo 8. Serve só :80 por enquanto.
if nginx -t >>"$LOGFILE" 2>&1; then
  run "recarregar nginx" systemctl reload nginx
  ok "nginx configurado (80 + 443)"
else
  log "  certificado ainda não existe — servindo só :80 até o certbot (passo 8) rodar"
  tee /etc/nginx/sites-available/atlas-bootstrap >/dev/null <<'NGINXBOOT'
server {
    listen 80; listen [::]:80;
    server_name atlasaios.com.br www.atlasaios.com.br;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINXBOOT
  rm -f /etc/nginx/sites-enabled/atlas
  ln -sf /etc/nginx/sites-available/atlas-bootstrap /etc/nginx/sites-enabled/atlas-bootstrap
  run "validar nginx (bootstrap :80)" nginx -t
  run "recarregar nginx" systemctl reload nginx
  ok "nginx servindo :80 (bootstrap) — certbot troca para 443 no próximo passo"
fi

# ============================================================
# PASSO 8 — SSL Let's Encrypt
# ============================================================
log "8. SSL (Let's Encrypt / certbot)"
run "instalar certbot" apt-get -y install certbot python3-certbot-nginx

log "  validando domínio via HTTP-01 (exige DNS já propagado)"
if run "emitir certificado" certbot --nginx -d atlasaios.com.br -d www.atlasaios.com.br --redirect --agree-tos -m "$EMAIL" --no-eff-email --non-interactive; then
  rm -f /etc/nginx/sites-enabled/atlas-bootstrap
  ln -sf /etc/nginx/sites-available/atlas /etc/nginx/sites-enabled/atlas
  run "validar nginx (com SSL)" nginx -t
  run "recarregar nginx" systemctl reload nginx
  ok "SSL ativo — https://atlasaios.com.br"
else
  warn "certbot falhou — app continua acessível via HTTP (porta 80). Rode manualmente depois: certbot --nginx -d atlasaios.com.br -d www.atlasaios.com.br --redirect --agree-tos -m $EMAIL --no-eff-email"
fi

# ============================================================
# PASSO 9 — Cron dos workers
# ============================================================
log "9. Cron dos workers"
CRON_CMD='*/2 * * * * cd /var/www/atlas && set -a && . ./.env && set +a && /usr/bin/node scripts/run-workers.mjs >> /var/www/atlas/logs/workers.log 2>&1'
EXISTING_CRON=$(su - atlas -c "crontab -l" 2>/dev/null || true)
if echo "$EXISTING_CRON" | grep -q "run-workers.mjs"; then
  ok "cron dos workers já configurado"
else
  printf '%s\n%s\n' "$EXISTING_CRON" "$CRON_CMD" | su - atlas -c "crontab -"
  ok "cron dos workers instalado (a cada 2 min)"
fi

# ============================================================
# PASSO 10 — PM2 auto-startup no boot
# ============================================================
log "10. PM2 auto-startup"
STARTUP_CMD=$(su - atlas -c "pm2 startup systemd -u atlas --hp /home/atlas" 2>/dev/null | grep '^sudo ' || true)
if [ -n "$STARTUP_CMD" ]; then
  run "instalar serviço systemd do PM2" bash -c "$STARTUP_CMD"
  ok "PM2 configurado para iniciar no boot"
else
  warn "não foi possível gerar o comando de startup do PM2 — rode manualmente: su - atlas -c 'pm2 startup systemd -u atlas --hp /home/atlas'"
fi

# ============================================================
# SMOKE TEST LOCAL
# ============================================================
log "11. Smoke test local"
for path in / /api/health /api/ready; do
  code=$(curl -sS -m 6 -o /dev/null -w "%{http_code}" -H "Host: atlasaios.com.br" "http://localhost:3000$path" 2>/dev/null || echo "000")
  if [ "$code" != "000" ]; then
    ok "http://localhost:3000$path -> HTTP $code"
  else
    warn "http://localhost:3000$path -> sem resposta"
  fi
done

# ============================================================
# RESUMO
# ============================================================
log "✅ GO-LIVE CONCLUÍDO"
cat <<SUMMARY

Log completo salvo em: $LOGFILE

PRÓXIMO (fora do VPS):
 1. Aplicar migrations Supabase:
      cd ~/atlas-v3 && supabase link --project-ref ietwopslgqxlenfyghqk && supabase db push
 2. Configurar SMTP no Supabase Auth (Authentication -> SMTP Settings)
 3. Ligar "Leaked Password Protection" (Authentication -> Password Security)
 4. Testar: https://atlasaios.com.br/login

Diagnóstico rápido a qualquer momento:
 su - atlas -c 'pm2 status'
 su - atlas -c 'pm2 logs atlas-v3-homolog --lines 50 --nostream'
 systemctl status nginx
 tail -50 $LOGFILE

Domínio: https://atlasaios.com.br
SUMMARY
