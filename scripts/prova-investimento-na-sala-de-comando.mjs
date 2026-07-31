#!/usr/bin/env node
/**
 * PROVA: O DINHEIRO CHEGOU À TELA — E O NÚMERO FALSO NÃO.
 *
 * Contrato prova a regra. Esta prova responde outra pergunta, que contrato
 * nenhum responde: a rota REAL, autenticada, contra o banco REAL, devolve o que
 * o módulo puro promete?
 *
 * É a diferença que já custou caro nesta base: `check-meta-forecast` ficou verde
 * por semanas provando que uma função existia enquanto nenhum consumidor a
 * chamava.
 *
 * O que se prova aqui:
 *   1. a rota responde e o bloco `investimento` existe (não é `undefined`);
 *   2. o total dela é IGUAL à soma do banco — não parecido;
 *   3. o CPL é recusado, e a recusa vem com o motivo escrito;
 *   4. R$ 150,50 (o CPL falso: 3.612,01 ÷ 24) não aparece em lugar nenhum;
 *   5. as duas pilhas — gasto sem lead, lead sem gasto — batem com o banco.
 *
 * O usuário criado é descartável e é REMOVIDO no final, inclusive em erro.
 *
 * uso: node --env-file=.env.local scripts/prova-investimento-na-sala-de-comando.mjs
 */
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const APP = env.PROVA_APP_URL || "http://localhost:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let passou = 0;
let falhou = 0;
const ok = (cond, texto, detalhe = "") => {
  if (cond) { passou += 1; console.log(`  ✔ ${texto}`); }
  else { falhou += 1; console.log(`  ✘ ${texto}${detalhe ? `\n      ${detalhe}` : ""}`); }
};

// ── O que o BANCO diz, medido por fora da rota ─────────────────────────────
const { data: orgs } = await admin.from("meta_conversion_configs").select("organization_id");
const org = orgs?.[0]?.organization_id;
if (!org) { console.error("Nenhuma organização com integração da Meta. Nada a provar."); process.exit(2); }

const { data: gastoBruto } = await admin
  .from("marketing_spend")
  .select("amount,campaign_id,marketing_campaigns(external_campaign_id)")
  .eq("organization_id", org);
const { data: toques } = await admin
  .from("lead_attribution_touches")
  .select("lead_id,campaign_external_id")
  .eq("organization_id", org)
  .not("campaign_external_id", "is", null);

const reaisPorCampanha = new Map();
for (const linha of gastoBruto ?? []) {
  const bruto = linha.marketing_campaigns;
  const ext = (Array.isArray(bruto) ? bruto[0] : bruto)?.external_campaign_id;
  if (!ext) continue;
  reaisPorCampanha.set(ext, (reaisPorCampanha.get(ext) ?? 0) + Number(linha.amount));
}
const leadsPorCampanha = new Map();
for (const t of toques ?? []) {
  if (!leadsPorCampanha.has(t.campaign_external_id)) leadsPorCampanha.set(t.campaign_external_id, new Set());
  leadsPorCampanha.get(t.campaign_external_id).add(t.lead_id);
}
const centavos = (n) => Math.round(n * 100) / 100;
const totalNoBanco = centavos([...reaisPorCampanha.values()].reduce((s, v) => s + v, 0));
const soGasto = [...reaisPorCampanha.entries()].filter(([ext]) => !(leadsPorCampanha.get(ext)?.size > 0));
const soLead = [...leadsPorCampanha.entries()].filter(([ext]) => !(reaisPorCampanha.get(ext) > 0));
const comAsDuas = [...reaisPorCampanha.keys()].filter((ext) => leadsPorCampanha.get(ext)?.size > 0);

console.log(`\norganização ${org}`);
console.log(`  banco: R$ ${totalNoBanco.toFixed(2)} em ${reaisPorCampanha.size} campanhas`);
console.log(`  banco: ${soGasto.length} campanha(s) com gasto e sem lead · ${soLead.length} com lead e sem gasto · ${comAsDuas.length} com as duas pontas\n`);

const email = `prova-investimento-${Date.now()}@atlas-teste.local`;
const senha = "Prova!Invest1m3nt0";
let userId = null;

try {
  const { data: u, error: e1 } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (e1) throw new Error(e1.message);
  userId = u.user.id;
  // As três formas de perfil que o RBAC aceita — `commercial_role` é quem manda.
  await admin.from("profiles").upsert({
    id: userId, name: "Prova Investimento", full_name: "Prova Investimento", email,
    organization_id: org, role: "admin", access_role: "admin", commercial_role: "director", active: true,
  });

  const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: sess, error: e3 } = await pub.auth.signInWithPassword({ email, password: senha });
  if (e3) throw new Error(e3.message);

  const resposta = await fetch(`${APP}/api/v1/analytics/sala-de-comando`, {
    headers: { authorization: `Bearer ${sess.session.access_token}` },
  });
  const corpo = await resposta.json().catch(() => null);
  const bruto = JSON.stringify(corpo);
  const inv = corpo?.data?.investimento ?? corpo?.investimento;

  console.log("── a rota real, autenticada ──");
  ok(resposta.status === 200, `HTTP 200 (recebido ${resposta.status})`);
  ok(!!inv, "o bloco `investimento` existe na resposta", "ausente = a tela mostraria o card vazio sem saber por quê");

  if (inv) {
    console.log("\n── o número é o mesmo do banco, não parecido ──");
    ok(inv.importado === true, "declara que há investimento importado");
    ok(inv.investimentoTotal === totalNoBanco,
      `total da rota = total do banco (R$ ${totalNoBanco.toFixed(2)})`,
      `rota devolveu R$ ${Number(inv.investimentoTotal).toFixed(2)}`);
    const leadsNoBanco = [...leadsPorCampanha.values()].reduce((s, v) => s + v.size, 0);
    ok(inv.leadsAtribuidas === leadsNoBanco, `leads atribuídas = ${leadsNoBanco}`, `rota devolveu ${inv.leadsAtribuidas}`);
    ok(inv.campanhas.length === new Set([...reaisPorCampanha.keys(), ...leadsPorCampanha.keys()]).size,
      "toda campanha das duas pontas aparece na lista");

    console.log("\n── as duas pilhas ──");
    ok(inv.gastoSemLead.campanhas === soGasto.length, `${soGasto.length} campanha(s) com gasto e sem lead`);
    ok(inv.gastoSemLead.reais === centavos(soGasto.reduce((s, [, v]) => s + v, 0)), "o dinheiro parado nessas campanhas bate");
    ok(inv.leadSemGasto.campanhas === soLead.length, `${soLead.length} campanha(s) com lead e sem gasto`);

    console.log("\n── o número falso não nasce ──");
    if (comAsDuas.length === 0) {
      ok(inv.cplGlobal === null, "CPL recusado — nenhuma campanha tem as duas pontas");
      ok(typeof inv.porqueSemCpl === "string" && inv.porqueSemCpl.length > 60, "a recusa vem com o motivo escrito");
      const falso = totalNoBanco / Math.max(1, [...leadsPorCampanha.values()].reduce((s, v) => s + v.size, 0));
      const comoAparece = falso.toFixed(2).replace(".", ",");
      ok(!bruto.includes(comoAparece) && !bruto.includes(falso.toFixed(2)),
        `o CPL falso (R$ ${comoAparece}) não aparece na resposta`,
        "dividir o custo de uma conta pelo resultado de outra dá um número plausível e errado");
    } else {
      ok(inv.cplGlobal !== null, `CPL afirmado sobre ${comAsDuas.length} campanha(s) com as duas pontas`);
      ok(inv.porqueSemCpl === null, "sem frase de recusa quando o CPL pode ser afirmado");
    }

    console.log("\n── nenhuma campanha inventa CPL sozinha ──");
    const inventaram = inv.campanhas.filter((c) => c.cpl !== null && !(c.reais > 0 && c.leads > 0));
    ok(inventaram.length === 0, "nenhuma campanha tem CPL sem as duas pontas",
      inventaram.map((c) => `${c.externalId}: R$ ${c.reais} / ${c.leads} leads → cpl ${c.cpl}`).join(" · "));
  }
} finally {
  if (userId) {
    // Perfil primeiro (FK), depois o usuário. Sujeira de prova em base viva é
    // dívida que a próxima auditoria vai confundir com dado real.
    await admin.from("profiles").delete().eq("id", userId);
    const { error } = await admin.auth.admin.deleteUser(userId);
    console.log(`\nusuário descartável removido: ${error ? `FALHOU (${error.message})` : "sim"}`);
  }
}

console.log(`\n${passou} passaram, ${falhou} falharam.`);
process.exit(falhou > 0 ? 1 : 0);
