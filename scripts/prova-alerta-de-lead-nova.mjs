/**
 * PROVA: o aviso de lead nova conta chegada, não acervo — e respeita a carteira.
 *
 * ── OS QUATRO ERROS QUE ISTO IMPEDE ──────────────────────────────────────────
 *
 * 1. Contar por `leads.created_at`. O caminho da Meta grava a data em que a
 *    pessoa preencheu o formulário no Facebook, não a data em que a lead
 *    chegou aqui — as 3 leads da Meta entraram com até 363 horas de defasagem.
 *    Um cursor por essa coluna diz "nada novo" com lead paga recém-chegada.
 *    Aqui o teste retrodata `created_at` em 15 dias de propósito.
 *
 * 2. Avisar importação. Em 2026-07-28 entraram 269 leads em um minuto. Um
 *    aviso por linha importada é bolinha vermelha permanente em forma de
 *    número, e junto com ela a pessoa aprende a ignorar a lead paga.
 *
 * 3. Contar só INSERT. Para o corretor, a lead "entra" quando cai na carteira
 *    dele — um UPDATE de assigned_user_id. As 443 nunca contatadas de hoje vão
 *    ser DISTRIBUÍDAS amanhã, não criadas.
 *
 * 4. Vazar entre corretores. É o defeito que acabou de matar a tela
 *    /customers: ela delegava a fronteira ao RLS, cuja política por
 *    organização é PERMISSIVE e anula o recorte por dono.
 *
 * Cria e APAGA os próprios dados. Não toca em lead real.
 *
 * Uso: node scripts/prova-alerta-de-lead-nova.mjs   (app de pé)
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

const { data: amostra } = await admin.from("leads").select("organization_id").limit(500);
const porOrg = new Map();
for (const l of amostra ?? []) porOrg.set(l.organization_id, (porOrg.get(l.organization_id) ?? 0) + 1);
const ORG = [...porOrg.entries()].sort((a, b) => b[1] - a[1])[0][0];

// A quem o corretor de teste responde. Sem isto o perfil não ativa.
// O gatilho `validate_commercial_hierarchy` do banco impõe: um perfil com
// access_role='broker' só pode ficar ATIVO se responder a um supervisor com
// access_role='director' (o diretor operacional). Qualquer outro supervisor
// levanta `broker_requires_operational_director` e o perfil fica inativo — e
// aí TODA rota devolve 403 PROFILE_INACTIVE, o que parece defeito da feature
// que se está testando.
const { data: lideres } = await admin
  .from("profiles")
  .select("id")
  .eq("organization_id", ORG)
  .eq("access_role", "director")
  .eq("active", true)
  .limit(1);
const LIDER = (lideres ?? [])[0]?.id;
if (!LIDER) throw new Error("Nenhum diretor operacional ativo — sem ele o corretor de teste não pode ser ativado.");

const marca = `prova-alerta-${Date.now()}`;
const criados = { leads: [], usuarios: [] };

async function criarCorretor(sufixo) {
  const email = `${marca}-${sufixo}@atlas-teste.local`;
  const senha = "Prova!Alerta7aA";
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error(error.message);
  criados.usuarios.push(u.user.id);
  // O gatilho `handle_new_auth_user` cria o perfil de forma ASSÍNCRONA e grava
  // `active = primeiro_perfil` — ou seja, false para todo mundo depois do
  // primeiro. Ele chega DEPOIS do upsert e sobrescreve. Esperar antes de
  // ativar é o que evita o teste acusar a feature errada com 403.
  await new Promise((resolva) => setTimeout(resolva, 1500));
  const { error: erroPerfil } = await admin.from("profiles").upsert({
    id: u.user.id, name: `Prova ${sufixo}`, full_name: `Prova ${sufixo}`, email, organization_id: ORG,
    role: "broker", access_role: "broker", commercial_role: "broker", active: true,
    // Sem liderança resolvida o perfil não fica ativo — o gatilho grava
    // `active = primeiro_perfil` e a hierarquia RBAC precisa estar satisfeita
    // para ele poder ser ligado. Já documentado: corretor sem `reports_to`
    // recebe 403 PROFILE_INACTIVE em todas as rotas.
    reports_to: LIDER,
  });
  // Checar o erro do upsert: sem isto, a exceção do gatilho é engolida em
  // silêncio, o perfil fica inativo e o teste acusa a feature errada.
  if (erroPerfil) throw new Error(`perfil de teste recusado: ${erroPerfil.message}`);
  // O gatilho `handle_new_auth_user` grava `active = primeiro_perfil` — todo
  // usuário criado depois do primeiro nasce INATIVO. Ele corre em paralelo com
  // o upsert acima e às vezes vence, e aí a rota devolve 403 PROFILE_INACTIVE
  // e o teste acusa a feature errada. Força e CONFERE que pegou.
  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    await admin.from("profiles").update({ active: true }).eq("id", u.user.id);
    const { data: perfil } = await admin.from("profiles").select("active").eq("id", u.user.id).single();
    if (perfil?.active === true) break;
    await new Promise((resolva) => setTimeout(resolva, 150));
  }
  const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: sess, error: e2 } = await pub.auth.signInWithPassword({ email, password: senha });
  if (e2) throw new Error(e2.message);
  return { id: u.user.id, token: sess.session.access_token };
}

const alertasDe = async (token) => {
  const r = await fetch(`${APP}/api/v1/crm/alertas-de-lead`, { headers: { authorization: `Bearer ${token}` } });
  return { http: r.status, corpo: await r.json().catch(() => null) };
};

try {
  const dono = await criarCorretor("dono");
  const colega = await criarCorretor("colega");

  // ── 1. Lead que chega direto na carteira, com created_at RETRODATADO ───────
  console.log("\nchegada com data de origem retrodatada (o caso da Meta):");
  const antiga = new Date(Date.now() - 15 * 86_400_000).toISOString();
  const { data: leadMeta } = await admin.from("leads").insert({
    organization_id: ORG, name: `${marca} meta`, status: "novo",
    assigned_user_id: dono.id, created_at: antiga,
  }).select("id").single();
  criados.leads.push(leadMeta.id);

  const { data: alertaMeta } = await admin.from("lead_alerts")
    .select("motivo,detectado_em").eq("lead_id", leadMeta.id);
  conferir("gera aviso mesmo com created_at de 15 dias atrás", (alertaMeta ?? []).length === 1,
    `${(alertaMeta ?? []).length} aviso(s)`);
  const carimbo = alertaMeta?.[0]?.detectado_em ? Date.parse(alertaMeta[0].detectado_em) : 0;
  conferir("o carimbo é o de AGORA, não o da origem", Math.abs(Date.now() - carimbo) < 120_000,
    `detectado_em ${alertaMeta?.[0]?.detectado_em?.slice(0, 19)} · created_at ${antiga.slice(0, 10)}`);

  // ── 2. Importação NÃO avisa ───────────────────────────────────────────────
  console.log("\nimportação em lote não vira ruído:");
  // Reaproveita um lote REAL da base: import_batch_id tem chave estrangeira,
  // e inventar um uuid faria o insert falhar por um motivo que não é o do teste.
  const { data: comLote } = await admin.from("leads")
    .select("import_batch_id").not("import_batch_id", "is", null).limit(1).single();
  const { data: leadImportada, error: erroImport } = await admin.from("leads").insert({
    organization_id: ORG, name: `${marca} importada`, status: "novo",
    assigned_user_id: dono.id, import_batch_id: comLote.import_batch_id,
  }).select("id").single();
  if (erroImport) throw new Error(`insert de importada falhou: ${erroImport.message}`);
  criados.leads.push(leadImportada.id);
  const { data: semAviso } = await admin.from("lead_alerts").select("id").eq("lead_id", leadImportada.id);
  conferir("lead com import_batch_id não gera aviso", (semAviso ?? []).length === 0,
    `${(semAviso ?? []).length} aviso(s) — 269 delas entraram em um minuto em 28/07`);

  // ── 3. Distribuição (UPDATE) avisa ────────────────────────────────────────
  console.log("\ndistribuição avisa quem recebeu:");
  const { data: orfa } = await admin.from("leads").insert({
    organization_id: ORG, name: `${marca} orfa`, status: "novo", assigned_user_id: null,
  }).select("id").single();
  criados.leads.push(orfa.id);
  await admin.from("leads").update({ assigned_user_id: dono.id }).eq("id", orfa.id);
  const { data: porAtribuicao } = await admin.from("lead_alerts")
    .select("motivo").eq("lead_id", orfa.id).eq("motivo", "atribuicao");
  conferir("UPDATE de assigned_user_id gera aviso de atribuição", (porAtribuicao ?? []).length === 1,
    "é assim que a lead 'entra' para o corretor amanhã");

  // ── 4. A rota conta certo, e só para quem é ───────────────────────────────
  console.log("\na rota respeita a carteira:");
  const doDono = await alertasDe(dono.token);
  conferir("a rota responde", doDono.http === 200, `http ${doDono.http}`);
  // DUAS, não três. A lead órfã gerou um aviso de CRIAÇÃO com destinatário
  // nulo — esse é da liderança, porque lead sem dono é problema de
  // distribuição — e depois um de ATRIBUIÇÃO para o corretor. Ele vê a
  // criação da lead 1 e a atribuição da lead 3.
  conferir("o dono vê as 2 chegadas que são dele", doDono.corpo?.data?.novas === 2,
    `viu ${doDono.corpo?.data?.novas} · por motivo: ${JSON.stringify(doDono.corpo?.data?.porMotivo)}`);
  conferir("o escopo declarado é a carteira", doDono.corpo?.data?.escopo === "carteira",
    doDono.corpo?.data?.escopo);

  const doColega = await alertasDe(colega.token);
  conferir("o COLEGA não vê nenhuma delas", doColega.corpo?.data?.novas === 0,
    `viu ${doColega.corpo?.data?.novas} — é o vazamento que matou a tela /customers`);

  // ── 5. Marcar como visto zera, e não ressuscita ───────────────────────────
  console.log("\nabrir a lista apaga o aviso:");
  const post = await fetch(`${APP}/api/v1/crm/alertas-de-lead`, {
    method: "POST", headers: { authorization: `Bearer ${dono.token}` },
  });
  conferir("o POST responde", post.status === 200, `http ${post.status}`);
  const depois = await alertasDe(dono.token);
  conferir("depois de visto, zera", depois.corpo?.data?.novas === 0, `ficou ${depois.corpo?.data?.novas}`);

  // ── 6. Uma chegada nova DEPOIS de visto volta a acender ───────────────────
  const { data: maisUma } = await admin.from("leads").insert({
    organization_id: ORG, name: `${marca} depois`, status: "novo", assigned_user_id: dono.id,
  }).select("id").single();
  criados.leads.push(maisUma.id);
  const reacende = await alertasDe(dono.token);
  conferir("chegada nova depois de visto acende de novo", reacende.corpo?.data?.novas === 1,
    `${reacende.corpo?.data?.novas} — sem isto o aviso só funcionaria uma vez`);
} finally {
  // Limpeza: nada de teste pode sobrar. Já sobraram 43 usuários uma vez.
  for (const id of criados.leads) {
    await admin.from("lead_alerts").delete().eq("lead_id", id);
    await admin.from("leads").delete().eq("id", id);
  }
  for (const id of criados.usuarios) {
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`\nlimpeza: ${criados.leads.length} lead(s) e ${criados.usuarios.length} usuário(s) de teste removidos`);
}

console.log(`\n${"═".repeat(70)}`);
console.log(`PROVA: ${ok}/${ok + falhou}`);
if (falhou) process.exit(1);
console.log("O aviso conta chegada, não acervo — e não atravessa carteira.");
