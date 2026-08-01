/**
 * PROVA DO CICLO FECHADO: venda registrada no CRM volta para a Meta.
 *
 * Percorre o caminho REAL, ponta a ponta:
 *   1. cria um corretor e uma lead descartáveis;
 *   2. move a lead para "ganho" pela rota /api/v1/pipeline — primeiro SEM
 *      valor (tem que recusar), depois COM valor;
 *   3. confere no banco que o valor foi apurado;
 *   4. dispara o worker /api/v2/marketing/capi-feedback/process;
 *   5. confirma que o evento de venda saiu para a Meta.
 *   6. apaga tudo o que criou.
 *
 * O envio vai em modo TESTE (test_event_code em meta_conversion_configs): a
 * Meta registra na ferramenta "Test Events" e NÃO usa na otimização. Nenhuma
 * conversão real é criada, nenhuma verba se move. Nenhum token é impresso.
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
const DIRETOR = "240a6bc5-5163-42ab-9d0f-729c7d0b0d35";
const VALOR = 487500.5;

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const marca = `ciclo-${Date.now()}`;
const criado = { usuario: null, lead: null };
let falhas = 0;
const ok = (cond, msg) => { console.log(`${cond ? "✔" : "✘"} ${msg}`); if (!cond) falhas++; };

try {
  // ── 1. corretor e lead descartáveis ──────────────────────────────────────
  const senha = crypto.randomBytes(24).toString("base64url");
  const email = `${marca}@atlas-teste.local`;
  const { data: u, error: e1 } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (e1) throw new Error(`createUser: ${e1.message}`);
  criado.usuario = u.user.id;
  const { error: e2 } = await admin.from("profiles").upsert({
    id: u.user.id, name: "Prova Ciclo", full_name: "Prova Ciclo", email, organization_id: ORG,
    role: "broker", access_role: "broker", commercial_role: "broker", reports_to: DIRETOR, active: true,
  });
  if (e2) throw new Error(`profile: ${e2.message}`);

  // Lead com identificadores (a CAPI precisa de e-mail/telefone para casar) e
  // consentimento, porque a config exige consentimento.
  const { data: lead, error: e3 } = await admin.from("leads").insert({
    organization_id: ORG, name: `${marca} comprador`, status: "proposta",
    // Telefone único por execução: o CRM tem regra de lead única por contato, e
    // um número fixo colide com a prova anterior (ou com uma lead real).
    email: `${marca}@exemplo.invalido`, phone: `5511${String(Date.now()).slice(-9)}`,
    assigned_user_id: u.user.id, assigned_to: u.user.id, source: "prova-ciclo-fechado",
    // O caminho é `metadata.meta.dataSharingConsent === true` — exatamente
    // este. Na primeira versão da prova gravei `metadata.consent.granted` e a
    // lead foi suprimida por falta de consentimento; a supressão estava CERTA e
    // a prova é que estava errada. Vale como lembrete de qual é a chave real.
    metadata: { meta: { dataSharingConsent: true, consentSource: "prova-automatizada", consentAt: new Date().toISOString() } },
  }).select("id").single();
  if (e3) throw new Error(`lead: ${e3.message}`);
  criado.lead = lead.id;

  const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: sess, error: e4 } = await pub.auth.signInWithPassword({ email, password: senha });
  if (e4) throw new Error(`login: ${e4.message}`);
  const mover = (corpo) => fetch(`${APP}/api/v1/pipeline`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${sess.session.access_token}` },
    body: JSON.stringify(corpo),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));

  // ── 2. fechar SEM valor tem que ser recusado ─────────────────────────────
  const semValor = await mover({ leadId: lead.id, stage: "ganho", expectedFromStage: "proposta" });
  ok(semValor.status === 400, `fechar sem valor é recusado (veio ${semValor.status})`);
  const codigo = semValor.json?.error?.code ?? semValor.json?.code;
  ok(codigo === "SALE_VALUE_REQUIRED", `com o código SALE_VALUE_REQUIRED (veio ${codigo})`);
  ok(/valor/i.test(JSON.stringify(semValor.json)), "e a recusa explica o caminho ao corretor");

  // valor negativo também não passa
  const negativo = await mover({ leadId: lead.id, stage: "ganho", expectedFromStage: "proposta", saleValueBrl: -10 });
  ok((negativo.json?.error?.code ?? negativo.json?.code) === "SALE_VALUE_INVALID", "valor negativo é barrado");

  // ── 3. fechar COM valor ──────────────────────────────────────────────────
  const comValor = await mover({ leadId: lead.id, stage: "ganho", expectedFromStage: "proposta", saleValueBrl: VALOR });
  ok(comValor.status === 200, `fechar com valor funciona (veio ${comValor.status})`);

  const { data: depois } = await admin.from("leads").select("status,sale_value_brl,sale_value_recorded_at").eq("id", lead.id).single();
  ok(depois?.status === "ganho", `banco confirma etapa ganho (veio ${depois?.status})`);
  ok(Number(depois?.sale_value_brl) === VALOR, `banco confirma valor apurado ${VALOR} (veio ${depois?.sale_value_brl})`);
  ok(Boolean(depois?.sale_value_recorded_at), "e a data da apuração foi carimbada");

  // ── 4. o worker devolve para a Meta ──────────────────────────────────────
  const worker = await fetch(`${APP}/api/v2/marketing/capi-feedback/process`, { method: "POST" });
  const r = await worker.json().catch(() => ({}));
  console.log(`\nworker: montados=${r.eventosMontados} enviados=${r.eventosEnviados}`);
  for (const b of r.bloqueados ?? []) console.log(`   bloqueado: ${b.motivo.slice(0, 120)}`);
  ok(worker.ok, "o worker respondeu 200");
  ok((r.eventosEnviados ?? 0) > 0, `pelo menos 1 evento chegou à Meta (veio ${r.eventosEnviados})`);

  // ── 5. registro local do evento ──────────────────────────────────────────
  const { data: eventos } = await admin.from("meta_conversion_events")
    .select("event_name,event_id").eq("lead_id", lead.id);
  ok((eventos ?? []).length > 0, `o evento ficou registrado no CRM (${(eventos ?? []).length})`);
  for (const e of eventos ?? []) console.log(`   evento: ${e.event_name} · ${e.event_id}`);
} finally {
  if (criado.lead) {
    await admin.from("meta_conversion_events").delete().eq("lead_id", criado.lead);
    // Sem `.catch` no builder do supabase-js: ele não é Promise até ser
    // aguardado, e encadear .catch direto estoura TypeError — foi o que
    // deixou o primeiro lead de prova órfão no banco.
    for (const tabela of ["pipeline_stage_moves", "pipeline_history"]) {
      const { error } = await admin.from(tabela).delete().eq("lead_id", criado.lead);
      if (error) console.log(`   (aviso) ${tabela}: ${error.message}`);
    }
    await admin.from("leads").delete().eq("id", criado.lead);
  }
  if (criado.usuario) {
    await admin.from("profiles").delete().eq("id", criado.usuario);
    await admin.auth.admin.deleteUser(criado.usuario).catch(() => {});
  }
  console.log("\nlimpeza: lead e usuário de prova removidos");
}
process.exit(falhas ? 1 : 0);
