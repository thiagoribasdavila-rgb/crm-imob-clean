/**
 * PROVA MEDIDA: o denominador do funil e os zeros que eram falha de leitura.
 *
 * ── O QUE ELA MEDE, E CONTRA O QUÊ ──────────────────────────────────────────
 *
 * Lê a organização REAL (somente SELECT) e calcula o funil das DUAS maneiras:
 *
 *   ANTES · `quantidade / porEtapa.get("novo")` — o estoque parado na primeira
 *           coluna neste instante. É o que a tela imprimia como "% do topo".
 *   AGORA · `quantidade / coorte de entrada` — quem de fato entrou no funil,
 *           calculado pelo módulo puro que a rota passou a usar.
 *
 * Depois injeta FALHA em cada uma das leituras que a rota engolia, e mostra a
 * frase que a tela publicava contra a que ela publica agora. Nenhuma escrita:
 * a falha é simulada no módulo puro, não no banco.
 *
 * uso: node scripts/prova-sala-de-comando-nao-inventa-zero.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

import {
  comparacaoDeEstado,
  coorteDeEntrada,
  declaraLeituras,
  medidaDoInvestimento,
  montaEtapasDoFunil,
} from "../lib/atlas/sala-de-comando-medicao.ts";
import { mergePipelineStageSettings, canonicalPipelineStage } from "../lib/atlas/pipeline-stages.ts";

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

/* ── A verdade, lida do banco (somente SELECT) ─────────────────────────────── */
const { data: amostra } = await admin.from("leads").select("organization_id").limit(2000);
const porOrg = new Map();
for (const l of amostra ?? []) porOrg.set(l.organization_id, (porOrg.get(l.organization_id) ?? 0) + 1);
const org = [...porOrg.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

const { data: leads } = await admin
  .from("leads").select("id,status,created_at").eq("organization_id", org).range(0, 4999);
const { data: config } = await admin
  .from("pipeline_stage_settings").select("stage_key,label,probability,position,visible").eq("organization_id", org);
const { data: movs } = await admin
  .from("pipeline_stage_moves").select("lead_id,to_stage,occurred_at").eq("organization_id", org).range(0, 4999);
const { count: linhasDeGasto } = await admin
  .from("marketing_spend").select("id", { count: "exact", head: true }).eq("organization_id", org);
// O MESMO recorte que a rota usa (`campaign_external_id` não nulo): contar sem
// ele imprimiria 896 onde a rota lê 47, e a prova passaria a divergir da coisa
// provada.
const { count: toques } = await admin
  .from("lead_attribution_touches").select("lead_id", { count: "exact", head: true })
  .eq("organization_id", org).not("campaign_external_id", "is", null);

const porEtapa = new Map();
for (const l of leads ?? []) {
  const etapa = canonicalPipelineStage(l.status) ?? "novo";
  porEtapa.set(etapa, (porEtapa.get(etapa) ?? 0) + 1);
}
const jaPassaram = new Map();
for (const m of movs ?? []) {
  const destino = canonicalPipelineStage(m.to_stage);
  if (!destino || !m.lead_id) continue;
  if (!jaPassaram.has(destino)) jaPassaram.set(destino, new Set());
  jaPassaram.get(destino).add(m.lead_id);
}
const etapas = mergePipelineStageSettings(config ?? []).filter((e) => e.outcome === "open" && e.visible);
const emNovo = porEtapa.get("novo") ?? 0;
const coorte = coorteDeEntrada(leads ?? []);

console.log(`\norganização ${org}`);
console.log(`  ${leads.length} leads · ${movs.length} movimentos · ${linhasDeGasto} linhas de gasto · ${toques} toques de atribuição`);
console.log(`  estoque em "novo" (denominador ANTIGO): ${emNovo}`);
console.log(`  coorte de entrada (denominador NOVO):   ${coorte.entradas}  [${coorte.de?.slice(0, 10)} → ${coorte.ate?.slice(0, 10)}, ${coorte.semDataDeEntrada} sem carimbo]\n`);

/* ── 1. AS DUAS RAZÕES, ETAPA POR ETAPA ────────────────────────────────────── */
const medido = montaEtapasDoFunil({
  etapas,
  quantidadePorEtapa: porEtapa,
  jaPassaramPorEtapa: new Map([...jaPassaram].map(([k, v]) => [k, v.size])),
  coorte,
  movimentoMensuravel: true,
  desdeQuando: "27/07",
  emNovo,
  totalDeLeads: leads.length,
});

console.log("  etapa            estoque   ANTES (% do estoque em novo)   AGORA (% da coorte)   inflação");
let maiorInflacao = 0;
for (const etapa of medido) {
  const antes = emNovo > 0 ? Math.round((etapa.quantidade / emNovo) * 1000) / 10 : null;
  const agora = etapa.percentualDoTopo;
  const fator = antes && agora ? Math.round((antes / agora) * 10) / 10 : null;
  if (fator && fator > maiorInflacao) maiorInflacao = fator;
  console.log(
    `  ${etapa.chave.padEnd(15)} ${String(etapa.quantidade).padStart(6)}   ${String(antes ?? "—").padStart(22)}%   ${String(agora ?? "—").padStart(17)}%   ${fator ? `${fator}x` : "—"}`,
  );
}
console.log("");

conferir(
  "o percentual publicado agora é sobre a coorte de entrada, não sobre o estoque",
  medido.every((e) => e.denominador.leads === coorte.entradas && e.denominador.chave === "coorte-de-entrada"),
  `denominador = ${medido[0]?.denominador.leads}`,
);
const contato = medido.find((e) => e.chave === "contato");
conferir(
  "a razão de `contato` bate com a conta feita no banco",
  contato && contato.percentualDoTopo === Math.round((contato.quantidade / leads.length) * 1000) / 10,
  `${contato?.quantidade}/${leads.length} = ${contato?.percentualDoTopo}%`,
);
conferir(
  "o número ANTIGO era maior — o denominador escondia o problema, não o exagerava",
  emNovo > 0 && contato && (contato.quantidade / emNovo) > (contato.quantidade / leads.length),
  `antes ${Math.round((contato.quantidade / emNovo) * 1000) / 10}% · agora ${contato.percentualDoTopo}% · ${maiorInflacao}x`,
);

/* ── 2. AS LEITURAS QUE ERAM ENGOLIDAS ─────────────────────────────────────── */
console.log("\n  ── falha injetada em cada leitura que a rota engolia ──\n");

const semHistorico = montaEtapasDoFunil({
  etapas,
  quantidadePorEtapa: porEtapa,
  jaPassaramPorEtapa: new Map(),
  coorte,
  movimentoMensuravel: false,
  desdeQuando: null,
  emNovo,
  totalDeLeads: leads.length,
});
conferir(
  "pipeline_stage_moves quebrada: `jaPassaram` vira null, não 0",
  semHistorico.every((e) => e.jaPassaram === null),
  `antes: ${medido.map((e) => `${e.chave}=${e.jaPassaram}`).join(" ")} → agora: null em todas`,
);

const gastoQuebrado = medidaDoInvestimento({ gastoErro: { message: "connection reset" }, atribuicaoErro: null, linhasDeGasto: 0 });
const gastoLido = medidaDoInvestimento({ gastoErro: null, atribuicaoErro: null, linhasDeGasto });
console.log(`  ANTES (leitura quebrada) → importado=false → a tela imprimia:`);
console.log(`      "Nenhum investimento importado ainda. O worker investimento-de-midia grava o gasto da Meta uma vez por dia..."`);
console.log(`  AGORA → mensuravel=${gastoQuebrado.mensuravel} → "${gastoQuebrado.porqueIndisponivel}"\n`);
conferir(
  "marketing_spend quebrada deixa de acusar o worker de importação",
  gastoQuebrado.mensuravel === false && /não é o worker/.test(gastoQuebrado.porqueIndisponivel),
  `há ${linhasDeGasto} linhas de gasto gravadas — a frase antiga seria falsa em duas camadas`,
);
conferir(
  "com a leitura boa, a medida de hoje é afirmada e nada muda para o usuário",
  gastoLido.mensuravel === true && gastoLido.importado === (linhasDeGasto > 0),
  `importado=${gastoLido.importado} sobre ${linhasDeGasto} linhas`,
);

const janelaAnterior = (movs ?? []).filter((m) => {
  const t = new Date(m.occurred_at).getTime();
  const agora = Date.now();
  return t >= agora - 60 * 86_400_000 && t < agora - 30 * 86_400_000;
}).length;
const deltaQuebrado = comparacaoDeEstado({ movimentoMensuravel: false, movimentosNaJanelaAnterior: 0, inicioFormatado: "27/07/2026" });
const deltaLido = comparacaoDeEstado({ movimentoMensuravel: true, movimentosNaJanelaAnterior: janelaAnterior, inicioFormatado: "27/07/2026" });
conferir(
  "sem ler o histórico, a rota para de AFIRMAR que a janela anterior está vazia",
  deltaQuebrado.movimentosNaJanelaAnterior === null && !/não há um único movimento/.test(deltaQuebrado.porqueIndisponivel),
  deltaQuebrado.porqueIndisponivel.slice(0, 96),
);
conferir(
  "com o histórico lido, a afirmação forte continua sendo publicada",
  /não há um único movimento|já cobre a janela anterior/.test(deltaLido.porqueIndisponivel),
  `${janelaAnterior} movimentos na janela anterior, medidos`,
);

/* ── 3. O ROSTER DE LEITURAS ───────────────────────────────────────────────── */
const rosterHoje = declaraLeituras([
  { fonte: "leads", serve: "Os indicadores", erro: null, truncada: false },
  { fonte: "pipeline_stage_settings", serve: "As etapas do funil", erro: config ? null : { message: "sem retorno" } },
  { fonte: "pipeline_stage_moves", serve: "\"Já passaram\"", erro: null, truncada: false },
  { fonte: "marketing_spend", serve: "O investimento", erro: null, truncada: false },
  { fonte: "lead_attribution_touches", serve: "A origem das leads", erro: null, truncada: false },
  { fonte: "developments", serve: "O ranking de projetos", erro: null },
  { fonte: "profiles", serve: "Os nomes dos corretores", erro: null },
]);
const rosterQuebrado = declaraLeituras([
  { fonte: "leads", serve: "Os indicadores", erro: null },
  { fonte: "marketing_spend", serve: "O investimento", erro: { message: "boom" } },
]);
console.log(`\n  roster hoje: ${rosterHoje.resumo}`);
console.log(`  roster com uma leitura quebrada: ${rosterQuebrado.resumo}\n`);
conferir("o roster afirma N de N só quando as N responderam por inteiro",
  rosterHoje.todasMedidas === true && rosterQuebrado.todasMedidas === false,
  `${rosterHoje.medidas}/${rosterHoje.total} hoje · ${rosterQuebrado.medidas}/${rosterQuebrado.total} com falha`);

console.log(`\n${falhou === 0 ? "✔" : "✘"} ${ok} passaram · ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
