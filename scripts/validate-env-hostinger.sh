#!/usr/bin/env bash
# Valida .env.hostinger antes de enviar pro VPS
# Uso: bash scripts/validate-env-hostinger.sh

set -euo pipefail

ENV_FILE=".env.hostinger"
log() { printf '\033[1;36m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠️  %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die ".env.hostinger não encontrado"

log "Validando $ENV_FILE…"

# Obrigatórias
REQUIRED=("NEXT_PUBLIC_SUPABASE_URL" "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" "SUPABASE_SERVICE_ROLE_KEY" "DATABASE_URL" "ATLAS_CRON_SECRET" "ATLAS_BOOTSTRAP_SECRET" "OPENAI_API_KEY" "ATLAS_BASE_URL" "NEXT_PUBLIC_APP_URL")

for var in "${REQUIRED[@]}"; do
  if ! grep -q "^$var=" "$ENV_FILE"; then
    die "$var não encontrado no .env.hostinger"
  fi
  val=$(grep "^$var=" "$ENV_FILE" | cut -d= -f2-)
  if [ -z "$val" ]; then
    die "$var está vazio"
  fi
done

log "✅ Todas as variáveis obrigatórias preenchidas"

# Validações extras
# ── ESTE BLOCO CERTIFICAVA O ERRO COMO ACERTO ────────────────────────────────
#
# Ele registrava "DATABASE_URL parece correto" quando ela apontava para o projeto
# LEGADO (24 tabelas, 17.151 leads reais). Um validador que aprova o banco errado
# é pior que validador nenhum: ele produz confiança.
#
# O ref canônico vem de config/supabase-projetos.json, e o aposentado é REPROVADO
# por nome — porque apontar para ele não é "talvez errado", é errado.
CANONICO="$(node -p "require('./config/supabase-projetos.json').canonico.ref" 2>/dev/null)"
APOSENTADOS="$(node -p "require('./config/supabase-projetos.json').aposentados.map(p=>p.ref).join(' ')" 2>/dev/null)"

if [ -z "$CANONICO" ]; then
  warn "não consegui ler o projeto canônico de config/supabase-projetos.json — NÃO validei o banco"
else
  DB_LINE="$(grep "^DATABASE_URL=" "$ENV_FILE" || true)"
  for velho in $APOSENTADOS; do
    if printf '%s' "$DB_LINE" | grep -q "$velho"; then
      warn "DATABASE_URL aponta para o projeto APOSENTADO $velho — ele tem dado real e NÃO recebe deploy. Use $CANONICO."
    fi
  done
  if printf '%s' "$DB_LINE" | grep -q "$CANONICO.*pooler"; then
    log "DATABASE_URL aponta para o projeto canônico ($CANONICO, pooler)"
  else
    warn "DATABASE_URL não aponta para o canônico $CANONICO com 'pooler'"
  fi
fi

if grep "^ATLAS_BASE_URL=https://atlasaios.com.br" "$ENV_FILE" >/dev/null; then
  log "ATLAS_BASE_URL = domínio oficial"
else
  warn "ATLAS_BASE_URL não é o domínio oficial (https://atlasaios.com.br)"
fi

if grep "^OPENAI_API_KEY=sk-" "$ENV_FILE" >/dev/null; then
  log "OPENAI_API_KEY presente"
else
  warn "OPENAI_API_KEY não parece ser OpenAI (esperado sk-…)"
fi

log "✅ Validação completa. Pronto para enviar ao VPS"
