/**
 * PROVA COMPORTAMENTAL: o lote do corretor respeita a carteira.
 *
 * Cria 2 corretores descartáveis + 4 leads de rascunho na organização de
 * teste, loga como o corretor A e verifica pela API real:
 *   1. lote com 4 leads (3 do A, 1 do B) → move 3, recusa 1;
 *   2. lote para "perdido" → 422 STAGE_NOT_BULKABLE;
 *   3. o lead do B continua na etapa original (nada vazou).
 * Limpa TUDO que criou ao final (e só o que criou).
 *
 * Senhas: geradas em memória, nunca gravadas nem impressas.
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const APP = process.env.TESTE_BASE_URL || "http://localhost:3000";
const ORG_TESTE = "7c8c71c1-e963-464c-be5c-ff8c7936f51a"; // organização dos smoke users

const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });
const marca = `lote-prova-${Date.now()}`;
const criados = { usuarios: [], leads: [] };
let falhas = 0;
const ok = (cond, msg) => { console.log(`${cond ? "✔" : "✖"} ${msg}`); if (!cond) falhas++; };

async function criaCorretor(nome) {
  const senha = crypto.randomBytes(24).toString("base64url");
  const email = `${marca}-${nome}@atlas-teste.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error(`createUser ${nome}: ${error.message}`);
  criados.usuarios.push(data.user.id);
  // Perfil na forma que private.validate_commercial_hierarchy() aceita:
  // corretor exige access_role='broker' + reports_to um diretor OPERACIONAL
  // ativo da mesma organização (access_role='director'). O diretor abaixo já
  // ancora o corretor real da organização de teste.
  const DIRETOR_OPERACIONAL = "240a6bc5-5163-42ab-9d0f-729c7d0b0d35";
  const { error: e2 } = await admin.from("profiles").upsert({
    id: data.user.id, name: `Prova ${nome}`, full_name: `Prova ${nome}`, email, organization_id: ORG_TESTE,
    role: "broker", access_role: "broker", commercial_role: "broker",
    reports_to: DIRETOR_OPERACIONAL, active: true,
  });
  if (e2) throw new Error(`profile ${nome}: ${e2.message}`);
  return { id: data.user.id, email, senha };
}

async function criaLead(dono, n) {
  const { data, error } = await admin.from("leads").insert({
    organization_id: ORG_TESTE, name: `${marca} lead ${n}`, status: "novo",
    assigned_user_id: dono, assigned_to: dono, source: "prova-automatizada",
  }).select("id").single();
  if (error) throw new Error(`lead ${n}: ${error.message}`);
  criados.leads.push(data.id);
  return data.id;
}

try {
  const a = await criaCorretor("a");
  const b = await criaCorretor("b");
  const minhas = [await criaLead(a.id, 1), await criaLead(a.id, 2), await criaLead(a.id, 3)];
  const doOutro = await criaLead(b.id, 4);

  // Login real do corretor A pela API pública.
  const pub = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  const { data: sessao, error: eLogin } = await pub.auth.signInWithPassword({ email: a.email, password: a.senha });
  if (eLogin) throw new Error(`login: ${eLogin.message}`);
  const token = sessao.session.access_token;

  const chama = (body) => fetch(`${APP}/api/v1/crm/leads/bulk-stage`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));

  // 1) Lote misto: 3 minhas + 1 do outro corretor.
  const r1 = await chama({ leadIds: [...minhas, doOutro], stage: "contato", reason: "prova de carteira" });
  ok(r1.status === 200, `lote do corretor responde 200 (veio ${r1.status})`);
  const d = r1.json?.data ?? r1.json;
  ok(d?.movidas === 3, `move exatamente as 3 da carteira (veio ${d?.movidas})`);
  ok(d?.naoMovidas === 1, `recusa a 1 do colega sem erro (veio ${d?.naoMovidas})`);
  ok(Boolean(d?.aviso), "o aviso explica que nem tudo moveu");

  // 2) Fechar em massa continua barrado, também para corretor.
  const r2 = await chama({ leadIds: minhas, stage: "perdido", reason: "tentativa proibida" });
  ok(r2.status === 422, `perdido em massa é 422 (veio ${r2.status})`);
  ok((r2.json?.error?.code ?? r2.json?.code) === "STAGE_NOT_BULKABLE", "com o código STAGE_NOT_BULKABLE");

  // 3) Prova no banco: o lead do B não se moveu; as do A sim.
  const { data: estado } = await admin.from("leads").select("id,status").in("id", [...minhas, doOutro]);
  const porId = Object.fromEntries((estado ?? []).map((l) => [l.id, l.status]));
  ok(minhas.every((id) => porId[id] === "contato"), "banco confirma: as 3 do A em contato");
  ok(porId[doOutro] === "novo", `banco confirma: a do B intocada em novo (veio ${porId[doOutro]})`);
} finally {
  // Limpeza: apenas o que ESTA prova criou, por id exato.
  if (criados.leads.length) await admin.from("leads").delete().in("id", criados.leads);
  for (const id of criados.usuarios) {
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(`limpeza: ${criados.leads.length} leads e ${criados.usuarios.length} usuários de prova removidos`);
}
process.exit(falhas ? 1 : 0);
