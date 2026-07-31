#!/usr/bin/env bash
# PRE-VALIDACAO — responde "esta maquina pode receber a instalacao?" sem alterar nada.
# Uso: bash scripts/operations/preflight.sh
# Saida: 0 pronto · 1 impedimento · 2 avisos sem impedimento
source "$(dirname "$0")/_comum.sh"
c_info "Pre-validacao — nenhuma alteracao sera feita."
FALHAS=0; AVISOS=0
falha(){ c_die_soft(){ :; }; printf '\033[1;31m  ✘ %s\033[0m\n' "$*"; FALHAS=$((FALHAS+1)); }
aviso(){ printf '\033[1;33m  ⚠ %s\033[0m\n' "$*"; AVISOS=$((AVISOS+1)); }
ok(){ printf '\033[1;32m  ✔ %s\033[0m\n' "$*"; }

echo; c_info "1. Identidade da maquina"
echo "     host=$(hostname) so=$(uname -s) usuario=$(id -un)"
case "$(uname -s)" in
  Linux) ok "Linux" ;;
  *) falha "$(uname -s) e maquina de desenvolvimento — a instalacao sera recusada" ;;
esac
[ -d "$APPDIR" ] && ok "$APPDIR existe" || falha "$APPDIR nao existe"

echo; c_info "2. Ferramentas"
for b in node npm curl crontab; do command -v "$b" >/dev/null 2>&1 && ok "$b: $(command -v $b)" || falha "$b ausente"; done
if command -v node >/dev/null 2>&1; then
  V=$(node -v | sed 's/v//;s/\..*//'); [ "$V" -ge 20 ] && ok "Node $(node -v)" || falha "Node $(node -v) — minimo v20"
fi

echo; c_info "3. Variaveis obrigatorias (existencia, NUNCA valor)"
if [ -f "$APPDIR/.env" ]; then
  for v in NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY ATLAS_CRON_SECRET ATLAS_BASE_URL; do
    tem_var "$v" && ok "$v presente" || falha "$v ausente ou vazia"
  done
  # Placeholder passa por "preenchida": foi assim que META_APP_SECRET com 9 chars
  # (^[A-Z_]+$) sobreviveu a checagem antiga.
  for v in META_APP_SECRET WHATSAPP_ACCESS_TOKEN ATLAS_CRON_SECRET; do
    val=$(grep "^${v}=" "$APPDIR/.env" 2>/dev/null | cut -d= -f2- || true)
    [ -z "$val" ] && continue
    printf '%s' "$val" | grep -qE '^[A-Z_]+$' && falha "$v parece PLACEHOLDER (${#val} chars, so maiusculas)"
    [ "${#val}" -lt 16 ] && aviso "$v tem so ${#val} caracteres"
  done
else
  falha "$APPDIR/.env nao existe — crie NO SERVIDOR, variavel por variavel"
fi

echo; c_info "4. Logs"
[ -d "$LOGDIR" ] && ok "$LOGDIR existe" || aviso "$LOGDIR nao existe (install-cron cria)"

echo; c_info "5. Cron atual"
N=$(crontab -l 2>/dev/null | grep -c "atlasaios.com.br" || true)
[ "$N" = "0" ] && ok "nenhuma entrada Atlas (instalacao limpa)" || aviso "$N entrada(s) Atlas ja instalada(s) — install-cron e idempotente"
T=$(crontab -l 2>/dev/null | grep -cvE '^\s*$|^\s*#' || true)
c_info "     total de linhas no crontab: ${T:-0} (nenhuma sera removida)"

echo; c_info "6. Aplicacao responde?"
if curl -fsS --max-time 10 "$BASE_URL/api/health" >/dev/null 2>&1; then ok "$BASE_URL/api/health responde"; else aviso "$BASE_URL/api/health nao respondeu"; fi

echo
[ "$FALHAS" -gt 0 ] && { printf '\033[1;31m✘ %s impedimento(s) · %s aviso(s) — NAO instale\033[0m\n' "$FALHAS" "$AVISOS"; exit 1; }
[ "$AVISOS" -gt 0 ] && { printf '\033[1;33m⚠ pronto com %s aviso(s)\033[0m\n' "$AVISOS"; exit 2; }
c_ok "pronto para instalar"; exit 0
