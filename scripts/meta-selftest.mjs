/**
 * Self-test das integrações Meta — valida os tokens/keys direto na Graph API,
 * read-only, SEM nunca imprimir o valor de nenhum segredo.
 *
 * Uso:  node --env-file=.env.local scripts/meta-selftest.mjs
 *  (ou)  npm run meta:selftest
 *
 * Sai com código 0 se tudo passar, 1 se algo falhar.
 */

const V = process.env.META_GRAPH_API_VERSION || "v23.0";
const BASE = `https://graph.facebook.com/${V}`;
const results = [];

function add(name, ok, note) { results.push({ name, ok, note }); }

async function graph(name, path, token, summarize) {
  if (!token) return add(name, false, "variável de token vazia — preencher no .env");
  try {
    const res = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json().catch(() => ({}));
    if (json.error) {
      const e = json.error;
      const hint = e.code === 190 && e.error_subcode === 463 ? " (TOKEN EXPIRADO — gere um de Usuário do Sistema)" : "";
      return add(name, false, `${e.code}/${e.error_subcode ?? "-"}: ${String(e.message).slice(0, 90)}${hint}`);
    }
    add(name, true, summarize ? summarize(json) : "ok");
  } catch (err) {
    add(name, false, `rede: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const acc = (process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/, "");

await graph(
  "Ads · conta de anúncios", acc ? `act_${acc}?fields=name,account_status,currency` : "",
  acc ? process.env.META_ADS_ACCESS_TOKEN : "",
  (j) => `${j.name} · status ${j.account_status} · ${j.currency}`,
);
if (!acc) results[results.length - 1] = { name: "Ads · conta de anúncios", ok: false, note: "META_AD_ACCOUNT_ID vazio" };

await graph(
  "Leads · página/dono", "me?fields=id,name",
  process.env.META_LEAD_ACCESS_TOKEN,
  (j) => `${j.name || j.id}${j.id ? " (id " + j.id + ")" : ""}`,
);

const waId = process.env.WHATSAPP_PHONE_NUMBER_ID;
if (!waId) add("WhatsApp · número", false, "WHATSAPP_PHONE_NUMBER_ID vazio — preencher");
else await graph(
  "WhatsApp · número", `${waId}?fields=display_phone_number,verified_name,quality_rating`,
  process.env.WHATSAPP_ACCESS_TOKEN,
  (j) => `${j.display_phone_number} · ${j.verified_name} · qualidade ${j.quality_rating}`,
);

const ds = process.env.META_CAPI_DATASET_ID;
if (!ds) add("CAPI · dataset", false, "META_CAPI_DATASET_ID ausente — pegar no Gerenciador de Eventos");
else await graph(
  "CAPI · dataset", `${ds}?fields=name`,
  process.env.META_CONVERSIONS_ACCESS_TOKEN,
  (j) => `${j.name}`,
);

// ---- relatório ----
const pass = results.filter((r) => r.ok).length;
console.log(`\n  Meta self-test · Graph ${V}\n  ${"─".repeat(52)}`);
for (const r of results) console.log(`  ${r.ok ? "✅" : "❌"} ${r.name.padEnd(24)} ${r.note}`);
console.log(`  ${"─".repeat(52)}\n  ${pass}/${results.length} ok\n`);
process.exit(pass === results.length ? 0 : 1);
