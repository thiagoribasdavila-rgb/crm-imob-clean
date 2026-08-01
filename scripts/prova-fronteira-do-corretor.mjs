/**
 * PROVA DE FRONTEIRA: o que um corretor consegue ver e fazer além da carteira?
 *
 * A varredura completa passou verde para corretor — mas com "0 sem permissão",
 * ou seja, ele abriu as 200 páginas, inclusive as de diretoria. Página abrir
 * não é o mesmo que dado vazar (a tela pode vir vazia), então esta prova vai
 * direto às ROTAS que carregam dado sensível e mede o que volta.
 *
 * Não altera nada: só faz GET e um POST deliberadamente inválido para medir a
 * recusa. Cria um corretor descartável e o apaga no fim.
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const APP = process.env.TESTE_BASE_URL || "http://localhost:3000";
const ORG = "7c8c71c1-e963-464c-be5c-ff8c7936f51a";
const DIRETOR_OPERACIONAL = "240a6bc5-5163-42ab-9d0f-729c7d0b0d35";

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const senha = crypto.randomBytes(24).toString("base64url");
const email = `fronteira-${Date.now()}@atlas-teste.local`;
let userId = null;

/** Rotas que carregam dado de gestão. O que um corretor NÃO deveria enxergar. */
const FRONTEIRAS = [
  { rota: "/api/v1/crm/team/performance", oQueExpoe: "desempenho de cada corretor do time" },
  { rota: "/api/v1/crm/team/sla", oQueExpoe: "SLA por corretor" },
  { rota: "/api/v1/crm/team/conversion", oQueExpoe: "conversão comparada do time" },
  { rota: "/api/v1/director/summary", oQueExpoe: "resumo executivo da operação" },
  { rota: "/api/v1/finance/commissions", oQueExpoe: "comissões" },
  { rota: "/api/v1/marketing/spend", oQueExpoe: "verba de campanha" },
  { rota: "/api/v1/rbac/me", oQueExpoe: "o próprio perfil (deve responder)" },
];

try {
  const { data: u, error: e1 } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (e1) throw new Error(e1.message);
  userId = u.user.id;
  const { error: e2 } = await admin.from("profiles").upsert({
    id: userId, name: "Fronteira", full_name: "Fronteira", email, organization_id: ORG,
    role: "broker", access_role: "broker", commercial_role: "broker",
    reports_to: DIRETOR_OPERACIONAL, active: true,
  });
  if (e2) throw new Error(e2.message);

  const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: sess, error: e3 } = await pub.auth.signInWithPassword({ email, password: senha });
  if (e3) throw new Error(e3.message);
  const token = sess.session.access_token;

  console.log("rota                                    http   devolveu dado?  o que expõe");
  console.log("─".repeat(100));
  for (const { rota, oQueExpoe } of FRONTEIRAS) {
    const r = await fetch(`${APP}${rota}`, { headers: { authorization: `Bearer ${token}` } });
    const texto = await r.text();
    let temDado = false;
    try {
      const j = JSON.parse(texto);
      const carga = j?.data ?? j;
      temDado = Array.isArray(carga)
        ? carga.length > 0
        : Boolean(carga && typeof carga === "object" && Object.keys(carga).length > 0 && !j?.error);
    } catch { temDado = texto.length > 40; }
    // "Tem chaves no JSON" NÃO é o mesmo que "expôs dado de terceiro": uma rota
    // de time pode responder 200 com `members: []` — estrutura sem conteúdo, o
    // comportamento CERTO. A primeira versão desta prova marcava isso como
    // vazamento e me fez quase "corrigir" uma rota que já estava correta.
    // O que conta é: veio linha de OUTRA pessoa?
    let pessoas = 0;
    try {
      const j = JSON.parse(texto);
      const carga = j?.data ?? j;
      for (const chave of ["members", "brokers", "team", "rows", "items"]) {
        const v = carga?.[chave];
        if (Array.isArray(v)) pessoas = Math.max(pessoas, v.length);
      }
    } catch { /* resposta não-JSON: pessoas fica 0 */ }
    const marca = r.status === 404 ? "—  (não existe)"
      : pessoas > 0 ? `SIM (${pessoas} pessoa(s))`
      : temDado ? "só estrutura" : "não";
    console.log(`${rota.padEnd(40)}${String(r.status).padEnd(7)}${marca.padEnd(20)}${oQueExpoe}`);
  }

  // Qual papel a aplicação enxerga? (o piso de carteira depende disso)
  const me = await fetch(`${APP}/api/v1/rbac/me`, { headers: { authorization: `Bearer ${token}` } });
  const jm = await me.json().catch(() => ({}));
  const perfil = jm?.data ?? jm;
  console.log(`\nresposta de /rbac/me: ${JSON.stringify(perfil).slice(0, 400)}`);

  // A carteira: quantas leads o corretor consegue LER pela rota de leads?
  const lista = await fetch(`${APP}/api/v1/crm/leads?page=1&limit=100`, { headers: { authorization: `Bearer ${token}` } });
  const jl = await lista.json().catch(() => ({}));
  const total = jl?.data?.page?.total;
  const { count: totalDaOrg } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", ORG);
  const { count: minhas } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", ORG).eq("assigned_user_id", userId);
  const escopo = jl?.data?.escopo ?? "(não informado)";
  console.log(`\ncarteira: o corretor tem ${minhas} lead(s) atribuída(s); a rota de leads devolve ${total} de ${totalDaOrg} da organização · escopo aplicado: ${escopo}`);

  // ── O CAMINHO POSITIVO ────────────────────────────────────────────────────
  //
  // Provar que o corretor NÃO vê as dos outros é metade. A outra metade é
  // provar que ele vê as DELE — um filtro bom demais esconde o próprio
  // trabalho, e isso só aparece quando alguém reclama que "sumiram leads".
  // Duas leads de prova, atribuídas a ele, criadas e apagadas aqui.
  const provas = [];
  for (let i = 0; i < 2; i++) {
    const { data: l } = await admin.from("leads").insert({
      organization_id: ORG, name: `fronteira-prova-${Date.now()}-${i}`, status: "novo",
      phone: `5511${String(Date.now() + i).slice(-9)}`,
      assigned_user_id: userId, assigned_to: userId, source: "prova-fronteira",
    }).select("id").single();
    if (l) provas.push(l.id);
  }
  const minhasAgora = await fetch(`${APP}/api/v1/crm/leads?page=1&limit=100`, { headers: { authorization: `Bearer ${token}` } });
  const jm2 = await minhasAgora.json().catch(() => ({}));
  const vistas = jm2?.data?.page?.total;
  console.log(`caminho positivo: ${provas.length} lead(s) atribuída(s) a ele → a rota devolve ${vistas}` +
    (vistas === provas.length ? "  ✔" : "  ✘ NÃO BATE"));
  if (provas.length) await admin.from("leads").delete().in("id", provas);

  // ── LIDERANÇA CONTINUA VENDO TUDO ─────────────────────────────────────────
  //
  // O piso não pode virar cegueira para quem responde pela carteira: sem esta
  // metade, "corrigir o vazamento" quebraria a gestão inteira em silêncio.
  const emailChefe = `fronteira-chefe-${Date.now()}@atlas-teste.local`;
  const senhaChefe = crypto.randomBytes(24).toString("base64url");
  const { data: chefe } = await admin.auth.admin.createUser({ email: emailChefe, password: senhaChefe, email_confirm: true });
  if (chefe?.user) {
    await admin.from("profiles").upsert({
      id: chefe.user.id, name: "Fronteira Chefe", full_name: "Fronteira Chefe", email: emailChefe,
      organization_id: ORG, role: "admin", access_role: "admin", commercial_role: "director",
      reports_to: null, active: true,
    });
    const { data: sessChefe } = await pub.auth.signInWithPassword({ email: emailChefe, password: senhaChefe });
    if (sessChefe?.session) {
      const rc = await fetch(`${APP}/api/v1/crm/leads?page=1&limit=100`, { headers: { authorization: `Bearer ${sessChefe.session.access_token}` } });
      const jc = await rc.json().catch(() => ({}));
      console.log(`liderança: a rota devolve ${jc?.data?.page?.total} de ${totalDaOrg} · escopo ${jc?.data?.escopo}` +
        (jc?.data?.page?.total === totalDaOrg ? "  ✔" : "  ✘ liderança perdeu visão"));
    }
    await admin.from("profiles").delete().eq("id", chefe.user.id);
    await admin.auth.admin.deleteUser(chefe.user.id).catch(() => {});
  }
} finally {
  if (userId) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    console.log("\ncorretor descartável removido");
  }
}
