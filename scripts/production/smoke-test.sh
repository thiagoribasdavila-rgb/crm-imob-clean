#!/usr/bin/env bash
# SMOKE TEST — prova que a aplicação está VIVA, não só que responde.
#
#   bash smoke-test.sh https://atlasaios.com.br
#   bash smoke-test.sh http://127.0.0.1:3000     # antes da troca do symlink
#
# ── HTTP 200 NÃO É PROVA DE SAÚDE ───────────────────────────────────────────
#
# Medido em 31/07: atlasaios.com.br respondia 200 servindo página de CACHE, com
# a origem impossível de identificar. Um 200 pode vir da CDN, de um painel
# padrão, ou de um build de meses atrás. O que prova vida é uma rota que NÃO
# pode ser cacheada e que toca o banco.
set -uo pipefail
BASE="${1:?uso: smoke-test.sh <url-base>}"
falhas=0; avisos=0

testa() {
  local nome="$1" caminho="$2" esperado="$3"
  local codigo; codigo=$(curl -s -o /tmp/smoke.out -w '%{http_code}' --max-time 20 "${BASE}${caminho}" || echo 000)
  if [[ "$esperado" == *"$codigo"* ]]; then echo "  ✔ ${nome} (HTTP ${codigo})"
  else echo "  ✘ ${nome} — esperado ${esperado}, veio ${codigo}"; falhas=$((falhas+1)); fi
}

echo "── ALCANCE ──"
testa "home"                 "/"                          "200 307 308"
testa "login"                "/login"                     "200"
testa "url inexistente"      "/nao-existe-$(date +%s)"    "404 307 308"

echo "── VIDA (rota não cacheável que toca o banco) ──"
CORPO=$(curl -s --max-time 25 "${BASE}/api/v1/ready" || echo '')
if echo "$CORPO" | grep -q '"status":"ready"'; then echo "  ✔ prontidão declara ready"
else echo "  ✘ prontidão não declarou ready"; falhas=$((falhas+1)); fi
if echo "$CORPO" | grep -q '"database":{"ok":true'; then echo "  ✔ banco acessível (consulta real)"
else echo "  ✘ banco NÃO acessível"; falhas=$((falhas+1)); fi

echo "── IDENTIDADE DA VERSÃO ──"
COMMIT=$(echo "$CORPO" | grep -o '"commit":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
if [ -n "${COMMIT:-}" ]; then echo "  ✔ declara build.commit = ${COMMIT}"
else
  echo "  ✘ NÃO declara build.commit — impossível saber qual versão está no ar"
  falhas=$((falhas+1))
fi

echo "── SEGURANÇA NA BORDA ──"
CAB=$(curl -sI --max-time 15 "${BASE}/" || echo '')
for h in "strict-transport-security" "x-frame-options"; do
  echo "$CAB" | grep -qi "^${h}" && echo "  ✔ ${h}" || { echo "  • ${h} ausente"; avisos=$((avisos+1)); }
done
echo "$CAB" | grep -qiE '^(x-powered-by|server: *(express|node))' && { echo "  • cabeçalho revela a pilha"; avisos=$((avisos+1)); } || echo "  ✔ pilha não exposta em cabeçalho"

echo "── SEGREDO VAZADO NO CLIENTE ──"
HOME_HTML=$(curl -s --max-time 20 "${BASE}/" || echo '')
if echo "$HOME_HTML" | grep -qE 'SERVICE_ROLE|sk-[A-Za-z0-9]{20,}|"service_role"'; then
  echo "  ✘ POSSÍVEL SEGREDO NO HTML — investigue antes de liberar"; falhas=$((falhas+1))
else echo "  ✔ nenhum segredo reconhecível no HTML"; fi

echo
echo "${falhas} falha(s) · ${avisos} aviso(s)"
[ "$falhas" -eq 0 ] || { echo "SMOKE REPROVADO."; exit 1; }
echo "SMOKE APROVADO."
