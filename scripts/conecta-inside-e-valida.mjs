/**
 * CONECTAR A PÁGINA DA INSIDE AO CRM, E VALIDAR COM UM RECORTE PEQUENO.
 *
 * ── O que esta ligação resolve ────────────────────────────────────────────
 *
 * Medido em 03/08/2026: os 85 anúncios da conta "Inside - Senna" publicam sob a
 * Página `1115087091694606` ("Inside Smart Apartment Perdizes"), e não sob a
 * `582258611872380` (DA'Vila Consultoria) — a única que o CRM conhecia. São 202
 * leads acumuladas, com leads NOVAS entrando todo dia (5 em 03/08, 8 em 02/08).
 *
 * Depois de atribuir o System User à Página com MANAGE_LEADS, a leitura passou
 * a funcionar. Falta a inscrição em tempo real, que exige a tarefa MANAGE — e
 * essa só o dono da Página (a agência) concede.
 *
 * ── POR QUE SÓ AS DE HOJE ────────────────────────────────────────────────
 *
 * Puxar as 202 de uma vez, com 3 corretores e 51 leads já esperando sem dono,
 * seria repetir de propósito o problema que estamos consertando. O recorte de
 * hoje prova a corrente inteira — Graph → evento → outbox → worker → lead —
 * com volume que a operação absorve.
 *
 *   node scripts/conecta-inside-e-valida.mjs            # registra e simula
 *   node scripts/conecta-inside-e-valida.mjs --executar # registra, ativa e puxa as de hoje
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const APP = process.env.TESTE_BASE_URL || "http://127.0.0.1:3000";
const ORG = "7c8c71c1-e963-464c-be5c-ff8c7936f51a";
const PAGINA_INSIDE = "1115087091694606";
const FORM_INSIDE = "3372949812871909";
const EXECUTAR = process.argv.includes("--executar");

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const conta = async (t, f = (q) => q) => (await f(admin.from(t).select("*", { count: "exact", head: true }))).count ?? 0;

const antes = {
  fontes: await conta("meta_lead_sources"),
  eventos: await conta("meta_lead_events"),
  leads: await conta("leads", (q) => q.eq("organization_id", ORG)),
  semDono: await conta("leads", (q) => q.eq("organization_id", ORG).is("assigned_to", null)),
};
console.log("── ANTES ──");
console.log(`  fontes: ${antes.fontes} | eventos: ${antes.eventos} | leads: ${antes.leads} | sem dono: ${antes.semDono}`);

const criado = { usuario: null };
let falhas = 0;
const ok = (c, m) => { console.log(`${c ? "✔" : "✘"} ${m}`); if (!c) falhas++; };

try {
  const senha = crypto.randomBytes(24).toString("base64url");
  const email = `inside-${Date.now()}@atlas-teste.local`;
  const { data: u, error: e1 } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (e1) throw new Error(`createUser: ${e1.message}`);
  criado.usuario = u.user.id;
  const { error: e2 } = await admin.from("profiles").upsert({
    id: u.user.id, name: "Conexão Inside", full_name: "Conexão Inside", email, organization_id: ORG,
    role: "admin", access_role: "admin", commercial_role: "director", reports_to: null, active: true,
  });
  if (e2) throw new Error(`profile: ${e2.message}`);
  const pub = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  const { data: sess, error: e3 } = await pub.auth.signInWithPassword({ email, password: senha });
  if (e3) throw new Error(`login: ${e3.message}`);
  const token = sess.session.access_token;

  // ── 1. DESCOBRIR pelo produto, não por INSERT direto ────────────────────
  // Usar a rota é o que prova que a tela conseguiria fazer isto sozinha. Um
  // INSERT no banco provaria só que eu sei escrever SQL.
  console.log("\n── 1. descobrir os formulários da Página da Inside ──");
  const descobrir = async (aplicar) => {
    const r = await fetch(`${APP}/api/v1/integrations/meta/discover-forms`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        pageId: PAGINA_INSIDE,
        formId: null,
        sourceName: "Inside Smart Apartment Perdizes",
        allForms: true,
        aplicar,
      }),
    });
    return { status: r.status, corpo: await r.json().catch(() => ({})) };
  };

  const simulacao = await descobrir(false);
  ok(simulacao.status === 200, `descoberta respondeu 200 (veio ${simulacao.status})`);
  const d = simulacao.corpo?.data ?? simulacao.corpo;
  if (simulacao.status === 200) {
    console.log(`  Página resolvida: ${d.pageId} | na Meta: ${d.encontradosNaMeta} formulário(s) | leads lá: ${d.leadsAcumuladosNaMeta}`);
    console.log(`  novos para registrar: ${d.novos?.length ?? 0} | já registrados: ${d.jaRegistrados}`);
    ok(d.pageId === PAGINA_INSIDE, `a rota usou a Página do PEDIDO (${d.pageId}), não a do cadastro nem a do ambiente`);
  } else {
    console.log("  corpo:", JSON.stringify(simulacao.corpo).slice(0, 300));
  }

  if (!EXECUTAR) {
    console.log("\n  ⏸ nada foi gravado (rode com --executar para registrar e puxar as de hoje).");
  } else {
    const aplicado = await descobrir(true);
    const da = aplicado.corpo?.data ?? aplicado.corpo;
    ok(aplicado.status === 200, `registro respondeu 200 (veio ${aplicado.status})`);
    console.log(`  registrados: ${da?.registrados ?? 0} (INATIVOS, como manda o desenho)`);

    // ── 2. ATIVAR só o formulário que tem lead ────────────────────────────
    // Ativar todos ligaria também o arquivado, que nunca traria nada e sujaria
    // o painel de fontes com uma linha que não faz nada.
    const { data: ativadas, error: erroAtivar } = await admin
      .from("meta_lead_sources")
      .update({ active: true })
      .eq("organization_id", ORG)
      .eq("page_id", PAGINA_INSIDE)
      .eq("form_id", FORM_INSIDE)
      .select("id,name,active");
    ok(!erroAtivar && (ativadas ?? []).length === 1, `formulário ativo da Inside ligado (${(ativadas ?? []).length} linha)`);

    // ── 3. PUXAR só as de hoje ────────────────────────────────────────────
    const inicioDeHoje = Math.floor(new Date(new Date().toISOString().slice(0, 10) + "T00:00:00-03:00").getTime() / 1000);
    console.log(`\n── 3. backfill desde ${new Date(inicioDeHoje * 1000).toISOString()} (só hoje) ──`);
    const rb = await fetch(`${APP}/api/v1/integrations/meta/backfill`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ sinceUnix: inicioDeHoje, pageId: PAGINA_INSIDE }),
    });
    const b = await rb.json().catch(() => ({}));
    ok(rb.status === 200, `backfill respondeu 200 (veio ${rb.status})`);
    console.log(`  buscadas: ${b.fetched} | enfileiradas: ${b.accepted} | duplicadas: ${b.duplicates} | sem tarefa: ${b.notQueued}`);
    ok(Number(b.notQueued ?? 0) === 0, "nenhuma lead ficou sem tarefa no outbox");

    // ── 4. drenar o outbox ────────────────────────────────────────────────
    const segredo = env.ATLAS_CRON_SECRET;
    if (!segredo) throw new Error("ATLAS_CRON_SECRET ausente");
    let voltas = 0, processadas = 0;
    while (voltas < 20) {
      voltas += 1;
      const rw = await fetch(`${APP}/api/v2/outbox/process`, {
        method: "POST", headers: { authorization: `Bearer ${segredo}`, "content-type": "application/json" }, body: "{}",
      });
      const w = await rw.json().catch(() => ({}));
      const n = Number(w.processed ?? w.data?.processed ?? 0);
      processadas += n;
      if (!n) break;
    }
    console.log(`  worker processou ${processadas} tarefa(s)`);
  }

  // ── CONFERÊNCIA ─────────────────────────────────────────────────────────
  const depois = {
    fontes: await conta("meta_lead_sources"),
    eventos: await conta("meta_lead_events"),
    leads: await conta("leads", (q) => q.eq("organization_id", ORG)),
    semDono: await conta("leads", (q) => q.eq("organization_id", ORG).is("assigned_to", null)),
    daInside: await conta("meta_lead_events", (q) => q.eq("page_id", PAGINA_INSIDE)),
  };
  console.log("\n── DEPOIS ──");
  console.log(`  fontes: ${antes.fontes} → ${depois.fontes}`);
  console.log(`  eventos: ${antes.eventos} → ${depois.eventos}  (da Inside: ${depois.daInside})`);
  console.log(`  leads: ${antes.leads} → ${depois.leads}  (+${depois.leads - antes.leads})`);
  console.log(`  sem dono: ${antes.semDono} → ${depois.semDono}`);

  // Atribuição: a diferença que a Inside traz. Na DA'Vila, campaign_id vinha
  // vazio; aqui as 100 lidas na Graph tinham campanha E anúncio.
  if (EXECUTAR) {
    const { data: comAtrib } = await admin
      .from("meta_lead_events")
      .select("campaign_external_id,ad_id")
      .eq("page_id", PAGINA_INSIDE)
      .limit(200);
    const total = (comAtrib ?? []).length;
    const comCampanha = (comAtrib ?? []).filter((e) => e.campaign_external_id).length;
    ok(total === 0 || comCampanha === total, `atribuição preservada: ${comCampanha}/${total} eventos com campanha`);
  }
} catch (erro) {
  falhas += 1;
  console.error("✘ interrompido:", erro.message);
} finally {
  if (criado.usuario) {
    await admin.from("profiles").delete().eq("id", criado.usuario);
    await admin.auth.admin.deleteUser(criado.usuario).catch(() => {});
    console.log("\n  usuário de conexão removido");
  }
  console.log(falhas ? `\n✘ ${falhas} falha(s)` : "\n✔ conexão da Inside validada");
  process.exit(falhas ? 1 : 0);
}
