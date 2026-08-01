#!/usr/bin/env bash
# DIAGNOSTICO — reune num lugar so o que se pergunta durante um incidente.
# Somente leitura. Nao imprime valor de segredo.
# Uso: bash scripts/operations/diagnostico.sh
source "$(dirname "$0")/_comum.sh"
echo "=== MAQUINA ==="; echo "  host=$(hostname) so=$(uname -s) usuario=$(id -un) data=$(date -u +%FT%TZ)"
echo; echo "=== APLICACAO ==="
if command -v pm2 >/dev/null 2>&1; then pm2 list 2>/dev/null | sed 's/^/  /' | head -10; else echo "  pm2 ausente"; fi
echo; echo "=== CRON ATLAS ==="
N=$(crontab -l 2>/dev/null | grep -c atlasaios || true); echo "  entradas: ${N:-0}"
crontab -l 2>/dev/null | grep atlasaios | sed 's|.*/api|  /api|' | cut -c1-70 || true
echo; echo "=== ULTIMAS LINHAS DOS LOGS ==="
if [ -d "$LOGDIR" ]; then for l in "$LOGDIR"/*.log; do [ -f "$l" ] || continue; echo "  --- $(basename "$l") ---"; tail -3 "$l" 2>/dev/null | sed 's/^/      /'; done
else echo "  $LOGDIR nao existe"; fi
echo; echo "=== PRONTIDAO ==="; bash "$(dirname "$0")/health-check.sh" 2>&1 | sed 's/^/  /' || true
echo; echo "=== VARIAVEIS (existencia, NUNCA valor) ==="
if [ -f "$APPDIR/.env" ]; then
  for v in NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY ATLAS_CRON_SECRET ATLAS_BASE_URL META_APP_SECRET ATLAS_OUTBOX_PAUSADO; do
    tem_var "$v" && echo "  $v: presente" || echo "  $v: AUSENTE"
  done
else echo "  $APPDIR/.env nao existe"; fi
