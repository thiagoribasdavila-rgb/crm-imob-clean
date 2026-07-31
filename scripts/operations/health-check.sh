#!/usr/bin/env bash
# HEALTH CHECK — le a prontidao e traduz o ESTADO. Nao altera nada; roda de qualquer
# maquina que alcance a URL.
# Uso: bash scripts/operations/health-check.sh
# Saida: 0 healthy/paused · 1 unhealthy · 2 degraded/unknown/not_configured
source "$(dirname "$0")/_comum.sh"
R=$(curl -fsS --max-time 20 "$BASE_URL/api/v1/ready" 2>/dev/null) || c_die "$BASE_URL/api/v1/ready nao respondeu"
# Uma extracao so: imprime o painel e devolve o estado na ultima linha.
SAIDA=$(printf '%s' "$R" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const d=JSON.parse(s).data||{}, b=d.build||{}, m=d.migrations||{};
  console.log("  estado ....... "+(d.estado??"—"));
  console.log("  motivo ....... "+(d.estadoMotivo??"—"));
  console.log("  exige acao ... "+d.estadoExigeAcao);
  console.log("  commit ....... "+(b.commit??"NAO DECLARADO"));
  console.log("  deploy ....... "+(b.deployId??"—")+" · ambiente "+(b.ambiente??"—"));
  console.log("  filas ........ "+JSON.stringify((d.filas||{}).porEstado||{}));
  console.log("  migrations ... emDia="+m.emDia+" faltando="+m.faltandoTotal);
  console.log("ESTADO="+(d.estado??"desconhecido"));
})')
printf '%s\n' "$SAIDA" | grep -v '^ESTADO='
ESTADO=$(printf '%s' "$SAIDA" | sed -n 's/^ESTADO=//p')

case "$ESTADO" in
  healthy)               c_ok "saudavel"; exit 0 ;;
  paused_by_kill_switch) c_warn "PAUSADO de proposito — nao e pane, nao acorde ninguem"; exit 0 ;;
  unhealthy)             c_die "FALHA REAL acontecendo agora" ;;
  *)                     c_warn "estado '$ESTADO' — exige atencao, sem urgencia de madrugada"; exit 2 ;;
esac
