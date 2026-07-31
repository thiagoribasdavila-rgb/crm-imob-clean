#!/usr/bin/env bash
# A PROVA QUE IMPORTA — um evento sintetico sai de attempts=0 SOZINHO em ate 5 min.
#
# O criterio de sucesso NAO e "o crontab -l saiu certo". E o EFEITO: ninguem chama o
# worker a mao, e o evento e processado. Esta prova nao dispara worker nenhum.
#
# Uso: bash scripts/operations/verify-after-5-minutes.sh
# Exige: SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_URL no ambiente.
source "$(dirname "$0")/_comum.sh"
[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] || c_die "SUPABASE_SERVICE_ROLE_KEY ausente no ambiente"
[ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || c_die "NEXT_PUBLIC_SUPABASE_URL ausente no ambiente"
LIMITE="${ATLAS_PROVA_SEGUNDOS:-300}"

node - "$LIMITE" <<'JS'
const limite = Number(process.argv[2] || 300);
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };
const rest = async (p, init = {}) => {
  const r = await fetch(`${URL}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`REST ${p} → ${r.status} ${await r.text()}`);
  return r.json();
};
const topico = `prova.sintetica.${Date.now()}`;
(async () => {
  const [org] = await rest("leads?select=organization_id&limit=1");
  // TOPICO INEXISTENTE de proposito: o worker cai no "Topico nao suportado" e os
  // efeitos por topico nao disparam. Nenhuma mensagem sai, nenhuma lead e tocada.
  const [ev] = await rest("integration_outbox", { method: "POST",
    body: JSON.stringify({ organization_id: org.organization_id, topic: topico, aggregate_type: "prova", payload: { prova: true } }) });
  console.log(`  evento ${ev.id.slice(0, 8)} criado · attempts=${ev.attempts} · ${new Date().toISOString()}`);
  console.log(`  aguardando ate ${limite}s. NENHUM worker sera chamado por este script.`);
  const t0 = Date.now();
  let ultimo = ev;
  while ((Date.now() - t0) / 1000 < limite) {
    await new Promise((r) => setTimeout(r, 15000));
    const [atual] = await rest(`integration_outbox?id=eq.${ev.id}&select=id,status,attempts,locked_by`);
    const s = Math.round((Date.now() - t0) / 1000);
    if (!atual) { console.log(`  [${s}s] evento sumiu`); break; }
    ultimo = atual;
    console.log(`  [${s}s] status=${atual.status} attempts=${atual.attempts} worker=${atual.locked_by ?? "—"}`);
    if (atual.attempts > 0) {
      console.log(`\n  ✔ PROVADO: o agendamento executou sozinho em ${s}s (limite ${limite}s).`);
      await fetch(`${URL}/rest/v1/integration_outbox?id=eq.${ev.id}`, { method: "DELETE", headers: H });
      console.log("  (evento de prova removido)");
      process.exit(0);
    }
  }
  console.log(`\n  ✘ NAO PROVADO: attempts continua ${ultimo.attempts} apos ${limite}s.`);
  console.log("    O agendamento nao esta executando. Confira: crontab -l | grep atlasaios");
  await fetch(`${URL}/rest/v1/integration_outbox?id=eq.${ev.id}`, { method: "DELETE", headers: H });
  console.log("  (evento de prova removido)");
  process.exit(1);
})().catch((e) => { console.error(`  ✘ ${e.message}`); process.exit(1); });
JS
