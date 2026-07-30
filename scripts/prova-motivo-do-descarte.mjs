/**
 * PROVA: o motivo do descarte para de ser jogado fora.
 *
 * ── O DEFEITO ───────────────────────────────────────────────────────────────
 *
 * `PATCH /api/v1/pipeline` EXIGE o motivo para mover uma lead a `perdido`:
 * sem ele, 400 `DISCARD_REASON_REQUIRED`; com chave fora da taxonomia, 400
 * `INVALID_DISCARD_REASON`. A guarda entrou em 20/07/2026.
 *
 * E o motivo morria antes de qualquer escrita. A chamada da RPC passava só
 * `p_reason: followUpDescription`; a chave e as notas não iam a lugar nenhum. O
 * único código que as gravava vive DEPOIS de um `return` que sempre acontece.
 *
 * Medido em 2026-07-30: 104 saídas registradas de 27 a 30/07 — TODAS posteriores
 * à guarda — e `discard_reason_key` nulo em 104 de 104. O corretor escolheu o
 * motivo e o sistema descartou, 102 vezes.
 *
 * ── O QUE ESTA PROVA EXIGE DE SI MESMA ─────────────────────────────────────
 *
 * Não basta "a coluna ficou preenchida". Ela prova os DOIS lados da guarda:
 * que o motivo válido é GRAVADO, e que a rota continua RECUSANDO quem não
 * manda motivo ou manda chave inválida. Um conserto que gravasse o motivo mas
 * afrouxasse a exigência trocaria um defeito por outro pior.
 *
 * A lead de prova é criada e apagada no `finally`. As FKs de
 * `pipeline_stage_moves`, `activities` e `lead_events` são ON DELETE CASCADE
 * (verificado em information_schema), então apagar a lead limpa tudo.
 *
 * Uso: node scripts/prova-motivo-do-descarte.mjs
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

const marca = `PROVA-DESCARTE-${Date.now()}`;
const email = `prova-descarte-${Date.now()}@atlas-teste.local`;
const senha = "Prova!Descarte2fF";
let userId = null;
let leadId = null;

const { data: amostra } = await admin.from("leads").select("organization_id").limit(2000);
const porOrg = new Map();
for (const l of amostra ?? []) porOrg.set(l.organization_id, (porOrg.get(l.organization_id) ?? 0) + 1);
const org = [...porOrg.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
console.log(`\norganização ${org}`);

// O estado ANTES: é ele que dá sentido ao depois.
const { count: classificadasAntes } = await admin
  .from("pipeline_stage_moves").select("id", { count: "exact", head: true })
  .eq("organization_id", org).not("discard_reason_key", "is", null);
const { count: saidasAntes } = await admin
  .from("pipeline_stage_moves").select("id", { count: "exact", head: true })
  .eq("organization_id", org).in("to_stage", ["perdido", "comprou_outro"]);
console.log(`  antes: ${saidasAntes} saídas registradas · ${classificadasAntes} com motivo classificado\n`);

try {
  const { data: u, error: e1 } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (e1) throw new Error(e1.message);
  userId = u.user.id;
  await admin.from("profiles").upsert({
    id: userId, name: "Prova Descarte", full_name: "Prova Descarte", email, organization_id: org,
    role: "admin", access_role: "admin", commercial_role: "director", active: true,
  });

  const { data: lead, error: e2 } = await admin.from("leads").insert({
    organization_id: org, name: marca, status: "novo", source: marca,
    assigned_to: userId, assigned_user_id: userId,
  }).select("id").single();
  if (e2) throw new Error(`insert lead: ${e2.message}`);
  leadId = lead.id;
  console.log(`  (lead de prova ${leadId})\n`);

  const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: sess, error: e3 } = await pub.auth.signInWithPassword({ email, password: senha });
  if (e3) throw new Error(e3.message);
  const token = sess.session.access_token;

  const mover = async (corpo) => {
    const r = await fetch(`${APP}/api/v1/pipeline`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ leadId, expectedFromStage: "novo", ...corpo }),
    });
    return { status: r.status, corpo: await r.json().catch(() => null) };
  };

  // ── LADO 1 DA GUARDA: sem motivo, a rota RECUSA ──────────────────────────
  const semMotivo = await mover({ stage: "perdido" });
  conferir("sem motivo, a rota recusa com 400", semMotivo.status === 400, `http ${semMotivo.status} · ${semMotivo.corpo?.code}`);
  conferir("e o código da recusa é DISCARD_REASON_REQUIRED", semMotivo.corpo?.code === "DISCARD_REASON_REQUIRED", semMotivo.corpo?.code);

  // ── LADO 2 DA GUARDA: chave fora da taxonomia, a rota RECUSA ─────────────
  const chaveInvalida = await mover({ stage: "perdido", discardReason: { key: "motivo_que_nao_existe" } });
  conferir("chave fora da taxonomia é recusada com 400", chaveInvalida.status === 400, `http ${chaveInvalida.status}`);
  conferir("e o código é INVALID_DISCARD_REASON", chaveInvalida.corpo?.code === "INVALID_DISCARD_REASON", chaveInvalida.corpo?.code);

  // ── O CONSERTO: motivo válido é GRAVADO ─────────────────────────────────
  const NOTAS = "Cliente disse que adiou a compra para o ano que vem.";
  const comMotivo = await mover({
    stage: "perdido",
    discardReason: { key: "sem_interesse", notes: NOTAS },
    followUpDescription: "Retomar em janeiro.",
  });
  conferir("com motivo válido, a movimentação é aceita", comMotivo.status === 200, `http ${comMotivo.status} · ${comMotivo.corpo?.code ?? ""}`);
  const moveId = comMotivo.corpo?.move?.id;
  conferir("a resposta traz o id do movimento", Boolean(moveId), moveId ?? "AUSENTE");

  const { data: gravado } = await admin
    .from("pipeline_stage_moves")
    .select("id,to_stage,from_stage,reason,discard_reason_key,discard_notes")
    .eq("id", moveId).maybeSingle();

  console.log(`\n  linha gravada: ${JSON.stringify(gravado)}\n`);
  conferir("o movimento existe no ledger", Boolean(gravado), gravado ? "presente" : "AUSENTE");
  conferir("a CHAVE da taxonomia foi gravada", gravado?.discard_reason_key === "sem_interesse",
    `discard_reason_key=${gravado?.discard_reason_key}`);
  conferir("as NOTAS do corretor foram gravadas", gravado?.discard_notes === NOTAS,
    `discard_notes=${gravado?.discard_notes ? "presente" : "NULO"}`);
  // A nota vai em coluna PRÓPRIA: enfiá-la em `reason` obrigaria a decodificar
  // texto livre depois, e a primeira nota que contivesse o nome de uma chave
  // viraria classificação falsa.
  conferir("a descrição de follow-up continua em `reason`, separada da nota",
    gravado?.reason === "Retomar em janeiro.", `reason=${gravado?.reason}`);
  conferir("o destino é a saída do funil", gravado?.to_stage === "perdido", `to_stage=${gravado?.to_stage}`);

  // ── O EFEITO AGREGADO: a contagem de classificados subiu em exatamente 1 ──
  const { count: classificadasDepois } = await admin
    .from("pipeline_stage_moves").select("id", { count: "exact", head: true })
    .eq("organization_id", org).not("discard_reason_key", "is", null);
  conferir("a contagem de saídas classificadas subiu em exatamente 1",
    classificadasDepois === (classificadasAntes ?? 0) + 1,
    `antes ${classificadasAntes} · depois ${classificadasDepois}`);
} catch (erro) {
  console.error(`\nFALHA: ${erro.message}`);
  falhou += 1;
} finally {
  // CASCADE em pipeline_stage_moves, activities e lead_events: apagar a lead
  // limpa o rastro inteiro. Conferido em information_schema antes de escrever.
  if (leadId) {
    const del = await admin.from("leads").delete().eq("id", leadId).select("id");
    console.log(`\n  (limpeza: ${(del.data ?? []).length} lead removida${del.error ? ` · ERRO ${del.error.message}` : ""})`);
    const { count: sobrouMove } = await admin
      .from("pipeline_stage_moves").select("id", { count: "exact", head: true }).eq("lead_id", leadId);
    console.log(`  (movimentos órfãos: ${sobrouMove ?? "?"})`);
  }
  if (userId) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  }
  const { count: classificadasFinal } = await admin
    .from("pipeline_stage_moves").select("id", { count: "exact", head: true })
    .eq("organization_id", org).not("discard_reason_key", "is", null);
  console.log(`  (classificadas ao final: ${classificadasFinal} — deve voltar a ${classificadasAntes})`);
}

console.log(`\n${falhou === 0 ? "✔" : "✘"} ${ok} passaram · ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
