#!/usr/bin/env bash
# VERIFICA O ARTEFATO antes de instalar. Rode NO SERVIDOR, no diretório do ZIP.
#
#   bash verify-build.sh atlas-one-vX.Y.Z-....zip
#
# Recusa o pacote em vez de instalar algo que não confere. Um pacote que não
# confere é pior que nenhum: ele instala e ninguém sabe o quê.
set -euo pipefail
ZIP="${1:?uso: verify-build.sh <arquivo.zip>}"
falhas=0
checa() { if eval "$2" >/dev/null 2>&1; then echo "  ✔ $1"; else echo "  ✘ $1"; falhas=$((falhas+1)); fi; }

echo "── INTEGRIDADE ──"
checa "o arquivo existe"            "[ -f '$ZIP' ]"
checa "checksum confere"            "shasum -a 256 -c '${ZIP}.sha256'"
checa "sem erro de CRC"             "unzip -t '$ZIP'"

echo "── O QUE NÃO PODE ESTAR DENTRO ──"
for padrao in '\.env$' '\.env\.local$' 'node_modules/' '^\.git/' '\.log$' '\.pem$' '\.key$'; do
  n=$(unzip -Z1 "$ZIP" | grep -cE "$padrao" || true)
  if [ "$n" = "0" ]; then echo "  ✔ nenhum $padrao"; else echo "  ✘ $n arquivo(s) $padrao"; falhas=$((falhas+1)); fi
done

echo "── O QUE PRECISA ESTAR DENTRO ──"
for arq in package.json package-lock.json next.config.ts .env.production.example; do
  checa "$arq presente" "unzip -Z1 '$ZIP' | grep -qx '$arq'"
done

echo "── RUNTIME EXIGIDO ──"
EXIGE=$(unzip -p "$ZIP" package.json | grep -o '"node": *"[^"]*"' | head -1)
echo "  pacote exige: $EXIGE"
echo "  servidor tem: $(node -v 2>/dev/null || echo 'node ausente')"
MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)
MINOR=$(node -p "process.versions.node.split('.')[1]" 2>/dev/null || echo 0)
if [ "$MAJOR" -gt 22 ] || { [ "$MAJOR" -eq 22 ] && [ "$MINOR" -ge 6 ]; }; then
  echo "  ✔ runtime compatível"
else
  echo "  ✘ runtime INCOMPATÍVEL — 36 scripts usam flags que não existem antes do 22.6"
  falhas=$((falhas+1))
fi

echo
[ "$falhas" -eq 0 ] && echo "PACOTE APROVADO." || { echo "PACOTE RECUSADO: $falhas problema(s). NÃO instale."; exit 1; }
