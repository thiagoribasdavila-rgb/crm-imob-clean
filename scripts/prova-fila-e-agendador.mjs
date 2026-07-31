/**
 * PROVA DA FILA — as 10 exigências da Fase 2, e quais delas dependem do servidor.
 *
 * ── O QUE ESTA PROVA DECIDE ─────────────────────────────────────────────────
 *
 * Medido em 2026-07-30: um evento ficou 44h49m entre entrar na fila e receber a
 * primeira tentativa. Duas hipóteses explicariam isso, e elas pedem consertos
 * OPOSTOS:
 *
 *   (a) o worker está quebrado  → consertar código
 *   (b) o worker nunca é chamado → instalar o agendamento no servidor
 *
 * Os 6 eventos entregues em 26/07 saíram em 1 a 28 segundos, o que já sugeria
 * (b). Esta prova fecha a questão exercitando a máquina inteira à mão: se tudo
 * passar, o defeito não está no código.
 *
 * ── O EVENTO SINTÉTICO É SEGURO ─────────────────────────────────────────────
 *
 * Usa um tópico inexistente. O worker cai no `throw new Error("Tópico não
 * suportado")` da linha 801, e os efeitos colaterais por tópico (linhas 822-824)
 * só disparam para tópicos conhecidos. Nenhuma mensagem sai, nenhuma lead é
 * tocada, nenhuma chamada externa acontece.
 *
 * ── OS 2 EVENTOS REAIS SÃO PROTEGIDOS ───────────────────────────────────────
 *
 * A fila tem 2 `meta.lead.fetch` em `failed` e elegíveis. Chamar o worker os
 * retentaria e queimaria tentativa deles rumo ao dead_letter. Esta prova
 * estaciona os dois no futuro antes de começar e RESTAURA `available_at` no
 * final — sem tocar em `status` nem em `attempts`.
 *
 * Uso: node scripts/prova-fila-e-agendador.mjs
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
const SEGREDO = env.ATLAS_CRON_SECRET;

let ok = 0;
let falhou = 0;
const bloqueados = [];
const conferir = (n, titulo, condicao, detalhe) => {
  console.log(`${condicao ? "  ✔" : "  ✘"} [${n}] ${titulo}${detalhe ? ` — ${detalhe}` : ""}`);
  if (condicao) ok += 1; else falhou += 1;
};
const bloqueado = (n, titulo, porque) => {
  console.log(`  ⊘ [${n}] ${titulo} — BLOQUEADO: ${porque}`);
  bloqueados.push(`[${n}] ${titulo}`);
};

const TOPICO = `prova.sintetica.${Date.now()}`;
let eventoId = null;
let reaisEstacionados = [];

const chamarWorker = async (extra = {}) => {
  const r = await fetch(`${APP}/api/v2/outbox/process`, {
    method: "POST",
    headers: { authorization: `Bearer ${SEGREDO}`, "Content-Type": "application/json" },
    ...extra,
  });
  return { status: r.status, corpo: await r.json().catch(() => null) };
};
const lerEvento = async () => {
  const { data } = await admin
    .from("integration_outbox")
    .select("id,status,attempts,available_at,locked_at,locked_by,last_error,cause")
    .eq("id", eventoId).maybeSingle();
  return data;
};

const { data: org } = await admin.from("leads").select("organization_id").limit(1).maybeSingle();
const ORG = org?.organization_id;
console.log(`\norganização ${ORG} · worker ${APP}/api/v2/outbox/process\n`);

try {
  if (!SEGREDO) throw new Error("ATLAS_CRON_SECRET ausente — sem ele o worker devolve 401 e nada pode ser provado.");

  // ── Protege os eventos reais ──────────────────────────────────────────────
  const { data: reais } = await admin
    .from("integration_outbox").select("id,available_at").in("status", ["pending", "failed"]);
  reaisEstacionados = reais ?? [];
  if (reaisEstacionados.length) {
    const futuro = new Date(Date.now() + 3600_000).toISOString();
    for (const r of reaisEstacionados) await admin.from("integration_outbox").update({ available_at: futuro }).eq("id", r.id);
    console.log(`  (${reaisEstacionados.length} evento(s) real(is) estacionado(s) — serão restaurados no final)\n`);
  }

  // ── [1] evento sintético seguro ───────────────────────────────────────────
  const { data: criado, error: e1 } = await admin.from("integration_outbox").insert({
    organization_id: ORG, topic: TOPICO, aggregate_type: "prova", payload: { prova: true }, status: "pending",
  }).select("id,status,attempts,available_at").single();
  if (e1) throw new Error(`insert: ${e1.message}`);
  eventoId = criado.id;
  conferir(1, "evento sintético criado sem efeito externo", Boolean(eventoId), `tópico ${TOPICO}`);

  // ── [2] entrada registrada na fila ────────────────────────────────────────
  // A comparação ingênua (`available_at <= new Date()`) reprovava um evento
  // perfeitamente elegível: `available_at` recebe o `now()` do SERVIDOR do banco,
  // e comparar com o relógio DESTE processo perde por milissegundos de diferença.
  // A propriedade que importa não é "menor que o meu agora", é "não foi agendado
  // para o futuro" — e é ela que se afirma, com tolerância declarada.
  const adiantamentoMs = new Date(criado.available_at).getTime() - Date.now();
  conferir(2, "entra na fila como `pending`, sem adiamento",
    criado.status === "pending" && criado.attempts === 0 && adiantamentoMs < 5_000,
    `status=${criado.status} attempts=${criado.attempts} available_at ${adiantamentoMs > 0 ? `+${adiantamentoMs}ms` : `${adiantamentoMs}ms`}`);

  // ── [3][4][7] dependem do agendamento no servidor ─────────────────────────
  bloqueado(3, "execução automática", "o cron não está instalado no servidor — é o que esta sessão não alcança");
  bloqueado(4, "processamento sem ação manual", "idem [3]");
  bloqueado(7, "execução em até 5 minutos", "idem [3] — só medível com o agendamento rodando");

  // ── [5] o worker muda o status ────────────────────────────────────────────
  const r1 = await chamarWorker();
  conferir(5, "o worker responde e processa", r1.status === 200, `http ${r1.status} · ${JSON.stringify(r1.corpo).slice(0, 90)}`);
  const depois1 = await lerEvento();
  conferir(5.1, "o status mudou de `pending` para `failed`", depois1?.status === "failed",
    `status=${depois1?.status} attempts=${depois1?.attempts}`);
  conferir(5.2, "o erro foi registrado", /não suportado/i.test(depois1?.last_error ?? ""), depois1?.last_error?.slice(0, 60));

  // ── [9] recuperação: backoff empurra a próxima tentativa ──────────────────
  const adiou = depois1 && new Date(depois1.available_at).getTime() > Date.now();
  conferir(9, "após falhar, o backoff adia a próxima tentativa (não trava nem some)",
    adiou, `available_at ${adiou ? "no futuro" : "AGORA"} · +${Math.round((new Date(depois1.available_at) - Date.now()) / 1000)}s`);
  conferir(9.1, "o lock foi liberado", depois1?.locked_at === null && depois1?.locked_by === null,
    `locked_by=${depois1?.locked_by ?? "null"}`);

  // ── [6] ausência de duplicação: dois workers ao mesmo tempo ───────────────
  await admin.from("integration_outbox").update({ available_at: new Date().toISOString() }).eq("id", eventoId);
  const antes = (await lerEvento()).attempts;
  const [a, b] = await Promise.all([chamarWorker(), chamarWorker()]);
  const depoisConcorrente = await lerEvento();
  conferir(6, "dois workers simultâneos incrementam a tentativa UMA vez só",
    depoisConcorrente.attempts === antes + 1,
    `antes ${antes} → depois ${depoisConcorrente.attempts} (http ${a.status}/${b.status})`);

  // ── [10] falha permanente vai para dead-letter ────────────────────────────
  // O teto é `attempts >= 5` (route.ts:816). Reabrimos a elegibilidade a cada
  // rodada porque o que se prova aqui é a CONTAGEM e a transição — o backoff em
  // si já foi provado em [9].
  let estado = await lerEvento();
  let rodadas = 0;
  while (estado.status !== "dead_letter" && rodadas < 8) {
    await admin.from("integration_outbox").update({ available_at: new Date().toISOString() }).eq("id", eventoId);
    await chamarWorker();
    estado = await lerEvento();
    rodadas += 1;
  }
  conferir(10, "falha permanente termina em `dead_letter`", estado.status === "dead_letter",
    `status=${estado.status} attempts=${estado.attempts} após ${rodadas} rodada(s)`);
  conferir(10.1, "e o teto de tentativas foi respeitado (5)", estado.attempts >= 5, `attempts=${estado.attempts}`);

  // ── [8] a prontidão reconhece a fila e o agendador ────────────────────────
  const pronto = await fetch(`${APP}/api/v1/ready`).then((r) => r.json()).catch(() => null);
  const d = pronto?.data ?? {};
  conferir(8, "/api/v1/ready reconhece o agendador", d.agendamento?.medido === true,
    `medido=${d.agendamento?.medido} segredoConfigurado=${d.agendamento?.segredoConfigurado}`);
  conferir(8.1, "e publica a fila por estado", d.filas?.medido === true, JSON.stringify(d.filas?.porEstado ?? {}));
  conferir(8.2, "o item em dead_letter aparece e é sinalizado",
    (d.filas?.porEstado?.dead_letter ?? 0) > 0 && d.filas?.precisaDeAtencao === true,
    d.filas?.motivo?.slice(0, 80));
} catch (erro) {
  console.error(`\nFALHA: ${erro.message}`);
  falhou += 1;
} finally {
  if (eventoId) {
    const del = await admin.from("integration_outbox").delete().eq("id", eventoId).select("id");
    console.log(`\n  (limpeza: ${(del.data ?? []).length} evento sintético removido)`);
  }
  for (const r of reaisEstacionados) {
    await admin.from("integration_outbox").update({ available_at: r.available_at }).eq("id", r.id);
  }
  if (reaisEstacionados.length) console.log(`  (${reaisEstacionados.length} evento(s) real(is) restaurado(s) ao available_at original)`);
  const { count } = await admin.from("integration_outbox").select("id", { count: "exact", head: true }).like("topic", "prova.sintetica.%");
  console.log(`  (sobraram ${count ?? "?"} evento(s) de prova na fila)`);
}

console.log(`\n${falhou === 0 ? "✔" : "✘"} ${ok} passaram · ${falhou} falharam · ${bloqueados.length} bloqueados pelo servidor`);
if (bloqueados.length) console.log(`   bloqueados: ${bloqueados.join(" · ")}`);
console.log();
process.exit(falhou === 0 ? 0 : 1);
