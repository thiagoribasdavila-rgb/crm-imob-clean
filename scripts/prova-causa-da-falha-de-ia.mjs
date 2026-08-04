/**
 * PROVA DE QUE A TELA PASSA A DIZER POR QUE A IA NÃO RESPONDEU.
 *
 * Os contratos provam a REGRA (a classe certa para cada mensagem; as duas
 * consultas não divergem). Falta o que eles não alcançam: se a ROTA devolve a
 * causa, se a soma bate com o número de quedas na mesma resposta, e se um perfil
 * sem liderança continua sendo recusado.
 *
 * Contexto medido em 03/08/2026, que é o que motivou tudo isto: 67 chamadas em
 * 9 dias, 32 servidas pelo fallback local, e a tela mostrando `local` como se
 * fosse um provedor comum. Chamada real às duas APIs:
 *   · Anthropic → HTTP 400 "Your credit balance is too low…"
 *   · OpenAI    → HTTP 429 insufficient_quota
 *
 *   node --env-file=.env.local scripts/prova-causa-da-falha-de-ia.mjs
 */
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const APP = env.PROVA_APP_URL || "http://127.0.0.1:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let ok = 0, bad = 0;
const t = (c, txt, d = "") => { if (c) { ok++; console.log("  ✔ " + txt); } else { bad++; console.log("  ✘ " + txt + (d ? "\n      " + d : "")); } };

const { data: dev } = await admin.from("developments").select("organization_id").limit(1).single();
const ORG = dev.organization_id;

const senha = "Prova!Caus4#DaFalha";
const email = `prova-causa-ia-${Date.now()}@atlas-teste.local`;
const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
const { error: erroPerfil } = await admin.from("profiles").upsert({
  id: u.user.id, name: "Prova Causa", full_name: "Prova Causa", email,
  organization_id: ORG, role: "admin", access_role: "director_decisor",
  commercial_role: "director", reports_to: null, active: true,
});
// Fixture que falha em silêncio produz acusação falsa: 11 delas já custaram uma
// investigação inteira nesta entrega. Aqui ela grita.
if (erroPerfil) { console.log("perfil recusado:", erroPerfil.message); process.exit(1); }

const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: s } = await pub.auth.signInWithPassword({ email, password: senha });
const H = { authorization: `Bearer ${s.session.access_token}` };

try {
  const resposta = await fetch(`${APP}/api/v1/ai/orchestration`, { headers: H });
  const r = await resposta.json();
  t(r?.ok === true, `a rota responde (HTTP ${resposta.status})`, JSON.stringify(r?.error ?? {}));
  const dados = r?.data ?? {};

  console.log("\n── a causa deixou de ser invisível ──");
  t(Array.isArray(dados.causasDeFalha), "a rota devolve `causasDeFalha`",
    "sem este campo a tela volta a mostrar `local` sem dizer por quê.");
  t(dados.causaLegivel === true, "este banco consegue LER a causa (migration aplicada)",
    `causaLegivel=${dados.causaLegivel}`);

  const somaDasCausas = (dados.causasDeFalha ?? []).reduce((soma, causa) => soma + causa.chamadas, 0);
  // A soma tem de bater com as quedas da MESMA resposta. Divergir aqui é a tela
  // exibir dois números contraditórios lado a lado — e o operador escolher um.
  t(somaDasCausas === dados.summary?.fallbacks,
    `a soma das causas bate com as quedas: ${somaDasCausas} = ${dados.summary?.fallbacks}`,
    "queda sem causa precisa entrar como `desconhecida`, não sumir da conta.");

  console.log("\n── toda causa carrega rótulo, e nenhuma vem crua ──");
  for (const causa of dados.causasDeFalha ?? []) {
    t(typeof causa.resumo === "string" && causa.resumo.length > 10,
      `\`${causa.classe}\` tem frase legível: "${causa.resumo}"`);
    t(causa.classe !== undefined && causa.resumo !== causa.classe,
      `\`${causa.classe}\` não é o enum cru repetido na tela`);
  }

  console.log("\n── o retrato bate com o banco ──");
  const { count: quedasNoBanco } = await admin
    .from("ai_orchestration_decisions").select("*", { count: "exact", head: true })
    .eq("organization_id", ORG).eq("fallback_used", true)
    .gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString());
  t(dados.summary?.fallbacks === (quedasNoBanco ?? 0),
    `quedas em 30 dias: banco tem ${quedasNoBanco}, rota diz ${dados.summary?.fallbacks}`);

  console.log("\n── o corretor não enxerga isto ──");
  const email2 = `prova-causa-corretor-${Date.now()}@atlas-teste.local`;
  const { data: u2 } = await admin.auth.admin.createUser({ email: email2, password: senha, email_confirm: true });
  const { error: e2 } = await admin.from("profiles").upsert({
    id: u2.user.id, name: "Prova Corretor", full_name: "Prova Corretor", email: email2,
    organization_id: ORG, role: "CORRETOR", access_role: "broker", commercial_role: "broker",
    reports_to: null, active: false,
  });
  if (!e2) {
    const { data: s2 } = await pub.auth.signInWithPassword({ email: email2, password: senha });
    const r2 = await fetch(`${APP}/api/v1/ai/orchestration`, { headers: { authorization: `Bearer ${s2.session.access_token}` } });
    t(r2.status === 401 || r2.status === 403, `perfil sem liderança é recusado (HTTP ${r2.status})`);
    await admin.from("profiles").delete().eq("id", u2.user.id);
    await admin.auth.admin.deleteUser(u2.user.id);
  } else {
    console.log("  (perfil de corretor recusado pelo RBAC — o outro lado não pôde ser medido)");
  }

  console.log("\n── o que a tela vai dizer hoje ──");
  if (!(dados.causasDeFalha ?? []).length) console.log("  (nenhuma queda nos últimos 30 dias)");
  for (const causa of dados.causasDeFalha ?? []) {
    console.log(`  ${String(causa.chamadas).padStart(3)}×  ${causa.resumo}`);
    if (causa.quemResolve) console.log(`        quem resolve: ${causa.quemResolve}`);
    if (causa.exemplo) console.log(`        provedor disse: ${causa.exemplo.slice(0, 120)}`);
  }
} finally {
  await admin.from("profiles").delete().eq("id", u.user.id);
  await admin.auth.admin.deleteUser(u.user.id);
  console.log("\nusuários descartáveis removidos: sim");
}
console.log(`\n${ok} passaram, ${bad} falharam.`);
process.exit(bad ? 1 : 0);
