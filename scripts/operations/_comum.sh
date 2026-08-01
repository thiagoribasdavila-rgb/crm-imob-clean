#!/usr/bin/env bash
# Base compartilhada dos scripts operacionais.
#
# POR QUE EXISTE: sete scripts que repetissem cores, checagem de host e leitura de
# .env divergiriam no primeiro conserto — e "duas verdades sobre o mesmo fato" é a
# classe de defeito que este projeto mais paga. Aqui a decisão mora num lugar só.
set -euo pipefail

APPDIR="${ATLAS_APP_DIR:-/var/www/atlas}"
BASE_URL="${ATLAS_BASE_URL:-https://atlasaios.com.br}"
LOGDIR="${ATLAS_LOG_DIR:-/var/log/atlas}"
DRY_RUN=0
for arg in "$@"; do [ "$arg" = "--dry-run" ] && DRY_RUN=1; done

c_ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
c_info() { printf '\033[1;36m· %s\033[0m\n' "$*"; }
c_warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
c_die()  { printf '\033[1;31m✘ %s\033[0m\n' "$*" >&2; exit 1; }
c_dry()  { printf '\033[1;35m[dry-run] %s\033[0m\n' "$*"; }

# Executa, ou apenas mostra em dry-run. Todo efeito passa por aqui.
run() { if [ "$DRY_RUN" = "1" ]; then c_dry "$*"; else eval "$@"; fi }

# NUNCA imprime valor de segredo — só se existe.
tem_var() { grep -qE "^${1}=.+" "$APPDIR/.env" 2>/dev/null; }

# Recusa rodar fora do servidor. Em 2026-07-30 um crontab com 11 workers
# comerciais apontando para PRODUCAO foi instalado num Mac de desenvolvimento.
exigir_servidor() {
  case "$(uname -s)" in
    Darwin|MINGW*|MSYS*|CYGWIN*) c_die "$(uname -s) e maquina de desenvolvimento. Estes scripts sao do SERVIDOR." ;;
  esac
  [ -d "$APPDIR" ] || c_die "$APPDIR nao existe — esta maquina nao hospeda a aplicacao."
}
