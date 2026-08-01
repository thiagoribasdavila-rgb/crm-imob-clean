#!/usr/bin/env bash
# GARANTE O PROCESSO DA APLICACAO (PM2). Nao instala workers separados: os workers
# do Atlas sao ROTAS HTTP chamadas pelo cron — ver config/workers-schedule.json.
# Uso: bash scripts/operations/install-workers.sh [--dry-run]
source "$(dirname "$0")/_comum.sh"
exigir_servidor
command -v pm2 >/dev/null 2>&1 || c_die "pm2 ausente. Instale com: npm i -g pm2"
[ -f "$APPDIR/ecosystem.config.cjs" ] || c_die "ecosystem.config.cjs nao encontrado em $APPDIR"

c_info "processos PM2 atuais:"; pm2 list 2>/dev/null | sed 's/^/    /' | head -12 || true

# Idempotente: `startOrReload` sobe se nao existe e recarrega sem derrubar se existe.
run "cd '$APPDIR' && pm2 startOrReload ecosystem.config.cjs --update-env"
run "pm2 save"
# Sobrevive a reinicializacao. `pm2 startup` imprime um comando que precisa de sudo;
# nao o executamos por conta propria.
if [ "$DRY_RUN" = "0" ]; then
  c_info "para sobreviver a reinicializacao, rode o que este comando imprimir:"
  pm2 startup 2>/dev/null | tail -2 | sed 's/^/    /' || c_warn "pm2 startup nao respondeu"
fi
c_ok "processo garantido"
