/**
 * PROVA: a página do cliente parou de receber `opportunities: []` cravado.
 *
 * ── POR QUE ESTA PROVA PRECISA CRIAR DADO ───────────────────────────────────
 *
 * `GET /api/v1/leads/[id]` devolvia `opportunities: []` FIXO. Não era enfeite: a
 * tela usa o TAMANHO dessa lista para somar +10 na prontidão e para classificar
 * risco. Com `[]` cravado, nenhuma lead podia ser "risco baixo" — o ramo era
 * inalcançável — e a prontidão tinha teto de 90 para todo mundo.
 *
 * A armadilha desta prova: a tabela `opportunities` está VAZIA na base. Um teste
 * que só conferisse "veio array vazio" ficaria verde tanto com o conserto quanto
 * com o `[]` cravado que ele substituiu — provaria exatamente nada. Por isso a
 * prova CRIA duas oportunidades descartáveis, uma em cada lead, e exige que cada
 * rota devolva a sua e SÓ a sua. É o único jeito de os dois lados do filtro
 * ficarem visíveis.
 *
 * As duas linhas criadas são removidas no `finally`, junto do usuário. Elas
 * carregam marca em `commission_notes` para serem reconhecíveis caso algo
 * interrompa a execução.
 *
 * Uso: node scripts/prova-oportunidades-da-lead.mjs
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

const MARCA = `PROVA-DESCARTAVEL-${Date.now()}`;
const email = `prova-oportunidades-${Date.now()}@atlas-teste.local`;
const senha = "Prova!Oportunidade7bB";
let userId = null;
const criadas = [];

// A organização que realmente tem operação, e duas leads distintas dentro dela.
const { data: todasLeads } = await admin.from("leads").select("id,organization_id,name").limit(2000);
const porOrg = new Map();
for (const l of todasLeads ?? []) {
  if (!porOrg.has(l.organization_id)) porOrg.set(l.organization_id, []);
  porOrg.get(l.organization_id).push(l);
}
const [org, leadsDaOrg] = [...porOrg.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
if (!org || (leadsDaOrg?.length ?? 0) < 2) {
  console.error("Preciso de duas leads na mesma organização para provar os dois lados do filtro.");
  process.exit(2);
}
const [leadA, leadB] = leadsDaOrg;
console.log(`\norganização ${org} · lead A ${leadA.id} · lead B ${leadB.id}\n`);

try {
  const { data: u, error: e1 } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (e1) throw new Error(e1.message);
  userId = u.user.id;
  await admin.from("profiles").upsert({
    id: userId, name: "Prova Oportunidades", full_name: "Prova Oportunidades", email, organization_id: org,
    role: "admin", access_role: "admin", commercial_role: "director", active: true,
  });

  const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: sess, error: e3 } = await pub.auth.signInWithPassword({ email, password: senha });
  if (e3) throw new Error(e3.message);
  const token = sess.session.access_token;

  const buscar = async (leadId) => {
    const r = await fetch(`${APP}/api/v1/leads/${leadId}`, { headers: { authorization: `Bearer ${token}` } });
    return { status: r.status, corpo: await r.json().catch(() => null) };
  };

  // ── ANTES de criar: o payload não carrega mais os campos cravados ──────────
  const antes = await buscar(leadA.id);
  conferir("a rota da lead responde", antes.status === 200, `http ${antes.status}`);
  conferir("`properties` cravado saiu do payload", !("properties" in (antes.corpo ?? {})),
    "properties" in (antes.corpo ?? {}) ? "ainda presente" : "ausente");
  conferir("`experienceSignals` cravado saiu do payload", !("experienceSignals" in (antes.corpo ?? {})),
    "experienceSignals" in (antes.corpo ?? {}) ? "ainda presente" : "ausente");
  conferir("a leitura de oportunidades foi medida", antes.corpo?.opportunitiesMensuraveis === true,
    `mensuravel=${antes.corpo?.opportunitiesMensuraveis}`);
  const zeroAntes = Array.isArray(antes.corpo?.opportunities) && antes.corpo.opportunities.length === 0;
  conferir("sem oportunidade cadastrada, a lista vem vazia", zeroAntes,
    `${antes.corpo?.opportunities?.length} item(ns)`);

  // ── Cria uma em cada lead. Sem isto, "vazio" não distingue conserto de bug ─
  for (const [rotulo, lead] of [["A", leadA], ["B", leadB]]) {
    const { data, error } = await admin.from("opportunities").insert({
      organization_id: org, lead_id: lead.id, stage: "negociacao", probability: 50,
      value: rotulo === "A" ? 111111 : 222222, commission_notes: `${MARCA}-${rotulo}`,
    }).select("id").single();
    if (error) throw new Error(`insert ${rotulo}: ${error.message}`);
    criadas.push(data.id);
  }
  console.log(`\n  (criadas 2 oportunidades descartáveis: ${criadas.join(", ")})\n`);

  const depoisA = await buscar(leadA.id);
  const depoisB = await buscar(leadB.id);
  const listaA = depoisA.corpo?.opportunities ?? [];
  const listaB = depoisB.corpo?.opportunities ?? [];

  conferir("a lead A passa a ver a oportunidade dela", listaA.length === 1 && listaA[0].id === criadas[0],
    `${listaA.length} item(ns)${listaA[0] ? ` · valor ${listaA[0].value}` : ""}`);
  conferir("a lead B passa a ver a oportunidade dela", listaB.length === 1 && listaB[0].id === criadas[1],
    `${listaB.length} item(ns)${listaB[0] ? ` · valor ${listaB[0].value}` : ""}`);
  // O outro lado do filtro: cada lead vê a sua e NÃO a da vizinha.
  conferir("a lead A não vê a oportunidade da lead B", !listaA.some((o) => o.id === criadas[1]));
  conferir("a lead B não vê a oportunidade da lead A", !listaB.some((o) => o.id === criadas[0]));
  conferir("o valor chega íntegro até a tela", Number(listaA[0]?.value) === 111111,
    `recebido ${listaA[0]?.value}`);
} catch (erro) {
  console.error(`\nFALHA: ${erro.message}`);
  falhou += 1;
} finally {
  for (const id of criadas) await admin.from("opportunities").delete().eq("id", id);
  if (userId) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  }
  const { count } = await admin.from("opportunities").select("id", { count: "exact", head: true }).like("commission_notes", "PROVA-DESCARTAVEL-%");
  console.log(`\n  (limpeza: ${criadas.length} oportunidade(s) removida(s) · sobrou ${count ?? "?"} linha de prova na tabela)`);
}

console.log(`\n${falhou === 0 ? "✔" : "✘"} ${ok} passaram · ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
