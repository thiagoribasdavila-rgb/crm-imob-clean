/**
 * Reprocessa as leads da Meta que chegaram sem destino.
 *
 * Uma lead cai em `meta_leads_sem_destino` quando o webhook não sabe de qual
 * organização ela é — página ou formulário sem cadastro em
 * `meta_lead_sources`. Antes de existir esta tabela, ela virava só um log e
 * se perdia.
 *
 * Depois de cadastrar a fonte, este script devolve as guardadas para o fluxo
 * normal: cria o evento em `meta_lead_events` e enfileira a busca no outbox —
 * exatamente o que o webhook teria feito na hora.
 *
 * Uso:
 *   node scripts/meta-reprocessa-sem-destino.mjs            (mostra o que há)
 *   node scripts/meta-reprocessa-sem-destino.mjs --aplicar  (reprocessa)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const APLICAR = process.argv.includes("--aplicar");
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: pendentes, error } = await admin
  .from("meta_leads_sem_destino")
  .select("id,leadgen_id,page_id,form_id,ad_id,campaign_external_id,motivo,payload,received_at")
  .eq("resolvido", false)
  .order("received_at", { ascending: true })
  .limit(500);
if (error) throw new Error(error.message);

if (!pendentes?.length) {
  console.log("Nenhuma lead sem destino guardada. Nada a reprocessar.");
  process.exit(0);
}

// Agrupa por página: é a página que decide se já dá para reprocessar.
const porPagina = new Map();
for (const p of pendentes) {
  const k = p.page_id || "(sem page_id)";
  if (!porPagina.has(k)) porPagina.set(k, []);
  porPagina.get(k).push(p);
}

const { data: fontes } = await admin.from("meta_lead_sources")
  .select("id,organization_id,page_id,form_id,name,active");

console.log(`leads sem destino guardadas: ${pendentes.length}\n`);
const prontas = [];
for (const [pageId, lista] of porPagina) {
  const daPagina = (fontes ?? []).filter((f) => String(f.page_id) === pageId && f.active);
  const formsGuardados = [...new Set(lista.map((l) => l.form_id).filter(Boolean))];
  console.log(`página ${pageId}: ${lista.length} lead(s) · formulários ${formsGuardados.join(", ") || "(nenhum)"}`);
  if (!daPagina.length) {
    console.log("   ✘ ainda sem fonte cadastrada para esta página — cadastre em meta_lead_sources antes");
    continue;
  }
  for (const lead of lista) {
    // Casa a fonte pelo formulário; a fonte "curinga" (form_id nulo) atende
    // qualquer formulário daquela página.
    const fonte = daPagina.find((f) => String(f.form_id) === String(lead.form_id))
      ?? daPagina.find((f) => !f.form_id);
    if (!fonte) { console.log(`   ⚠ lead ${lead.leadgen_id}: formulário ${lead.form_id} sem fonte`); continue; }
    prontas.push({ lead, fonte });
  }
  console.log(`   ✔ ${prontas.filter((p) => p.lead.page_id === pageId).length} pronta(s) para reprocessar`);
}

if (!prontas.length) { console.log("\nNada pronto para reprocessar ainda."); process.exit(0); }
if (!APLICAR) { console.log(`\nSIMULAÇÃO — ${prontas.length} lead(s) seriam reprocessadas. Rode com --aplicar.`); process.exit(0); }

let ok = 0;
for (const { lead, fonte } of prontas) {
  const { data: evento, error: erroEvento } = await admin.from("meta_lead_events").insert({
    organization_id: fonte.organization_id,
    source_id: fonte.id,
    external_lead_id: lead.leadgen_id,
    page_id: lead.page_id,
    form_id: lead.form_id,
    ad_id: lead.ad_id,
    campaign_external_id: lead.campaign_external_id,
    payload: lead.payload,
    received_at: lead.received_at,
  }).select("id").single();
  // 23505 = a lead já tinha sido processada por outro caminho; marcar como
  // resolvida é o certo, não repetir.
  if (erroEvento && erroEvento.code !== "23505") { console.log(`  ✘ ${lead.leadgen_id}: ${erroEvento.message}`); continue; }
  if (evento?.id) {
    await admin.from("integration_outbox").insert({
      organization_id: fonte.organization_id,
      topic: "meta.lead.fetch",
      aggregate_type: "meta_lead_event",
      aggregate_id: evento.id,
      payload: { leadgenId: lead.leadgen_id, sourceId: fonte.id },
    });
  }
  await admin.from("meta_leads_sem_destino")
    .update({ resolvido: true, resolvido_em: new Date().toISOString() })
    .eq("id", lead.id);
  ok++;
}
console.log(`\nreprocessadas: ${ok} de ${prontas.length}`);
console.log("O worker do outbox busca os dados na Meta na próxima rodada.");
