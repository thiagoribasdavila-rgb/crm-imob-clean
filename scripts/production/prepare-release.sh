#!/usr/bin/env bash
# PREPARA O SERVIDOR PARA RECEBER RELEASES. Idempotente: rode quantas vezes quiser.
#
#   bash prepare-release.sh
#
# Cria a estrutura, o usuário de serviço e confere o runtime — sem publicar nada.
# É o passo que separa "servidor com arquivos jogados" de "servidor com releases".
set -euo pipefail
RAIZ="${ATLAS_RAIZ:-/opt/atlas-one}"
USUARIO="${ATLAS_USUARIO:-atlas}"
falhas=0

echo "── RUNTIME ──"
V=$(node -v 2>/dev/null || echo "v0")
MAJOR=${V#v}; MAJOR=${MAJOR%%.*}
MINOR=$(node -p "process.versions.node.split('.')[1]" 2>/dev/null || echo 0)
echo "  node: $V"
if [ "$MAJOR" -ge 27 ]; then
  echo "  ✘ Node $MAJOR está ACIMA do teto (<27). O produto não foi provado nesta major."
  falhas=$((falhas+1))
elif [ "$MAJOR" -gt 22 ] || { [ "$MAJOR" -eq 22 ] && [ "$MINOR" -ge 6 ]; }; then
  echo "  ✔ compatível (>=22.6 <27)"
else
  echo "  ✘ INCOMPATÍVEL. 36 scripts usam flags que não existem antes do 22.6."
  echo "    Instale o Node 22 LTS (NodeSource, Ubuntu 24.04):"
  echo "      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
  echo "      sudo apt-get install -y nodejs"
  falhas=$((falhas+1))
fi

echo "── USUÁRIO DE SERVIÇO ──"
if id "$USUARIO" >/dev/null 2>&1; then
  echo "  ✔ '$USUARIO' existe"
else
  echo "  criando '$USUARIO' (sem shell de login, sem senha)"
  useradd --system --create-home --shell /usr/sbin/nologin "$USUARIO" 2>/dev/null && echo "  ✔ criado" || { echo "  ✘ falhou — precisa de root"; falhas=$((falhas+1)); }
fi

echo "── ESTRUTURA ──"
mkdir -p "$RAIZ/releases" "$RAIZ/shared/logs" "$RAIZ/shared/uploads"
chown -R "$USUARIO:$USUARIO" "$RAIZ" 2>/dev/null || echo "  • chown falhou (não-root) — ajuste manualmente"
echo "  ✔ $RAIZ/{releases,shared/{logs,uploads}}"

echo "── AMBIENTE ──"
ENVFILE="$RAIZ/shared/.env.production"
if [ -f "$ENVFILE" ]; then
  P=$(stat -c '%a' "$ENVFILE" 2>/dev/null || echo '?')
  echo "  ✔ existe (permissão $P, $(grep -cE '^[A-Z_]+=' "$ENVFILE" 2>/dev/null || echo 0) variáveis)"
  # 600: só o dono lê. Arquivo de ambiente legível por outros é segredo vazado
  # para qualquer processo da máquina.
  [ "$P" = "600" ] || { chmod 600 "$ENVFILE" 2>/dev/null && echo "  ✔ permissão corrigida para 600"; }
  chown "$USUARIO:$USUARIO" "$ENVFILE" 2>/dev/null || true
else
  echo "  ✘ FALTA $ENVFILE"
  echo "    Crie a partir de .env.production.example e PREENCHA."
  echo "    NUNCA copie o .env da máquina de desenvolvimento."
  falhas=$((falhas+1))
fi

echo "── GERENCIADOR DE PROCESSO ──"
command -v pm2 >/dev/null 2>&1 && echo "  ✔ pm2 $(pm2 -v 2>/dev/null)" || { echo "  • pm2 ausente: npm i -g pm2"; }

echo
[ "$falhas" -eq 0 ] && echo "SERVIDOR PRONTO para receber release." || { echo "SERVIDOR NÃO ESTÁ PRONTO: $falhas pendência(s)."; exit 1; }
