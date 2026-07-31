#!/usr/bin/env bash
# DEPLOY POR RELEASE IMUTÁVEL COM TROCA ATÔMICA.
#
#   bash deploy-release.sh <artefato.zip> <commit-curto>
#
# ── O DESENHO, E POR QUE ELE É ASSIM ────────────────────────────────────────
#
# Cada release vive num diretório próprio, identificado por data e commit. O
# `current` é um symlink. A troca é `ln -sfn` seguido de `pm2 reload` — atômica:
# não existe instante em que `current` aponte para lugar nenhum.
#
# A release anterior NÃO é apagada. É ela que o rollback restaura, e apagá-la
# transformaria "voltar" em "reinstalar", que é outra coisa e demora.
#
# O build acontece na release NOVA, nunca na ativa. Build na ativa deixa o site
# quebrado durante os minutos de compilação.
set -euo pipefail

ZIP="${1:?uso: deploy-release.sh <artefato.zip> <commit-curto>}"
COMMIT="${2:?informe o commit curto}"
RAIZ="${ATLAS_RAIZ:-/opt/atlas-one}"
PORTA="${ATLAS_PORTA:-3000}"
CARIMBO="$(date -u +%Y%m%d-%H%M%S)"
RELEASE="$RAIZ/releases/${CARIMBO}-${COMMIT}"

echo "raiz: $RAIZ · release: $RELEASE · porta: $PORTA"

# ── 1. O artefato é confiável? ──────────────────────────────────────────────
bash "$(dirname "$0")/verify-build.sh" "$ZIP"

# ── 2. Estrutura ────────────────────────────────────────────────────────────
mkdir -p "$RAIZ/releases" "$RAIZ/shared/logs" "$RAIZ/shared/uploads"
if [ ! -f "$RAIZ/shared/.env.production" ]; then
  echo "✘ FALTA $RAIZ/shared/.env.production"
  echo "  Crie a partir de .env.production.example e PREENCHA. O pacote não traz valores."
  exit 1
fi

# ── 3. Extração ─────────────────────────────────────────────────────────────
mkdir -p "$RELEASE" && unzip -q "$ZIP" -d "$RELEASE"

# O ambiente é COMPARTILHADO entre releases, por symlink. Copiar faria cada
# release ter a sua cópia, e corrigir uma variável exigiria corrigir todas.
ln -sfn "$RAIZ/shared/.env.production" "$RELEASE/.env"
ln -sfn "$RAIZ/shared/logs"    "$RELEASE/logs"
ln -sfn "$RAIZ/shared/uploads" "$RELEASE/uploads"

# ── 4. Ambiente antes de gastar minutos compilando ──────────────────────────
#
# A identidade do build é exportada AQUI, antes da validação, e não depois.
#
# A primeira versão validava primeiro e exportava depois — e o validador exige
# `ATLAS_BUILD_COMMIT`, então ele reprovava todo deploy. Um verificador que
# reprova o caminho feliz não é rigor: é um portão quebrado, e o primeiro
# instinto de quem o encontra é desligá-lo.
export ATLAS_BUILD_COMMIT="$COMMIT"
export ATLAS_BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export NODE_ENV=production

cd "$RELEASE"
set -a; . "$RAIZ/shared/.env.production"; set +a
node scripts/validate-production-env.mjs || { echo "✘ ambiente reprovado — nada foi trocado"; exit 1; }

# ── 5. Dependências pelo lockfile ───────────────────────────────────────────
npm ci --omit=dev --no-audit --no-fund || npm ci --no-audit --no-fund

# ── 6. Build com a identidade assada ────────────────────────────────────────
npm run build || { echo "✘ build falhou — a release ativa NÃO foi tocada"; exit 1; }

# ── 7. Sobe na porta interna e prova ANTES de trocar ────────────────────────
PM2_NOVO="atlas-${CARIMBO}"
pm2 start npm --name "$PM2_NOVO" --cwd "$RELEASE" -- start -- -p "$PORTA" >/dev/null
sleep 12
SAUDE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORTA}/api/v1/ready" || echo 000)
echo "health interno: HTTP $SAUDE"
if [ "$SAUDE" != "200" ]; then
  echo "✘ a release nova não respondeu. Removendo-a. A ativa segue intacta."
  pm2 delete "$PM2_NOVO" >/dev/null 2>&1 || true
  exit 1
fi

# ── 8. O commit no ar é o esperado? ─────────────────────────────────────────
NO_AR=$(curl -s "http://127.0.0.1:${PORTA}/api/v1/ready" | grep -o '"commit":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
echo "commit declarado: ${NO_AR:-AUSENTE}"
case "${NO_AR:-}" in
  "$COMMIT"*) echo "  ✔ confere" ;;
  *) echo "  ✘ divergente. Removendo a release nova."; pm2 delete "$PM2_NOVO" >/dev/null 2>&1 || true; exit 1 ;;
esac

# ── 9. Troca atômica ────────────────────────────────────────────────────────
ANTERIOR="$(readlink -f "$RAIZ/current" 2>/dev/null || echo '')"
echo "${ANTERIOR}" > "$RAIZ/shared/release-anterior.txt"
ln -sfn "$RELEASE" "$RAIZ/current"
pm2 delete atlas-one >/dev/null 2>&1 || true
pm2 restart "$PM2_NOVO" --name atlas-one >/dev/null 2>&1 || pm2 start npm --name atlas-one --cwd "$RAIZ/current" -- start -- -p "$PORTA" >/dev/null
pm2 delete "$PM2_NOVO" >/dev/null 2>&1 || true
pm2 save >/dev/null

echo
echo "TROCADO. anterior: ${ANTERIOR:-nenhuma} → atual: $RELEASE"
echo "Se algo estiver errado: bash $(dirname "$0")/rollback-release.sh"
