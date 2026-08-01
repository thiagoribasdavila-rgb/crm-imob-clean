#!/usr/bin/env bash
# ROLLBACK — desfaz o que os scripts desta pasta fizeram, um alvo por vez.
# Uso:
#   bash scripts/operations/rollback.sh --religar-fila
#   bash scripts/operations/rollback.sh --cron <arquivo-de-backup>
#   bash scripts/operations/rollback.sh --listar-backups
source "$(dirname "$0")/_comum.sh"
ALVO="${1:-}"
case "$ALVO" in
  --listar-backups)
    c_info "backups de crontab:"; ls -1t /tmp/atlas-crontab-antes-*.txt 2>/dev/null | sed 's/^/    /' || echo "    (nenhum)"
    c_info "backups de .env:"; ls -1t /tmp/atlas-env-antes-parada-*.bak 2>/dev/null | sed 's/^/    /' || echo "    (nenhum)"
    exit 0 ;;
  --religar-fila)
    exigir_servidor
    [ -f "$APPDIR/.env" ] || c_die "$APPDIR/.env nao existe"
    grep -q '^ATLAS_OUTBOX_PAUSADO=' "$APPDIR/.env" || { c_warn "a fila nao esta pausada"; exit 0; }
    run "sed -i.tmp '/^ATLAS_OUTBOX_PAUSADO=/d;/^ATLAS_OUTBOX_PAUSADO_MOTIVO=/d' '$APPDIR/.env' && rm -f '$APPDIR/.env.tmp'"
    command -v pm2 >/dev/null 2>&1 && run "pm2 reload all --update-env" || c_warn "reinicie a aplicacao"
    [ "$DRY_RUN" = "1" ] && { c_ok "dry-run"; exit 0; }
    c_ok "fila religada"
    c_info "confirme: bash scripts/operations/health-check.sh  → estado deve sair de paused_by_kill_switch"
    exit 0 ;;
  --cron)
    exigir_servidor
    ARQ="${2:-}"; [ -f "$ARQ" ] || c_die "informe um backup existente. Veja: rollback.sh --listar-backups"
    c_info "restaurando crontab de $ARQ ($(wc -l < "$ARQ" | tr -d ' ') linhas)"
    run "crontab '$ARQ'"
    [ "$DRY_RUN" = "1" ] && { c_ok "dry-run"; exit 0; }
    c_ok "crontab restaurado — $(crontab -l 2>/dev/null | grep -c atlasaios || echo 0) entrada(s) Atlas agora"
    exit 0 ;;
  *) c_die "alvo obrigatorio: --religar-fila | --cron <backup> | --listar-backups" ;;
esac
