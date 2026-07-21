/**
 * Teste adversarial do núcleo puro de saúde criativa pós-Andromeda.
 *
 * Standalone, sem framework: executa o CÓDIGO REAL de
 * lib/meta/marketing/andromeda-report.ts (strip de tipos nativo do Node —
 * o núcleo é puro e o único import é de tipo, apagado no strip) e valida
 * bordas exatas dos thresholds, honestidade com 1 janela, degraus de
 * diversidade, ponderação do score e limites de consolidação.
 *
 * Rodar da raiz do repo: node scripts/check-andromeda-report.mjs (Node >= 22.13)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "lib", "meta", "marketing", "andromeda-report.ts");
const stripped = stripTypeScriptTypes(fs.readFileSync(sourcePath, "utf8"));
const { analyzeCreativeHealth, accountConsolidation } = await import(
  `data:text/javascript;base64,${Buffer.from(stripped, "utf8").toString("base64")}`
);

const failures = [];
let passed = 0;
function check(name, condition, extra = "") {
  if (condition) passed += 1;
  else failures.push(`${name}${extra ? ` — ${extra}` : ""}`);
}

// Fábrica de linhas anúncio × janela (W1 anterior, W2 última)
const W1 = "2026-06-01";
const W2 = "2026-06-08";
const row = (over = {}) => ({
  campaignId: "c1", campaignName: "Campanha 1",
  adId: "a1", adName: "Ad 1",
  spend: 100, impressions: 10000, clicks: 100, leads: 5,
  frequency: 1.5, ctr: 1, cpm: 10,
  dateStart: W2, dateStop: "2026-06-14",
  ...over,
});
const kinds = (report) => report.fatigue.map((f) => f.kind);
const recKinds = (report) => report.recommendations.map((m) => m.kind);

// 1. rows vazio não quebra e devolve lista vazia
check("caso 1: rows vazio devolve []", Array.isArray(analyzeCreativeHealth([])) && analyzeCreativeHealth([]).length === 0);

// 2. 1 janela só = sem sinal de fadiga, mesmo com frequência absurda (honesto)
{
  const [r] = analyzeCreativeHealth([row({ frequency: 12 })]);
  check("caso 2: 1 janela não gera fadiga", r && r.fatigue.length === 0 && r.breakdown.fadiga === 100,
    `fatigue=${JSON.stringify(r?.fatigue)}`);
}

// 3. borda exata: frequency == freqLimit (2.5) NÃO dispara (limite é estrito)
{
  const [r] = analyzeCreativeHealth([row({ dateStart: W1, frequency: 2.5 }), row({ frequency: 2.5 })]);
  check("caso 3: frequency exatamente 2.5 não dispara", r && !kinds(r).includes("frequencia_alta"));
}

// 4. frequency 2.51 na última janela dispara frequencia_alta
{
  const [r] = analyzeCreativeHealth([row({ dateStart: W1, frequency: 1.0 }), row({ frequency: 2.51 })]);
  check("caso 4: frequency 2.51 dispara", r && kinds(r).includes("frequencia_alta"), `kinds=${kinds(r ?? { fatigue: [] })}`);
}

// 5. borda exata: CTR caindo exatamente 25% NÃO dispara (2.0 -> 1.5)
{
  const [r] = analyzeCreativeHealth([row({ dateStart: W1, ctr: 2.0 }), row({ ctr: 1.5 })]);
  check("caso 5: queda de CTR de exatamente 25% não dispara", r && !kinds(r).includes("ctr_caindo"));
}

// 6. CTR caindo 26% dispara (2.0 -> 1.48)
{
  const [r] = analyzeCreativeHealth([row({ dateStart: W1, ctr: 2.0 }), row({ ctr: 1.48 })]);
  check("caso 6: queda de CTR de 26% dispara", r && kinds(r).includes("ctr_caindo"));
}

// 7. borda exata: CPM subindo exatamente 20% NÃO dispara (10 -> 12)
{
  const [r] = analyzeCreativeHealth([row({ dateStart: W1, cpm: 10 }), row({ cpm: 12 })]);
  check("caso 7: alta de CPM de exatamente 20% não dispara", r && !kinds(r).includes("cpm_subindo"));
}

// 8. CPM subindo 21% dispara (10 -> 12.1)
{
  const [r] = analyzeCreativeHealth([row({ dateStart: W1, cpm: 10 }), row({ cpm: 12.1 })]);
  check("caso 8: alta de CPM de 21% dispara", r && kinds(r).includes("cpm_subindo"));
}

// 9. degraus do diversityScore: 1 ad = 20, 3 = 60, 5 = 100, 7 = 100 (teto)
for (const [n, expected] of [[1, 20], [3, 60], [5, 100], [7, 100]]) {
  const rows = Array.from({ length: n }, (_, i) => row({ adId: `a${i}`, adName: `Ad ${i}` }));
  const [r] = analyzeCreativeHealth(rows);
  check(`caso 9: diversityScore com ${n} ads = ${expected}`, r && r.activeAds === n && r.diversityScore === expected,
    `activeAds=${r?.activeAds} score=${r?.diversityScore}`);
}

// 10. score ponderado: 3 ads (60), sem histórico de fadiga (100), 1 campanha (100)
//     => 0.4*60 + 0.4*100 + 0.2*100 = 84
{
  const rows = [0, 1, 2].map((i) => row({ adId: `a${i}` }));
  const [r] = analyzeCreativeHealth(rows);
  check("caso 10: score ponderado 84", r && r.andromedaScore === 84, `score=${r?.andromedaScore}`);
}

// 11. fadiga proporcional: 2 ads avaliados, 1 fatigado => breakdown.fadiga = 50
//     e score = 0.4*40 + 0.4*50 + 0.2*100 = 56
{
  const rows = [
    row({ adId: "a1", dateStart: W1, ctr: 2.0 }), row({ adId: "a1", ctr: 0.5 }), // -75% CTR
    row({ adId: "a2", dateStart: W1 }), row({ adId: "a2" }), // estável
  ];
  const [r] = analyzeCreativeHealth(rows);
  check("caso 11: fadiga 50 e score 56", r && r.breakdown.fadiga === 50 && r.andromedaScore === 56,
    `fadiga=${r?.breakdown.fadiga} score=${r?.andromedaScore}`);
}

// 12. pausar_criativo: 2+ sinais simultâneos com gasto relevante (100% da campanha)
{
  const rows = [row({ dateStart: W1, ctr: 2.0, cpm: 10 }), row({ ctr: 0.5, cpm: 20 })];
  const [r] = analyzeCreativeHealth(rows);
  const pause = r?.recommendations.find((m) => m.kind === "pausar_criativo");
  check("caso 12: 2 sinais + gasto relevante => pausar_criativo prioridade 1",
    Boolean(pause) && pause.priority === 1 && pause.target === "Ad 1", JSON.stringify(r?.recommendations));
}

// 13. renovar_criativo: 1 sinal com gasto relevante
{
  const rows = [row({ dateStart: W1, ctr: 2.0 }), row({ ctr: 0.5 })];
  const [r] = analyzeCreativeHealth(rows);
  check("caso 13: 1 sinal + gasto relevante => renovar_criativo",
    recKinds(r ?? { recommendations: [] }).includes("renovar_criativo") && !recKinds(r).includes("pausar_criativo"));
}

// 14. gasto irrelevante (< 10% da campanha): sinal aparece em fatigue, mas sem move de pausa/renovação
{
  const rows = [
    row({ adId: "a1", adName: "Pequeno", dateStart: W1, ctr: 2.0, spend: 5 }), row({ adId: "a1", adName: "Pequeno", ctr: 0.5, spend: 5 }),
    row({ adId: "a2", adName: "Grande", dateStart: W1, spend: 195 }), row({ adId: "a2", adName: "Grande", spend: 195 }),
  ];
  const [r] = analyzeCreativeHealth(rows);
  const moves = recKinds(r ?? { recommendations: [] });
  check("caso 14: fadiga com gasto irrelevante não gera pausa/renovação",
    r && kinds(r).includes("ctr_caindo") && !moves.includes("pausar_criativo") && !moves.includes("renovar_criativo"),
    `kinds=${kinds(r ?? { fatigue: [] })} moves=${moves}`);
}

// 15. 4 campanhas: consolidacao = 80 em todas + recomendação consolidar_campanhas
{
  const rows = [1, 2, 3, 4].map((i) => row({ campaignId: `c${i}`, campaignName: `Campanha ${i}` }));
  const reports = analyzeCreativeHealth(rows);
  check("caso 15: 4 campanhas => consolidacao 80 e consolidar_campanhas",
    reports.length === 4 &&
    reports.every((r) => r.breakdown.consolidacao === 80 && recKinds(r).includes("consolidar_campanhas")));
}

// 16. campanha saudável (5 ads, sem fadiga, conta consolidada) => só "manter"
{
  const rows = Array.from({ length: 5 }, (_, i) => row({ adId: `a${i}` }));
  const [r] = analyzeCreativeHealth(rows);
  check("caso 16: saudável => única recomendação é manter",
    r && r.recommendations.length === 1 && r.recommendations[0].kind === "manter" && r.andromedaScore === 100,
    JSON.stringify(r?.recommendations));
}

// 17. opts customizados são respeitados (freqLimit 5 silencia; ctrDropPct 10 sensibiliza)
{
  const rows = [row({ dateStart: W1, frequency: 4, ctr: 2.0 }), row({ frequency: 4, ctr: 1.7 })]; // CTR -15%
  const [strict] = analyzeCreativeHealth(rows); // defaults: freq 4 > 2.5 dispara; -15% < 25% não
  const [custom] = analyzeCreativeHealth(rows, { freqLimit: 5, ctrDropPct: 10 });
  check("caso 17a: defaults — freq dispara, CTR não",
    strict && kinds(strict).includes("frequencia_alta") && !kinds(strict).includes("ctr_caindo"));
  check("caso 17b: opts — freq silencia, CTR dispara",
    custom && !kinds(custom).includes("frequencia_alta") && kinds(custom).includes("ctr_caindo"));
}

// 18. CTR/CPM anterior igual a zero: sem divisão por zero, sem sinal fantasma
{
  const rows = [row({ dateStart: W1, ctr: 0, cpm: 0 }), row({ ctr: 0, cpm: 50 })];
  const [r] = analyzeCreativeHealth(rows);
  check("caso 18: base zero não gera sinal nem NaN", r && r.fatigue.length === 0 && Number.isFinite(r.andromedaScore));
}

// 19. accountConsolidation nos limites exatos
{
  const frag = accountConsolidation(4, 4999.99);
  const okCampanhas = accountConsolidation(3, 4999.99); // 3 campanhas = ainda ok
  const okVerba = accountConsolidation(4, 5000); // R$ 5.000 exatos = não é "pequena"
  const zero = accountConsolidation(0, 0);
  check("caso 19a: < R$5k e 4 campanhas => fragmentada", frag.verdict === "fragmentada" && frag.reason.length > 0);
  check("caso 19b: < R$5k e 3 campanhas => consolidada", okCampanhas.verdict === "consolidada");
  check("caso 19c: R$5.000,00 exatos => consolidada", okVerba.verdict === "consolidada");
  check("caso 19d: conta zerada não quebra", zero.verdict === "consolidada" && typeof zero.reason === "string");
}

// 20. ordenação: pior campanha primeiro
{
  const rows = [
    row({ campaignId: "boa", campaignName: "Boa", adId: "b1" }),
    ...Array.from({ length: 4 }, (_, i) => row({ campaignId: "boa", campaignName: "Boa", adId: `b${i + 2}` })),
    row({ campaignId: "ruim", campaignName: "Ruim", adId: "r1" }),
  ];
  const reports = analyzeCreativeHealth(rows);
  check("caso 20: pior score vem primeiro", reports[0]?.campaignId === "ruim" && reports[1]?.campaignId === "boa",
    reports.map((r) => `${r.campaignId}:${r.andromedaScore}`).join(","));
}

if (failures.length) {
  console.error(`Andromeda report: falhou (${passed} ok, ${failures.length} falhas)\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Andromeda report: aprovado — ${passed} verificações adversariais passaram (bordas de threshold, 1 janela honesta, degraus de diversidade, ponderação, consolidação e entradas vazias).`);
