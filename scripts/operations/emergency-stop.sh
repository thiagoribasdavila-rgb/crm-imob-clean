#!/usr/bin/env bash
# DESLIGAMENTO EMERGENCIAL — para a fila SEM desinstalar o agendamento.
#
# POR QUE NAO DESINSTALA O CRON: em 2026-07-30 a fila ficou 44h49m parada, e o
# padrao por tras disso e sempre o mesmo — alguem desliga para conter um incidente e
# ninguem lembra de religar. Este script PAUSA de forma declarada e VISIVEL em
# /api/v1/ready. Pausa silenciosa e indistinguivel de pane.
#
# Uso: bash scripts/operations/emergency-stop.sh "motivo obrigatorio" [--dry-run]
source "$(dirname "$0")/_comum.sh"
exigir_servidor
MOTIVO="${1:-}"
[ -n "$MOTIVO" ] && [ "$MOTIVO" != "--dry-run" ] || c_die 'motivo obrigatorio: bash emergency-stop.sh "por que voce esta pausando"'
[ -f "$APPDIR/.env" ] || c_die "$APPDIR/.env nao existe"

BACKUP="/tmp/atlas-env-antes-parada-$(date +%Y%m%d-%H%M%S).bak"
run "cp '$APPDIR/.env' '$BACKUP'"
c_info "backup do .env: $BACKUP"

# Idempotente: remove linha anterior antes de acrescentar.
run "sed -i.tmp '/^ATLAS_OUTBOX_PAUSADO=/d;/^ATLAS_OUTBOX_PAUSADO_MOTIVO=/d' '$APPDIR/.env' && rm -f '$APPDIR/.env.tmp'"
run "printf 'ATLAS_OUTBOX_PAUSADO=1\nATLAS_OUTBOX_PAUSADO_MOTIVO=%s\n' \"\$(printf '%s' \"$MOTIVO\" | tr -d '\n')\" >> '$APPDIR/.env'"
command -v pm2 >/dev/null 2>&1 && run "pm2 reload all --update-env" || c_warn "pm2 ausente — reinicie a aplicacao para a pausa valer"

[ "$DRY_RUN" = "1" ] && { c_ok "dry-run — nada alterado"; exit 0; }
c_ok "FILA PAUSADA. Motivo: $MOTIVO"
c_warn "A pausa NAO cancela o que ja esta na fila — ela para de drenar."
c_info "confirme:  bash scripts/operations/health-check.sh"
c_info "  esperado: estado = paused_by_kill_switch (NAO unhealthy)"
c_info "religar:   bash scripts/operations/rollback.sh --religar-fila"
