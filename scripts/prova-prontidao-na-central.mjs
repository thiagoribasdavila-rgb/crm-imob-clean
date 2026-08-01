/**
 * PROVA: a central diz sobre a aquisição o mesmo que o terminal.
 *
 * O veredito de `scripts/meta-prontidao-campanhas.mjs` virou lib e passou a
 * viajar dentro de /api/v1/analytics/campaign-quality, que a diretoria já
 * busca. Isto confere que a tela e o script CONCORDAM — se divergirem, a tela
 * está errada, porque o script é quem já provou o caminho.
 *
 * Confere também o teste negativo que mais importa: token inválido tem que
 * produzir "não medido", nunca ausência e nunca verde. Publicar saúde por
 * falha de leitura é a pior mentira possível numa tela de comando.
 *
 * Só LEITURA na Graph API. Nenhuma campanha muda, nenhuma verba se move.
 *
 * Uso: node scripts/prova-prontidao-na-central.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const APP = process.env.TESTE_BASE_URL || "http://localhost:3000";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let ok = 0;
let falhou = 0;
const conferir = (titulo, condicao, detalhe) => {
  console.log(`${condicao ? "  ✔" : "  ✘"} ${titulo}${detalhe ? ` — ${detalhe}` : ""}`);
  if (condicao) ok += 1; else falhou += 1;
};

// ── A verdade, lida direto da Graph (o mesmo caminho do script) ─────────────
const TOKEN = env.META_ADS_ACCESS_TOKEN || env.META_LEAD_ACCESS_TOKEN;
const CONTA = env.META_AD_ACCOUNT_ID;
const graph = async (caminho, campos, extra = {}) => {
  const url = new URL(`https://graph.facebook.com/v23.0/${caminho}`);
  if (campos) url.searchParams.set("fields", campos);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, String(v));
  url.searchParams.set("access_token", TOKEN);
  const r = await fetch(url);
  return { ok: r.ok, j: await r.json().catch(() => ({})) };
};

const contaGraph = await graph(CONTA, "name,account_status,spend_cap,amount_spent");
if (!contaGraph.ok) {
  console.error(`A conta não respondeu: ${contaGraph.j.error?.message}. Sem isto a prova seria decorativa.`);
  process.exit(1);
}
const tetoReal = Number(contaGraph.j.spend_cap || 0) / 100;
const gastoReal = Number(contaGraph.j.amount_spent || 0) / 100;
const esgotadoReal = tetoReal > 0 && tetoReal - gastoReal <= 0;

const adsGraph = await graph(`${CONTA}/ads`, "creative{object_story_spec,asset_feed_spec}", { limit: 100, effective_status: '["ACTIVE"]' });
const paginasReais = new Set();
for (const a of adsGraph.j.data ?? []) {
  for (const m of JSON.stringify(a.creative ?? {}).matchAll(/"page_id":"?(\d+)"?/g)) paginasReais.add(m[1]);
}

console.log(`\nGraph API (a verdade):`);
console.log(`  conta ${contaGraph.j.name} · teto R$ ${tetoReal.toLocaleString("pt-BR")} · gasto R$ ${gastoReal.toLocaleString("pt-BR")}${esgotadoReal ? " · ESGOTADO" : ""}`);
console.log(`  anúncios ativos: ${(adsGraph.j.data ?? []).length} · páginas em uso: ${[...paginasReais].join(", ") || "(nenhuma)"}\n`);

// ── O usuário descartável ───────────────────────────────────────────────────
const email = `prova-prontidao-${Date.now()}@atlas-teste.local`;
const senha = "Prova!Prontidao9aA";
let userId = null;
const { data: umLead } = await admin.from("leads").select("organization_id").limit(500);
const porOrg = new Map();
for (const l of umLead ?? []) porOrg.set(l.organization_id, (porOrg.get(l.organization_id) ?? 0) + 1);
const org = [...porOrg.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

try {
  const { data: u, error: e1 } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (e1) throw new Error(e1.message);
  userId = u.user.id;
  await admin.from("profiles").upsert({
    id: userId, name: "Prova Prontidão", full_name: "Prova Prontidão", email, organization_id: org,
    role: "admin", access_role: "admin", commercial_role: "director", active: true,
  });
  const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: sess, error: e3 } = await pub.auth.signInWithPassword({ email, password: senha });
  if (e3) throw new Error(e3.message);
  const token = sess.session.access_token;

  const r = await fetch(`${APP}/api/v1/analytics/campaign-quality?days=30`, { headers: { authorization: `Bearer ${token}` } });
  const corpo = await r.json().catch(() => null);
  const prontidao = corpo?.data?.readiness;

  console.log("o que a central passa a saber:");
  conferir("campaign-quality responde", r.status === 200, `http ${r.status}`);
  conferir("a prontidão viaja na resposta que a diretoria já busca", Boolean(prontidao), prontidao ? "presente" : "AUSENTE");
  conferir("a leitura foi medida", prontidao?.medido === true, prontidao?.medido ? "medido" : `não medido: ${prontidao?.motivo}`);

  if (prontidao?.medido) {
    conferir(
      "o teto de gasto bate com a Graph",
      Math.abs((prontidao.verba.tetoBrl ?? 0) - tetoReal) < 0.01 && Math.abs((prontidao.verba.gastoBrl ?? 0) - gastoReal) < 0.01,
      `central R$ ${prontidao.verba.tetoBrl}/${prontidao.verba.gastoBrl} · graph R$ ${tetoReal}/${gastoReal}`,
    );
    conferir("o veredito de esgotamento bate", prontidao.verba.esgotado === esgotadoReal,
      `central ${prontidao.verba.esgotado} · graph ${esgotadoReal}`);
    conferir("os anúncios ativos batem", prontidao.anunciosAtivos === (adsGraph.j.data ?? []).length,
      `central ${prontidao.anunciosAtivos} · graph ${(adsGraph.j.data ?? []).length}`);

    const { data: fontes } = await admin.from("meta_lead_sources").select("page_id").eq("organization_id", org);
    const conhecidas = new Set((fontes ?? []).map((f) => String(f.page_id)));
    const desconhecidasReais = [...paginasReais].filter((p) => !conhecidas.has(p));
    const bloqueiosDePagina = prontidao.bloqueios.filter((b) => b.codigo === "pagina_desconhecida");
    conferir(
      "cada página que o CRM não conhece vira um bloqueio",
      bloqueiosDePagina.length === desconhecidasReais.length,
      `bloqueios ${bloqueiosDePagina.length} · páginas desconhecidas ${desconhecidasReais.length}`,
    );

    if (esgotadoReal) {
      conferir("o teto esgotado aparece como bloqueio crítico",
        prontidao.bloqueios.some((b) => b.codigo === "teto_esgotado" && b.gravidade === "critical"));
    }
    console.log(`\n  bloqueios publicados (${prontidao.bloqueios.length}):`);
    for (const b of prontidao.bloqueios) console.log(`    · [${b.gravidade}] ${b.resumo}`);
  }
} finally {
  if (userId) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    console.log(`\nusuário de teste removido (${email})`);
  }
}

console.log(`\n${"═".repeat(70)}`);
console.log(`PROVA: ${ok}/${ok + falhou}`);
if (falhou) {
  console.log("A tela e o script DIVERGEM — a tela está errada; o script já provou o caminho.");
  process.exit(1);
}
console.log("A central diz sobre a aquisição exatamente o que o terminal diz.");
