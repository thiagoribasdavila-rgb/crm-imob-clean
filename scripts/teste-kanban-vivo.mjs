#!/usr/bin/env node
/**
 * TESTE VIVO DO KANBAN — contra a API real, com login real.
 *
 * ── Por que não basta o contrato ────────────────────────────────────────────
 *
 * Os testes de contrato leem o código. Cinco diagnósticos errados nesta sessão
 * vieram de concluir por estrutura em vez de medir comportamento. Este script
 * mede: faz login, chama a rota e olha o status que voltou.
 *
 * ── Por que uma lead descartável ────────────────────────────────────────────
 *
 * Mover uma lead real e devolvê-la ao lugar não desfaz nada: `lead_events` e
 * `activities` são histórico append-only. A ficha do cliente ficaria com
 * "Etapa alterada: novo → ganho" de um teste. Cria-se uma lead própria, com
 * e-mail `smoke-…@atlas-teste.local` — a mesma convenção que a limpeza do
 * smoke já reconhece — e apaga-se no fim.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const linha of readFileSync(".env.local", "utf8").split("\n")) {
  const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const BASE = process.env.TESTE_BASE_URL || "http://localhost:3000";
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
// A Supabase renomeou a chave pública: o projeto usa `PUBLISHABLE_KEY` e deixou
// `ANON_KEY` vazia. Aceita as duas para o script não depender de qual está em uso.
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.TESTE_EMAIL || "ddcorretorsp@gmail.com";
const SENHA = process.env.TESTE_SENHA;

if (!SENHA) {
  console.error("Defina TESTE_SENHA no ambiente (não fica em arquivo).");
  process.exit(2);
}

const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });

let ok = 0;
let falhou = 0;
const falhas = [];

function checa(nome, condicao, detalhe = "") {
  if (condicao) { ok++; console.log(`  ✔ ${nome}`); }
  else { falhou++; falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ""}`); console.log(`  ✘ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

// ── Login real ─────────────────────────────────────────────────────────────
const sb = createClient(URL_SB, ANON, { auth: { persistSession: false } });
const { data: sessao, error: erroLogin } = await sb.auth.signInWithPassword({ email: EMAIL, password: SENHA });
if (erroLogin || !sessao?.session) {
  console.error("Login falhou:", erroLogin?.message);
  process.exit(2);
}
const TOKEN = sessao.session.access_token;
const { data: perfil } = await admin
  .from("profiles").select("id,organization_id,commercial_role,role")
  .eq("id", sessao.user.id).maybeSingle();
console.log(`\nLogado: ${EMAIL} · papel ${perfil?.commercial_role || perfil?.role}\n`);

const mover = (corpo) => fetch(`${BASE}/api/v1/pipeline`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify(corpo),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => ({})) }));

// ── Lead descartável ───────────────────────────────────────────────────────
const marca = `smoke-kanban-${process.pid}`;
const { data: lead, error: erroLead } = await admin.from("leads").insert({
  organization_id: perfil.organization_id,
  name: "TESTE KANBAN (apagar)",
  email: `${marca}@atlas-teste.local`,
  phone: "+5511900000000",
  status: "novo",
  source: "teste-automatizado",
  assigned_to: perfil.id,
}).select("id,status").single();

if (erroLead) { console.error("Não criou a lead de teste:", erroLead.message); process.exit(2); }
const ID = lead.id;
console.log(`Lead de teste: ${ID}\n`);

async function limpar() {
  await admin.from("lead_events").delete().eq("lead_id", ID);
  await admin.from("activities").delete().eq("lead_id", ID);
  await admin.from("lead_stage_history").delete().eq("lead_id", ID).then(() => {}, () => {});
  await admin.from("leads").delete().eq("id", ID);
}

try {
  // ── 1. Pular etapas ──────────────────────────────────────────────────────
  console.log("1) Pular etapas — o que o usuário relatou não funcionar");
  const saltos = [
    ["novo", "visita"], ["visita", "proposta"], ["proposta", "novo"],
    ["novo", "contrato"], ["contrato", "qualificacao"], ["qualificacao", "ganho"],
    ["ganho", "novo"],
  ];
  for (const [de, para] of saltos) {
    const r = await mover({ leadId: ID, stage: para, expectedFromStage: de });
    checa(`${de} → ${para}`, r.status === 200, `HTTP ${r.status} ${r.corpo?.error || ""}`);
    // A tela lê esta chave para mostrar "Desfazer movimentação".
    if (r.status === 200) {
      checa(`  ↳ devolve id do movimento`, Boolean(r.corpo?.move?.id ?? r.corpo?.move?.moveId),
        JSON.stringify(r.corpo?.move ?? null).slice(0, 120));
    }
  }

  // ── 2. Descarte sem tentativa — o que acabou de ser destravado ───────────
  console.log("\n2) Descarte SEM nenhuma tentativa de contato (piso removido)");
  const semMotivo = await mover({ leadId: ID, stage: "perdido", expectedFromStage: "novo" });
  checa("sem motivo continua recusado", semMotivo.status === 400 && semMotivo.corpo?.code === "DISCARD_REASON_REQUIRED",
    `HTTP ${semMotivo.status} ${semMotivo.corpo?.code || ""}`);

  const motivoInvalido = await mover({ leadId: ID, stage: "perdido", expectedFromStage: "novo", discardReason: { key: "inventado" } });
  checa("motivo fora da taxonomia recusado", motivoInvalido.status === 400 && motivoInvalido.corpo?.code === "INVALID_DISCARD_REASON",
    `HTTP ${motivoInvalido.status}`);

  const descarte = await mover({ leadId: ID, stage: "perdido", expectedFromStage: "novo", discardReason: { key: "orcamento_incompativel", notes: "teste" } });
  checa("descarta com ZERO tentativas", descarte.status === 200, `HTTP ${descarte.status} ${descarte.corpo?.error || ""}`);
  checa("não devolve MINIMO_DE_TENTATIVAS", descarte.corpo?.code !== "MINIMO_DE_TENTATIVAS");

  // ── 3. Desfazer ──────────────────────────────────────────────────────────
  console.log("\n3) Desfazer o descarte");
  const idMovimento = descarte.corpo?.move?.id ?? descarte.corpo?.move?.moveId;
  if (idMovimento) {
    const desfeito = await mover({ leadId: ID, stage: "novo", expectedFromStage: "perdido", reversalOf: idMovimento });
    checa("desfaz sem exigir motivo", desfeito.status === 200, `HTTP ${desfeito.status} ${desfeito.corpo?.error || ""}`);
  } else {
    checa("desfaz sem exigir motivo", false, "o descarte não devolveu id do movimento");
  }

  // ── 4. Comprou em outro lugar ────────────────────────────────────────────
  console.log("\n4) Comprou em outro lugar");
  const curto = await mover({ leadId: ID, stage: "comprou_outro", expectedFromStage: "novo", followUpDescription: "curto" });
  checa("texto curto recusado", curto.status === 400, `HTTP ${curto.status}`);
  const completo = await mover({ leadId: ID, stage: "comprou_outro", expectedFromStage: "novo", followUpDescription: "Fechou num lançamento a 2 km, entrega antes." });
  checa("com descrição, move", completo.status === 200, `HTTP ${completo.status} ${completo.corpo?.error || ""}`);

  // ── 5. Etapa de origem errada ────────────────────────────────────────────
  console.log("\n5) Duas pessoas mexendo na mesma lead");
  const conflito = await mover({ leadId: ID, stage: "ganho", expectedFromStage: "novo" });
  checa("origem divergente é recusada", conflito.status === 409 || conflito.status === 422,
    `HTTP ${conflito.status} ${conflito.corpo?.error || ""}`);
  checa("e a mensagem explica o porquê", typeof conflito.corpo?.error === "string" && conflito.corpo.error.length > 20,
    JSON.stringify(conflito.corpo).slice(0, 140));

  // ── 6. Entradas inválidas ────────────────────────────────────────────────
  console.log("\n6) Entradas inválidas");
  const semEtapa = await mover({ leadId: ID, expectedFromStage: "comprou_outro" });
  checa("sem etapa destino: 400", semEtapa.status === 400, `HTTP ${semEtapa.status}`);
  const leadInexistente = await mover({ leadId: "00000000-0000-0000-0000-000000000000", stage: "visita", expectedFromStage: "novo" });
  checa("lead inexistente não vira 500", leadInexistente.status >= 400 && leadInexistente.status < 500, `HTTP ${leadInexistente.status}`);

  // ── 6b. Toda recusa diz o caminho de volta ───────────────────────────────
  console.log("\n6b) Toda recusa carrega o CAMINHO de volta");
  const recusas = [
    ["motivo ausente", { leadId: ID, stage: "perdido", expectedFromStage: "comprou_outro" }],
    ["motivo inválido", { leadId: ID, stage: "perdido", expectedFromStage: "comprou_outro", discardReason: { key: "xxx" } }],
    ["descrição curta", { leadId: ID, stage: "comprou_outro", expectedFromStage: "comprou_outro", followUpDescription: "abc" }],
    ["etapa de origem errada", { leadId: ID, stage: "ganho", expectedFromStage: "novo" }],
    ["lead inexistente", { leadId: "00000000-0000-0000-0000-000000000000", stage: "visita", expectedFromStage: "novo" }],
  ];
  for (const [nome, corpo] of recusas) {
    const r = await mover(corpo);
    const c = r.corpo?.caminho;
    checa(`${nome}: tem caminho`, typeof c === "string" && c.length > 25, `HTTP ${r.status} · caminho=${JSON.stringify(c)}`);
    // O caminho tem que ser diferente do problema — repetir o erro com outras
    // palavras não é orientação.
    checa(`${nome}: caminho ≠ problema`, c !== r.corpo?.error);
  }

  // A recusa que era um beco: mandar "atualize o Kanban" para uma lead que não
  // é do corretor faz ele atualizar para sempre. Prova com uma lead de outro dono.
  console.log("\n6c) Lead de outra carteira: 403 e caminho que não é 'atualize'");
  const { data: outroDono } = await admin.from("profiles")
    .select("id").eq("organization_id", perfil.organization_id).neq("id", perfil.id).limit(1).maybeSingle();
  if (outroDono) {
    const { data: alheia } = await admin.from("leads").insert({
      organization_id: perfil.organization_id, name: "TESTE ALHEIA (apagar)",
      email: `${marca}-alheia@atlas-teste.local`, status: "novo",
      source: "teste-automatizado", assigned_to: outroDono.id,
    }).select("id").single();
    const r = await mover({ leadId: alheia.id, stage: "visita", expectedFromStage: "novo" });
    checa("é 403, não 409", r.status === 403, `HTTP ${r.status}`);
    checa("o caminho manda falar com o gestor", /gestor|diretor|transfer/i.test(String(r.corpo?.caminho)),
      JSON.stringify(r.corpo?.caminho));
    checa("não manda atualizar a tela", !/^atualize/i.test(String(r.corpo?.caminho || "")));
    await admin.from("lead_events").delete().eq("lead_id", alheia.id);
    await admin.from("activities").delete().eq("lead_id", alheia.id);
    await admin.from("leads").delete().eq("id", alheia.id);
  } else {
    console.log("  (sem segundo perfil na organização — pulado)");
  }

  // ── 7. Estado final coerente no banco ────────────────────────────────────
  console.log("\n7) O banco concorda com a última resposta");
  const { data: final } = await admin.from("leads").select("status").eq("id", ID).single();
  checa("status gravado é o da última movimentação aceita", final?.status === "comprou_outro", `banco diz "${final?.status}"`);
  const { count } = await admin.from("activities").select("id", { count: "exact", head: true }).eq("lead_id", ID);
  checa("cada movimentação virou histórico", (count ?? 0) >= 8, `${count} atividades`);
} finally {
  await limpar();
  const { data: sobrou } = await admin.from("leads").select("id").eq("id", ID).maybeSingle();
  checa("lead de teste removida", !sobrou);
}

console.log(`\n${"─".repeat(60)}`);
console.log(`${ok} passaram · ${falhou} falharam`);
if (falhas.length) { console.log("\nFalhas:"); falhas.forEach((f) => console.log(`  · ${f}`)); }
process.exit(falhou ? 1 : 0);
