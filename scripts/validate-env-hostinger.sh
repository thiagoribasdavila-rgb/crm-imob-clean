#!/usr/bin/env bash
# Valida .env.hostinger antes de enviar pro VPS
# Uso: bash scripts/validate-env-hostinger.sh

set -euo pipefail

# Sobrescrevível para que o próprio validador possa ser TESTADO contra um arquivo
# de controle. Sem isto não há como provar que ele APROVA credencial válida — só
# que reprova a inválida, que é metade da prova. Padrão continua o de produção.
ENV_FILE="${ENV_FILE:-.env.hostinger}"
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

# ── PLACEHOLDER PASSA POR "PREENCHIDO" ──────────────────────────────────────
#
# O laço acima só reprova valor VAZIO. Medido em 2026-07-30 neste mesmo arquivo:
#
#   META_APP_SECRET ......... 9 caracteres, casando ^[A-Z_]+$   (placeholder)
#   WHATSAPP_ACCESS_TOKEN ... 0 caracteres
#
# E `META_APP_SECRET` nem estava na lista REQUIRED. O resultado é um validador
# que diz "todas preenchidas" sobre uma credencial que derruba a integração.
#
# Provado assinando o mesmo payload contra /api/webhooks/meta em produção:
#   placeholder de 9 chars ....... HTTP 401 invalid_signature
#   segredo real de 32 chars ..... HTTP 200
#
# O segredo VIVO no servidor é válido. O perigo é o procedimento de deploy
# copiar este arquivo por cima dele — ver docs/GO_LIVE_SEQUENCE.md.
#
# A regra abaixo é estreita de propósito: reprova o que TEM CARA de placeholder,
# não o que é apenas curto. Segredo real não é escrito em MAIÚSCULAS_COM_UNDERSCORE.
CREDENCIAIS=("META_APP_SECRET" "META_VERIFY_TOKEN" "WHATSAPP_ACCESS_TOKEN" "SUPABASE_SERVICE_ROLE_KEY" "ATLAS_CRON_SECRET" "ATLAS_BOOTSTRAP_SECRET" "OPENAI_API_KEY")
COMPRIMENTO_MINIMO=16

falhas_de_credencial=0
for var in "${CREDENCIAIS[@]}"; do
  linha=$(grep "^$var=" "$ENV_FILE" 2>/dev/null || true)
  [ -z "$linha" ] && continue          # ausente não é assunto deste bloco
  val=$(printf '%s' "$linha" | cut -d= -f2-)
  n=${#val}

  if [ "$n" -eq 0 ]; then
    warn "$var está VAZIO — o deploy não pode publicar credencial em branco"
    falhas_de_credencial=$((falhas_de_credencial + 1))
    continue
  fi
  # MAIÚSCULAS_E_UNDERSCORE é a assinatura de placeholder deste repositório.
  if printf '%s' "$val" | grep -qE '^[A-Z_]+$'; then
    warn "$var parece PLACEHOLDER ($n chars, só maiúsculas e underscore) — substituir por credencial real ou remover a linha"
    falhas_de_credencial=$((falhas_de_credencial + 1))
    continue
  fi
  # Formas explícitas de "preencha aqui".
  if printf '%s' "$val" | grep -qiE 'your[-_]|change[-_]?me|placeholder|xxxx|<[^>]+>'; then
    warn "$var contém marcador de preenchimento — substituir por credencial real"
    falhas_de_credencial=$((falhas_de_credencial + 1))
    continue
  fi
  if [ "$n" -lt "$COMPRIMENTO_MINIMO" ]; then
    warn "$var tem apenas $n caracteres (mínimo $COMPRIMENTO_MINIMO para credencial) — conferir se é o valor real"
    falhas_de_credencial=$((falhas_de_credencial + 1))
  fi
done

if [ "$falhas_de_credencial" -gt 0 ]; then
  die "$falhas_de_credencial credencial(is) inválida(s). Publicar assim SUBSTITUI a credencial que funciona no servidor por uma que não funciona — é pior que não publicar."
fi

log "✅ Nenhuma credencial vazia, placeholder ou truncada"

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
