/**
 * PRONTIDÃO DAS CAMPANHAS — o elo que nenhum teste de código alcança.
 *
 * O CRM pode estar 10/10 e não entrar lead nenhuma, porque o que traz lead é
 * a campanha: se ela está pausada, sem verba, ou apontando para um formulário
 * que o CRM não conhece, o funil fica vazio e nada no código acusa.
 *
 * Só LEITURA na Graph API: nenhuma campanha é criada, pausada ou alterada, e
 * nenhuma verba se move.
 */
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const TOKEN = env.META_ADS_ACCESS_TOKEN || env.META_LEAD_ACCESS_TOKEN;
const CONTA = env.META_AD_ACCOUNT_ID;
const V = "v23.0";
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function g(caminho, campos, extra = {}) {
  const url = new URL(`https://graph.facebook.com/${V}/${caminho}`);
  if (campos) url.searchParams.set("fields", campos);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, String(v));
  url.searchParams.set("access_token", TOKEN);
  const r = await fetch(url);
  return { ok: r.ok, j: await r.json().catch(() => ({})) };
}

console.log(`conta: ${CONTA}\n`);

// ── Verba ───────────────────────────────────────────────────────────────────
const conta = await g(CONTA, "name,account_status,currency,spend_cap,amount_spent,balance,disable_reason");
if (!conta.ok) { console.log(`✘ conta inalcançável: ${conta.j.error?.message}`); process.exit(1); }
const c = conta.j;
const cap = Number(c.spend_cap || 0) / 100;
const gasto = Number(c.amount_spent || 0) / 100;
console.log(`${c.name} · status ${c.account_status === 1 ? "ATIVA" : `INATIVA (${c.account_status})`}`);
if (cap > 0) {
  const restante = cap - gasto;
  console.log(`  teto de gasto: ${brl(gasto)} de ${brl(cap)} · ${restante <= 0 ? "✘ ESGOTADO — nenhuma campanha entrega" : `restam ${brl(restante)}`}`);
} else {
  console.log("  sem teto de gasto definido");
}

// ── Campanhas ───────────────────────────────────────────────────────────────
const camp = await g(`${CONTA}/campaigns`, "name,status,effective_status,objective,daily_budget,lifetime_budget,created_time", { limit: 50 });
const campanhas = camp.j.data ?? [];
const ativas = campanhas.filter((x) => x.effective_status === "ACTIVE");
console.log(`\ncampanhas: ${campanhas.length} · ATIVAS: ${ativas.length}`);
for (const x of ativas.slice(0, 8)) {
  const orc = x.daily_budget ? `${brl(Number(x.daily_budget) / 100)}/dia` : x.lifetime_budget ? `${brl(Number(x.lifetime_budget) / 100)} total` : "orçamento no conjunto";
  console.log(`  · ${String(x.name).slice(0, 46).padEnd(48)} ${String(x.objective || "").replace("OUTCOME_", "").padEnd(14)} ${orc}`);
}
const naoAtivas = campanhas.filter((x) => x.effective_status !== "ACTIVE");
if (naoAtivas.length) {
  const porEstado = {};
  for (const x of naoAtivas) porEstado[x.effective_status] = (porEstado[x.effective_status] ?? 0) + 1;
  console.log(`  fora do ar: ${Object.entries(porEstado).map(([k, n]) => `${n} ${k}`).join(" · ")}`);
}

// ── Anúncios ativos e os formulários que eles usam ──────────────────────────
// O `lead_gen_form_id` NÃO fica só em object_story_spec.link_data.call_to_action:
// dependendo de como o anúncio foi montado (Advantage+, catálogo, criativo
// dinâmico) ele aparece em asset_feed_spec ou aninhado de outra forma. Pedir o
// creative INTEIRO e procurar o campo em qualquer profundidade é o que
// funciona — a primeira versão deste script procurava num caminho só e
// concluiu "0 formulários" com 19 anúncios ativos usando um.
const ads = await g(`${CONTA}/ads`, "name,effective_status,creative{object_story_spec,asset_feed_spec,object_type,effective_object_story_id}", { limit: 100, effective_status: '["ACTIVE"]' });
const anuncios = ads.j.data ?? [];
console.log(`\nanúncios ATIVOS: ${anuncios.length}`);

// Formulários que o CRM conhece
const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: fontes } = await admin.from("meta_lead_sources")
  .select("form_id,name,active,development_id")
  .eq("organization_id", "7c8c71c1-e963-464c-be5c-ff8c7936f51a");
const conhecidos = new Map((fontes ?? []).map((f) => [String(f.form_id), f]));

const formsEmUso = new Set();
const paginasEmUso = new Set();
for (const a of anuncios) {
  const bruto = JSON.stringify(a.creative ?? {});
  for (const m of bruto.matchAll(/"lead_gen_form_id":"?(\d+)"?/g)) formsEmUso.add(m[1]);
  for (const m of bruto.matchAll(/"page_id":"?(\d+)"?/g)) paginasEmUso.add(m[1]);
}
console.log(`formulários usados pelos anúncios ativos: ${formsEmUso.size}`);
// A página importa tanto quanto o formulário: o webhook casa a fonte por
// page_id ANTES de olhar o form_id. Página desconhecida = lead sem destino.
const paginasConhecidas = new Set((fontes ?? []).map((f) => String(f.page_id)));
for (const pg of paginasEmUso) {
  console.log(`  página ${pg}: ${paginasConhecidas.has(pg) ? "✔ o CRM conhece" : "✘ o CRM NÃO conhece — o webhook não sabe de qual organização é a lead"}`);
}
let semFonte = 0;
for (const f of formsEmUso) {
  const fonte = conhecidos.get(f);
  if (!fonte) { semFonte++; console.log(`  ✘ ${f} — o CRM NÃO conhece: lead deste anúncio chega sem dono nem empreendimento`); }
  else if (!fonte.active) console.log(`  ⚠ ${f} (${fonte.name}) — fonte DESATIVADA no CRM: a lead fica represada`);
  else if (!fonte.development_id) console.log(`  ⚠ ${f} (${fonte.name}) — sem empreendimento vinculado`);
  else console.log(`  ✔ ${f} (${fonte.name})`);
}

console.log("\n══ VEREDITO ══");
const problemas = [];
if (c.account_status !== 1) problemas.push("conta de anúncios não está ativa");
if (cap > 0 && cap - gasto <= 0) problemas.push("teto de gasto esgotado — nenhuma campanha entrega");
if (!ativas.length) problemas.push("nenhuma campanha ativa");
if (!formsEmUso.size && ativas.length) problemas.push("nenhum anúncio ativo com formulário de lead");
if (semFonte) problemas.push(`${semFonte} formulário(s) em uso que o CRM não conhece`);
const paginasOrfas = [...paginasEmUso].filter((p) => !paginasConhecidas.has(p));
if (paginasOrfas.length) problemas.push(`${paginasOrfas.length} página(s) em uso que o CRM não conhece: ${paginasOrfas.join(", ")}`);
if (problemas.length) { console.log("NÃO entra lead nova enquanto:"); for (const p of problemas) console.log(`  · ${p}`); }
else console.log("As campanhas estão prontas para entregar lead ao CRM.");
