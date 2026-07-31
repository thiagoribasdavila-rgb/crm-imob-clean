/**
 * PROVA DO RELÓGIO — a reivindicação não pode depender de dois relógios.
 *
 * ── O DEFEITO ───────────────────────────────────────────────────────────────
 *
 * O worker selecionava com `.lte("available_at", new Date().toISOString())` e
 * gravava `locked_at: new Date().toISOString()`. As duas colunas são escritas
 * pelo PostgreSQL. Comparar com o relógio do Node é comparar relógios diferentes.
 *
 * Medido em 2026-07-31: um evento recém-inserido apareceu com `available_at`
 * 6 ms À FRENTE deste processo — inelegível por milissegundos, num campo que o
 * banco acabara de escrever.
 *
 * ── POR QUE ESTA PROVA USA O RELÓGIO DO BANCO PARA MONTAR OS CASOS ─────────
 *
 * Um teste que posicionasse os eventos com `Date.now()` do processo teria o mesmo
 * defeito que quer provar corrigido: ele não saberia onde é "exatamente o
 * limite". Todos os `available_at` daqui são calculados com `now()` DO BANCO
 * (`now() + interval`), então "1 ms antes" é 1 ms antes de verdade.
 *
 * Uso: node scripts/prova-relogio-do-lease.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

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

const MARCA = `relogio-${Date.now()}`;
const criados = [];
let estacionados = [];

/** Cria um evento com `available_at = now() + offset`, calculado NO BANCO. */
const criarEm = async (org, rotulo, offsetMs) => {
  const { data: inserido, error: e } = await admin
    .from("integration_outbox")
    .insert({ organization_id: org, topic: `${MARCA}.${rotulo}`, aggregate_type: "prova", payload: { prova: true } })
    .select("id")
    .single();
  if (e) throw new Error(`insert ${rotulo}: ${e.message}`);
  criados.push(inserido.id);
  const { error: e2 } = await admin.rpc("posiciona_evento_de_prova", { p_id: inserido.id, p_offset_ms: offsetMs });
  if (e2) throw new Error(`posicionar ${rotulo}: ${e2.message}`);
  return inserido.id;
};

const ler = async (id) => {
  const { data } = await admin
    .from("integration_outbox").select("id,status,attempts,available_at,locked_by").eq("id", id).maybeSingle();
  return data;
};

const { data: umaLead } = await admin.from("leads").select("organization_id").limit(1).maybeSingle();
const ORG = umaLead?.organization_id;
console.log(`\norganização ${ORG}\n`);

try {
  // Estaciona os eventos reais para eles não serem reivindicados junto.
  const { data: reais } = await admin
    .from("integration_outbox").select("id,available_at").in("status", ["pending", "failed"]);
  estacionados = reais ?? [];
  // Os reais NÃO passam pela função de prova — ela recusa tópico que não seja de
  // prova, de propósito. Estacionar 1 h no futuro não precisa de precisão de
  // milissegundo, e o valor original é restaurado no `finally`.
  const futuro = new Date(Date.now() + 3_600_000).toISOString();
  for (const r of estacionados) {
    await admin.from("integration_outbox").update({ available_at: futuro }).eq("id", r.id);
  }
  if (estacionados.length) console.log(`  (${estacionados.length} evento(s) real(is) estacionado(s); serão restaurados)\n`);

  // ── FRONTEIRA: medida DENTRO de uma transação, onde `now()` é constante ──
  //
  // A primeira versão deste bloco posicionava um evento em now()+1ms e chamava a
  // reivindicação numa segunda viagem. Falhava sempre — entre as duas chamadas
  // passavam dezenas de milissegundos de rede, e o "futuro" já era passado. O
  // teste media LATÊNCIA, não fronteira.
  //
  // No PostgreSQL `now()` é o início da transação e fica constante. Criando e
  // reivindicando na mesma transação, "1 ms depois" é 1 ms depois de verdade.
  const { data: fronteira, error: eF } = await admin.rpc("prova_de_fronteira_do_relogio", { p_org: ORG });
  if (eF) throw new Error(`fronteira: ${eF.message}`);
  console.log(`  (fronteira medida no banco às ${fronteira.agoraDoBanco})`);
  conferir("evento 1 ms ANTES do limite é reivindicado", fronteira.umMsAntes_reivindicado === true);
  conferir("evento EXATAMENTE no limite é reivindicado", fronteira.noLimite_reivindicado === true);
  conferir("evento 1 ms DEPOIS do limite NÃO é reivindicado", fronteira.umMsDepois_reivindicado === false);
  conferir("exatamente 2 dos 3 foram reivindicados", fronteira.totalReivindicados === 2,
    `total=${fronteira.totalReivindicados}`);

  // ── Reivindicação: lock, tentativa e o que fica de fora ──────────────────
  const elegivel = await criarEm(ORG, "elegivel", -1000);
  const futuroLonge = await criarEm(ORG, "futuro", 3600_000);
  const { data: pegos, error: eR } = await admin.rpc("reivindica_eventos_da_fila", { p_worker: "prova-relogio", p_limite: 50 });
  if (eR) throw new Error(`reivindicar: ${eR.message}`);
  const idsPegos = new Set((pegos ?? []).map((p) => p.id));
  conferir("o elegível é reivindicado", idsPegos.has(elegivel));
  conferir("o do futuro NÃO é reivindicado", !idsPegos.has(futuroLonge));

  const depois1 = await ler(elegivel);
  conferir("o reivindicado fica em `processing` com lock do worker",
    depois1?.status === "processing" && depois1?.locked_by === "prova-relogio",
    `status=${depois1?.status} locked_by=${depois1?.locked_by}`);
  conferir("e `attempts` incrementa na reivindicação, não na conclusão",
    depois1?.attempts === 1, `attempts=${depois1?.attempts}`);

  const intacto = await ler(futuroLonge);
  conferir("o do futuro segue `pending`, sem lock e sem tentativa",
    intacto?.status === "pending" && intacto?.attempts === 0 && intacto?.locked_by === null,
    `status=${intacto?.status} attempts=${intacto?.attempts}`);

  // ── Exclusão mútua: dois workers disputam TRÊS eventos elegíveis ─────────
  const disputados = [];
  for (let i = 0; i < 3; i += 1) disputados.push(await criarEm(ORG, `disputa-${i}`, -1000));
  const [a, b] = await Promise.all([
    admin.rpc("reivindica_eventos_da_fila", { p_worker: "worker-A", p_limite: 50 }),
    admin.rpc("reivindica_eventos_da_fila", { p_worker: "worker-B", p_limite: 50 }),
  ]);
  const idsA = new Set((a.data ?? []).filter((r) => disputados.includes(r.id)).map((r) => r.id));
  const idsB = new Set((b.data ?? []).filter((r) => disputados.includes(r.id)).map((r) => r.id));
  const intersecao = [...idsA].filter((id) => idsB.has(id));
  conferir("dois workers simultâneos NÃO pegam o mesmo evento",
    intersecao.length === 0, `A=${idsA.size} B=${idsB.size} interseção=${intersecao.length}`);
  conferir("juntos, cobrem os 3 disputados — nenhum ficou órfão",
    idsA.size + idsB.size === 3, `A=${idsA.size} + B=${idsB.size} = ${idsA.size + idsB.size} de 3`);

  // ── Lease: válido não é recuperado; expirado é ───────────────────────────
  const { data: validos } = await admin.rpc("leases_expirados", { p_minutos: 10, p_limite: 50 });
  const idsValidos = new Set((validos ?? []).map((r) => r.id));
  conferir("lease AINDA VÁLIDO não aparece como expirado",
    !idsValidos.has(elegivel), `${idsValidos.size} expirado(s) na janela de 10 min`);

  // O mesmo evento, olhado com uma janela de 0 minutos (o mínimo da função é 1),
  // continua não expirado; com o lock envelhecido, expira.
  await admin.rpc("envelhece_lock_de_prova", { p_id: elegivel, p_minutos: 30 });
  const { data: expirados } = await admin.rpc("leases_expirados", { p_minutos: 10, p_limite: 50 });
  conferir("lease com 30 min de idade APARECE como expirado (janela de 10 min)",
    (expirados ?? []).some((r) => r.id === elegivel), `${(expirados ?? []).length} expirado(s)`);
} catch (erro) {
  console.error(`\nFALHA: ${erro.message}`);
  falhou += 1;
} finally {
  for (const id of criados) await admin.from("integration_outbox").delete().eq("id", id);
  for (const r of estacionados) {
    await admin.from("integration_outbox").update({ available_at: r.available_at }).eq("id", r.id);
  }
  const { count } = await admin.from("integration_outbox").select("id", { count: "exact", head: true }).like("topic", "relogio-%");
  console.log(`\n  (limpeza: ${criados.length} removido(s) · ${estacionados.length} restaurado(s) · sobraram ${count ?? "?"})`);
}

console.log(`\n${falhou === 0 ? "✔" : "✘"} ${ok} passaram · ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
