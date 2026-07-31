#!/usr/bin/env bash
# INSTALA O AGENDAMENTO — idempotente, preserva terceiros, recusa fora do servidor.
# Uso: bash scripts/operations/install-cron.sh [--dry-run]
source "$(dirname "$0")/_comum.sh"
exigir_servidor
[ -n "${ATLAS_AUTORIZA_INSTALAR_CRON:-}" ] || c_die 'falta ATLAS_AUTORIZA_INSTALAR_CRON="eu-confirmo-que-este-e-o-servidor"'
[ "$ATLAS_AUTORIZA_INSTALAR_CRON" = "eu-confirmo-que-este-e-o-servidor" ] || c_die "autorizacao incorreta (o valor e uma frase, nao 1)"

REPO="${ATLAS_REPO_DIR:-$APPDIR}"
[ -f "$REPO/scripts/gera-crontab-dos-workers.mjs" ] || c_die "gerador nao encontrado em $REPO"

BACKUP="/tmp/atlas-crontab-antes-$(date +%Y%m%d-%H%M%S).txt"
crontab -l > "$BACKUP" 2>/dev/null || : > "$BACKUP"
c_info "backup: $BACKUP ($(wc -l < "$BACKUP" | tr -d ' ') linhas)"

NOVO=$(cd "$REPO" && node scripts/gera-crontab-dos-workers.mjs)
echo "$NOVO" | grep -q "ATLAS ONE" || c_die "gerador nao produziu o bloco esperado"

# IDEMPOTENTE: remove so o bloco Atlas anterior e reescreve. Nunca `crontab -r`,
# que apagaria agendamento de terceiro — estrago silencioso num servidor
# compartilhado, que so aparece quando a tarefa do outro deixa de rodar.
PRESERVADAS=$(grep -v "atlasaios.com.br" "$BACKUP" | grep -vE '^# ATLAS ONE|^# GERADO por scripts/gera-crontab' || true)
N_PRES=$(printf '%s' "$PRESERVADAS" | grep -cvE '^\s*$|^\s*#' || true)
c_info "linhas de terceiros preservadas: ${N_PRES:-0}"

run "mkdir -p '$LOGDIR'"
if [ "$DRY_RUN" = "1" ]; then
  c_dry "instalaria $(echo "$NOVO" | grep -c 'atlasaios.com.br') entradas"
  echo "$NOVO" | grep 'atlasaios.com.br' | sed 's/^/    /' | cut -c1-100
  c_ok "dry-run concluido — nada foi alterado"; exit 0
fi

TMP=$(mktemp)
{ printf '%s\n' "$PRESERVADAS"; printf '\n%s\n' "$NOVO"; } > "$TMP"
crontab "$TMP"; rm -f "$TMP"

INST=$(crontab -l 2>/dev/null | grep -c "atlasaios.com.br" || true)
c_ok "instalado: $INST entrada(s)"
crontab -l | grep -oE '/var/log/atlas/[a-z-]+\.log' | sed 's|.*/||;s|\.log||' | sort -u | tr '\n' ' ' | sed 's/^/  workers: /'; echo
c_warn "A PROVA nao e este comando ter saido certo. E o efeito:"
echo "    bash scripts/operations/verify-after-5-minutes.sh"
c_info "rollback: crontab $BACKUP"
