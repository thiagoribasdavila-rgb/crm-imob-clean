/**
 * PROVA: /pipeline/discards para de mostrar zero sobre 110 leads perdidas.
 *
 * ── O DEFEITO ───────────────────────────────────────────────────────────────
 *
 * `app/api/v1/analytics/discard-report/route.ts` lia `lead_events` com
 * `event_type='lead_discarded'` e contava o denominador em `pipeline_history`.
 * Medido em 2026-07-30 na organização real:
 *
 *   lead_events com 'lead_discarded' ......... 0   (a tabela tem 66 linhas, 6 tipos)
 *   pipeline_history ......................... 0   no banco INTEIRO
 *   pipeline_stage_moves, saídas do funil .... 104
 *
 * As duas fontes antigas NUNCA recebem linha por movimentação: a RPC
 * `move_pipeline_lead` grava em `pipeline_stage_moves`, `activities` e
 * `atlas_events`, e o código que gravaria `lead_discarded` vive depois de um
 * `return` que sempre acontece. A tela renderizava tudo zerado, e ainda dizia
 * que era o time que não classificava.
 *
 * ── O QUE ESTA PROVA COMPARA ────────────────────────────────────────────────
 *
 * Cada número da resposta contra uma consulta INDEPENDENTE ao banco. Se alguém
 * reapontar a rota de volta para `lead_events`, o total cai a zero e esta prova
 * falha — que é o ponto.
 *
 * Uso: node scripts/prova-relatorio-de-descartes.mjs
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

const SAIDA = ["perdido", "comprou_outro"];
const { data: amostra } = await admin.from("leads").select("organization_id").limit(2000);
const porOrg = new Map();
for (const l of amostra ?? []) porOrg.set(l.organization_id, (porOrg.get(l.organization_id) ?? 0) + 1);
const org = [...porOrg.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

// A verdade, pelo outro caminho.
const { data: movs } = await admin
  .from("pipeline_stage_moves").select("id,lead_id,to_stage,discard_reason_key,reversal_of,occurred_at")
  .eq("organization_id", org).in("to_stage", SAIDA);
const revertidos = new Set((movs ?? []).map((m) => m.reversal_of).filter(Boolean));
const liquidas = (movs ?? []).filter((m) => !revertidos.has(m.id));
const classificadasBanco = liquidas.filter((m) => m.discard_reason_key).length;
const { count: leadsEmSaida } = await admin
  .from("leads").select("id", { count: "exact", head: true }).eq("organization_id", org).in("status", SAIDA);
const { count: eventosAntigos } = await admin
  .from("lead_events").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("event_type", "lead_discarded");
const { count: historicoAntigo } = await admin
  .from("pipeline_history").select("id", { count: "exact", head: true });

console.log(`\nbanco (verdade independente):`);
console.log(`  saídas líquidas ${liquidas.length} · classificadas ${classificadasBanco} · leads em saída ${leadsEmSaida}`);
console.log(`  fontes ANTIGAS: lead_events/lead_discarded = ${eventosAntigos} · pipeline_history = ${historicoAntigo}\n`);

const email = `prova-descartes-${Date.now()}@atlas-teste.local`;
const senha = "Prova!Descartes3gG";
let userId = null;

try {
  const { data: u, error: e1 } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (e1) throw new Error(e1.message);
  userId = u.user.id;
  await admin.from("profiles").upsert({
    id: userId, name: "Prova Descartes", full_name: "Prova Descartes", email, organization_id: org,
    role: "admin", access_role: "admin", commercial_role: "director", active: true,
  });
  const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: sess, error: e3 } = await pub.auth.signInWithPassword({ email, password: senha });
  if (e3) throw new Error(e3.message);

  const r = await fetch(`${APP}/api/v1/analytics/discard-report?days=90`, {
    headers: { authorization: `Bearer ${sess.session.access_token}` },
  });
  const corpo = await r.json().catch(() => null);
  const d = corpo?.data;
  conferir("a rota responde", r.status === 200, `http ${r.status}${corpo?.error ? ` · ${corpo.error.message}` : ""}`);
  if (!d) throw new Error("sem corpo");

  console.log(`\n  resposta: ${d.totals.discarded} saídas · ${d.totals.classified} classificadas · fonte ${d.procedencia?.fonte}\n`);

  // ── O conserto: o total deixa de ser zero e bate com o banco ─────────────
  conferir("o relatório NÃO está mais zerado", d.totals.discarded > 0, `${d.totals.discarded} saídas`);
  conferir("o total bate com pipeline_stage_moves (líquido de reversões)",
    d.totals.discarded === liquidas.length, `rota ${d.totals.discarded} · banco ${liquidas.length}`);
  conferir("a fonte declarada é pipeline_stage_moves", d.procedencia?.fonte === "pipeline_stage_moves", d.procedencia?.fonte);
  conferir("os estágios contados são declarados", JSON.stringify(d.procedencia?.estagiosContados) === JSON.stringify(SAIDA),
    JSON.stringify(d.procedencia?.estagiosContados));

  // ── As fontes antigas seguem vazias: o conserto foi de LEITURA ───────────
  conferir("as fontes antigas continuam com zero (o conserto não fabricou dado)",
    eventosAntigos === 0 && historicoAntigo === 0, `lead_events ${eventosAntigos} · pipeline_history ${historicoAntigo}`);

  // ── Classificados: numerador e denominador da MESMA fonte ────────────────
  conferir("as classificadas batem com o banco", d.totals.classified === classificadasBanco,
    `rota ${d.totals.classified} · banco ${classificadasBanco}`);
  conferir("a cobertura usa o mesmo denominador da fonte única",
    d.totals.coveragePct === (d.totals.discarded > 0 ? Math.round((d.totals.classified / d.totals.discarded) * 1000) / 10 : null),
    `${d.totals.coveragePct}%`);

  // ── O balde de "não medido" tem rótulo próprio ───────────────────────────
  const ausente = d.byReason.find((b) => b.key === "motivo_ausente");
  conferir("as saídas sem motivo caem num balde rotulado \"não medido\"",
    Boolean(ausente) && /não medido/i.test(ausente.label), ausente ? `${ausente.count} · "${ausente.label}"` : "AUSENTE");
  conferir("esse balde NÃO se chama \"Outro motivo\" (que é escolha do corretor)",
    !d.byReason.some((b) => b.key === "motivo_ausente" && /outro motivo/i.test(b.label)));

  // ── Procedência: a janela pedida é maior que o registro ──────────────────
  conferir("a resposta declara desde quando existe registro",
    Boolean(d.procedencia?.registroDeMovimentoDesde), d.procedencia?.registroDeMovimentoDesde ?? "AUSENTE");
  conferir("e avisa que a janela de 90 dias é maior que o registro",
    d.procedencia?.janelaMaiorQueORegistro === true, `janelaMaiorQueORegistro=${d.procedencia?.janelaMaiorQueORegistro}`);

  // ── As leads anteriores ao ledger são declaradas, não somadas ────────────
  const semMovimentoEsperado = Math.max(0, (leadsEmSaida ?? 0) - new Set(liquidas.map((m) => m.lead_id)).size);
  conferir("as leads em saída sem movimento registrado são contadas à parte",
    d.totals.semMovimentoRegistrado === semMovimentoEsperado,
    `rota ${d.totals.semMovimentoRegistrado} · banco ${semMovimentoEsperado}`);
  conferir("e elas NÃO entram no total de saídas",
    d.totals.discarded + (d.totals.semMovimentoRegistrado ?? 0) === (leadsEmSaida ?? 0),
    `${d.totals.discarded} + ${d.totals.semMovimentoRegistrado} = ${leadsEmSaida}`);

  conferir("as revertidas são publicadas mesmo sendo zero", typeof d.totals.revertidas === "number",
    `revertidas=${d.totals.revertidas}`);

  // ── A origem passa a ser respondível sem depender do motivo ──────────────
  conferir("a origem das leads descartadas é medida", d.bySource.length > 0,
    d.bySource.map((s) => `${s.source} ${s.count}`).join(" · "));
} catch (erro) {
  console.error(`\nFALHA: ${erro.message}`);
  falhou += 1;
} finally {
  if (userId) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  }
}

console.log(`\n${falhou === 0 ? "✔" : "✘"} ${ok} passaram · ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
