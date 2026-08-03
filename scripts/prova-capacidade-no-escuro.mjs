/**
 * PROVA DO PAINEL "CONSTRUÍDO E APAGADO" — contra o banco vivo.
 *
 * Os contratos provam a REGRA (o que é apagada, bloqueada, acesa). Falta o que
 * eles não alcançam: se a rota conta a coisa certa, dentro da organização certa,
 * e se o retrato que ela devolve bate com o que o banco de fato tem.
 *
 *   node --env-file=.env.local scripts/prova-capacidade-no-escuro.mjs
 */
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const APP = env.PROVA_APP_URL || "http://127.0.0.1:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let ok = 0, bad = 0;
const t = (c, txt, d = "") => { if (c) { ok++; console.log("  ✔ " + txt); } else { bad++; console.log("  ✘ " + txt + (d ? "\n      " + d : "")); } };

const { data: dev } = await admin.from("developments").select("organization_id").limit(1).single();
const ORG = dev.organization_id;

const email = `prova-escuro-${Date.now()}@atlas-teste.local`;
const senha = "Prova!Escur0#Painel";
const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
const { error: erroPerfil } = await admin.from("profiles").upsert({
  id: u.user.id, name: "Prova Escuro", full_name: "Prova Escuro", email,
  organization_id: ORG, role: "admin", access_role: "director_decisor",
  commercial_role: "director", reports_to: null, active: true,
});
if (erroPerfil) { console.log("perfil recusado:", erroPerfil.message); process.exit(1); }
const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: s } = await pub.auth.signInWithPassword({ email, password: senha });
const H = { authorization: `Bearer ${s.session.access_token}` };

try {
  const r = await (await fetch(`${APP}/api/v1/atlas/capacidade-no-escuro`, { headers: H })).json();
  t(r?.ok === true, "a rota responde", JSON.stringify(r?.error ?? {}));
  const painel = r?.data?.painel ?? [];
  const por = Object.fromEntries(painel.map((l) => [l.chave, l]));

  console.log("\n── o retrato bate com o banco ──");
  const contar = async (tabela, extra = (q) => q) => {
    const { count } = await extra(admin.from(tabela).select("*", { count: "exact", head: true }).eq("organization_id", ORG));
    return count ?? 0;
  };
  const elenco = await contar("distribution_roster", (q) => q.eq("ativo", true));
  const verbas = await contar("product_budgets");
  const wa = await contar("whatsapp_broker_sessions", (q) => q.eq("status", "conectado"));

  t(por.fila_de_atendimento?.estado === (elenco > 0 ? "acesa" : "apagada"),
    `fila de atendimento: banco tem ${elenco}, painel diz ${por.fila_de_atendimento?.estado}`);
  t(por.verba_por_produto?.estado === (verbas > 0 ? "acesa" : "apagada"),
    `verba por produto: banco tem ${verbas}, painel diz ${por.verba_por_produto?.estado}`);
  t(por.whatsapp_do_corretor?.estado === (wa > 0 ? "acesa" : "apagada"),
    `WhatsApp do corretor: banco tem ${wa}, painel diz ${por.whatsapp_do_corretor?.estado}`);

  console.log("\n── o custo medido entra na frase ──");
  const { data: gasto } = await admin.from("marketing_spend").select("amount").eq("organization_id", ORG)
    .gte("spend_date", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const total = (gasto ?? []).reduce((s, l) => s + Number(l.amount || 0), 0);
  if (total > 0 && verbas === 0) {
    t(/R\$/.test(por.verba_por_produto?.frase ?? ""),
      `a frase da verba carrega o gasto real (${total.toFixed(2)})`,
      por.verba_por_produto?.frase);
  } else {
    console.log(`  (gasto ${total.toFixed(2)} · verbas ${verbas} — caso do custo não se aplica)`);
  }

  console.log("\n── as regras que impedem ruído ──");
  t(painel.every((l) => l.frase && l.frase.length > 20), "toda linha tem frase com consequência");
  t(painel.filter((l) => l.estado === "acesa").every((l) => l.comoAcender === null),
    "capacidade no ar não continua cobrando ação");
  t(painel.filter((l) => l.estado === "bloqueada").every((l) => l.comoAcender === null),
    "capacidade bloqueada não manda ninguém agir no degrau errado");
  t(painel.filter((l) => l.estado === "apagada").every((l) => l.comoAcender && l.onde?.startsWith("/")),
    "toda apagada diz o que fazer E onde");
  const apagadas = painel.filter((l) => l.estado === "apagada");
  const pesos = apagadas.map((l) => l.peso);
  t(pesos.every((p, i) => i === 0 || pesos[i - 1] >= p), "as de maior consequência vêm primeiro", JSON.stringify(pesos));
  t(r?.data?.naoMedidas === 0, `todas as capacidades foram medidas (não medidas: ${r?.data?.naoMedidas})`);

  console.log("\n── o corretor não enxerga isto ──");
  const email2 = `prova-escuro-corretor-${Date.now()}@atlas-teste.local`;
  const { data: u2 } = await admin.auth.admin.createUser({ email: email2, password: senha, email_confirm: true });
  const { error: e2 } = await admin.from("profiles").upsert({
    id: u2.user.id, name: "Prova Corretor", full_name: "Prova Corretor", email: email2,
    organization_id: ORG, role: "CORRETOR", access_role: "broker", commercial_role: "broker",
    reports_to: null, active: false,
  });
  if (!e2) {
    const { data: s2 } = await pub.auth.signInWithPassword({ email: email2, password: senha });
    const r2 = await fetch(`${APP}/api/v1/atlas/capacidade-no-escuro`, { headers: { authorization: `Bearer ${s2.session.access_token}` } });
    t(r2.status === 401 || r2.status === 403, `perfil sem liderança é recusado (HTTP ${r2.status})`);
    await admin.from("profiles").delete().eq("id", u2.user.id);
    await admin.auth.admin.deleteUser(u2.user.id);
  }

  console.log("\n── o painel de hoje ──");
  painel.forEach((l) => console.log(`  ${l.estado.padEnd(10)} ${l.titulo}`));
} finally {
  await admin.from("profiles").delete().eq("id", u.user.id);
  await admin.auth.admin.deleteUser(u.user.id);
  console.log("\nusuários descartáveis removidos: sim");
}
console.log(`\n${ok} passaram, ${bad} falharam.`);
process.exit(bad ? 1 : 0);
