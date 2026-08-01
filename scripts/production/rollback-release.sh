#!/usr/bin/env bash
# ROLLBACK — volta para a release anterior. Idempotente.
#
#   bash rollback-release.sh            # volta para a anterior registrada
#   bash rollback-release.sh <caminho>  # volta para uma release específica
#
# Não apaga nada. Só reaponta o symlink e recarrega o processo — que é o inverso
# exato da troca, e por isso volta no mesmo tempo que levou para ir.
set -euo pipefail
RAIZ="${ATLAS_RAIZ:-/opt/atlas-one}"
PORTA="${ATLAS_PORTA:-3000}"
ALVO="${1:-$(cat "$RAIZ/shared/release-anterior.txt" 2>/dev/null || true)}"

[ -n "$ALVO" ] || { echo "✘ nenhuma release anterior registrada."; echo "  disponíveis:"; ls -1t "$RAIZ/releases" 2>/dev/null | head -5 | sed 's/^/    /'; exit 1; }
[ -d "$ALVO" ] || { echo "✘ a release '$ALVO' não existe."; exit 1; }

ATUAL="$(readlink -f "$RAIZ/current" 2>/dev/null || echo '')"
echo "de: ${ATUAL:-nenhuma}"
echo "para: $ALVO"

# Guarda a atual como "anterior" para que o rollback do rollback funcione.
echo "$ATUAL" > "$RAIZ/shared/release-anterior.txt"
ln -sfn "$ALVO" "$RAIZ/current"
pm2 restart atlas-one --update-env >/dev/null 2>&1 || pm2 start npm --name atlas-one --cwd "$RAIZ/current" -- start -- -p "$PORTA" >/dev/null
pm2 save >/dev/null
sleep 10

SAUDE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORTA}/api/v1/ready" || echo 000)
echo "health após rollback: HTTP $SAUDE"
[ "$SAUDE" = "200" ] && echo "ROLLBACK CONCLUÍDO." || { echo "✘ a release anterior TAMBÉM não responde. Investigue antes de outra troca."; exit 1; }
