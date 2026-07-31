#!/usr/bin/env bash
# VERIFICAÇÃO PÓS-DEPLOY — os 6 sinais, na ordem em que importam.
#
#   bash post-deploy-check.sh https://atlasaios.com.br <commit-esperado>
#
# O comando ter rodado nunca é a prova. Cada item abaixo tem um sinal objetivo.
set -uo pipefail
BASE="${1:?uso: post-deploy-check.sh <url> <commit>}"
ESPERADO="${2:?informe o commit esperado}"
falhas=0

echo "1. A aplicação responde?"
bash "$(dirname "$0")/smoke-test.sh" "$BASE" || falhas=$((falhas+1))

echo
echo "2. O commit no ar é o aprovado?"
NO_AR=$(curl -s --max-time 20 "${BASE}/api/v1/ready" | grep -o '"commit":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
echo "   esperado: ${ESPERADO}"
echo "   no ar:    ${NO_AR:-AUSENTE}"
case "${NO_AR:-}" in "${ESPERADO}"*) echo "   ✔ confere" ;; *) echo "   ✘ DIVERGENTE"; falhas=$((falhas+1)) ;; esac

echo
echo "3. O processo está registrado e sobrevive a reboot?"
pm2 list 2>/dev/null | grep -q atlas-one && echo "   ✔ atlas-one no PM2" || { echo "   ✘ ausente do PM2"; falhas=$((falhas+1)); }
systemctl is-enabled pm2-* >/dev/null 2>&1 && echo "   ✔ PM2 habilitado no boot" || echo "   • PM2 não habilitado no boot — rode: pm2 startup && pm2 save"

echo
echo "4. O agendamento está instalado?"
N=$(crontab -l 2>/dev/null | grep -c atlas || echo 0)
[ "$N" -ge 13 ] && echo "   ✔ ${N} linhas de cron" || echo "   • ${N} de 13 workers agendados"

echo
echo "5. A fila drena SOZINHA? — o único sinal que importa"
echo "   rode: bash scripts/operations/verify-after-5-minutes.sh"
echo "   um evento precisa sair de attempts=1 sem ninguém mandar."

echo
echo "6. Sobrevive a reinício do processo?"
echo "   rode: pm2 restart atlas-one && sleep 15 && bash $(dirname "$0")/smoke-test.sh '$BASE'"

echo
[ "$falhas" -eq 0 ] && echo "PÓS-DEPLOY APROVADO nos itens automáticos." || { echo "PÓS-DEPLOY REPROVADO: ${falhas} item(ns). Considere rollback."; exit 1; }
