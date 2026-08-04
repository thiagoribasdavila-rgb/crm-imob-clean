/**
 * PROVA DA FICHA DO COMPRADOR — os campos gravam mesmo?
 *
 * Os contratos provam a REGRA (o que falta, a ordem, a normalização). Esta prova
 * cobre o que eles não alcançam e que era exatamente o defeito: o PATCH aceitar
 * o campo, responder 200, e o valor não chegar à coluna.
 *
 * Medido em 03/08/2026: payment_method, purchase_timeline, monthly_income e
 * financing_required com 613 vazios de 613. Sem input na tela E sem mapeamento
 * no construtor do payload.
 *
 *   node --env-file=.env.local scripts/prova-ficha-do-comprador.mjs
 */
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const APP = env.PROVA_APP_URL || "http://127.0.0.1:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let ok = 0, bad = 0;
const t = (c, txt, d = "") => { if (c) { ok++; console.log("  ✔ " + txt); } else { bad++; console.log("  ✘ " + txt + (d ? "\n      " + d : "")); } };

const { data: dev } = await admin.from("developments").select("organization_id").limit(1).single();
const ORG = dev.organization_id;

const email = `prova-ficha-${Date.now()}@atlas-teste.local`;
const senha = "Prova!F1cha#Compr";
const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
const { error: ep } = await admin.from("profiles").upsert({
  id: u.user.id, name: "Prova Ficha", full_name: "Prova Ficha", email,
  organization_id: ORG, role: "admin", access_role: "director_decisor",
  commercial_role: "director", reports_to: null, active: true,
});
if (ep) { console.log("perfil recusado:", ep.message); process.exit(1); }
const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: s } = await pub.auth.signInWithPassword({ email, password: senha });
const H = { authorization: `Bearer ${s.session.access_token}`, "content-type": "application/json" };

const { data: leadCriada } = await admin.from("leads").insert({
  organization_id: ORG, name: "Prova Ficha do Comprador", phone: "+5511900000001",
  source: "prova_ficha", status: "novo",
}).select("id").single();
const LEAD = leadCriada.id;

const ler = async () => (await admin.from("leads")
  .select("purpose,payment_method,purchase_timeline,monthly_income,financing_required,budget_max,preferred_bedrooms,name,phone,email")
  .eq("id", LEAD).single()).data;

try {
  console.log("\n── os quatro campos que não tinham como ser gravados ──");
  const patch = await (await fetch(`${APP}/api/v1/leads/${LEAD}`, {
    method: "PATCH", headers: H,
    body: JSON.stringify({
      name: "Prova Ficha do Comprador", phone: "+5511900000001",
      purpose: "moradia", payment_method: "financiamento",
      purchase_timeline: "curto", financing_required: "sim", monthly_income: 12000,
      budget_max: 850000, bedrooms: 3,
    }),
  })).json();
  t(!patch?.error, "o PATCH aceita os campos novos", JSON.stringify(patch?.error ?? {}));

  const depois = await ler();
  t(depois.payment_method === "financiamento", `forma de pagamento gravou (${depois.payment_method})`);
  t(depois.purchase_timeline === "curto", `prazo de compra gravou (${depois.purchase_timeline})`);
  // A coluna e BOOLEAN no banco: a tela manda "sim" e o construtor traduz.
  t(depois.financing_required === true, `precisa financiar gravou como booleano (${depois.financing_required})`);
  t(Number(depois.monthly_income) === 12000, `renda mensal gravou (${depois.monthly_income})`);
  t(depois.purpose === "moradia", `finalidade gravou NA COLUNA, não só na nota (${depois.purpose})`);
  t(Number(depois.budget_max) === 850000 && Number(depois.preferred_bedrooms) === 3,
    "orçamento e dormitórios seguem gravando como antes");

  console.log("\n── ausente preserva, vazio limpa ──");
  await fetch(`${APP}/api/v1/leads/${LEAD}`, {
    method: "PATCH", headers: H,
    body: JSON.stringify({ name: "Prova Ficha do Comprador", phone: "+5511900000001", budget_max: 900000 }),
  });
  const preservou = await ler();
  t(preservou.payment_method === "financiamento" && Number(preservou.monthly_income) === 12000,
    "campo AUSENTE no PATCH preserva o que estava gravado",
    `pagamento=${preservou.payment_method} renda=${preservou.monthly_income}`);

  await fetch(`${APP}/api/v1/leads/${LEAD}`, {
    method: "PATCH", headers: H,
    body: JSON.stringify({ name: "Prova Ficha do Comprador", phone: "+5511900000001", payment_method: "", monthly_income: null }),
  });
  const limpou = await ler();
  t(limpou.payment_method === null && limpou.monthly_income === null,
    "campo enviado VAZIO limpa de propósito",
    `pagamento=${limpou.payment_method} renda=${limpou.monthly_income}`);

  console.log("\n── a identidade não é destruída no caminho ──");
  t(limpou.name === "Prova Ficha do Comprador" && limpou.phone,
    "nome e telefone sobrevivem a três PATCHes parciais");
} finally {
  await admin.from("lead_identity_registry").delete().eq("lead_id", LEAD);
  await admin.from("lead_events").delete().eq("lead_id", LEAD);
  await admin.from("leads").delete().eq("id", LEAD);
  await admin.from("profiles").delete().eq("id", u.user.id);
  await admin.auth.admin.deleteUser(u.user.id);
  const { count } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("source", "prova_ficha");
  console.log(`\nleads de prova sobrando: ${count ?? 0} · usuário descartável removido: sim`);
}
console.log(`\n${ok} passaram, ${bad} falharam.`);
process.exit(bad ? 1 : 0);
