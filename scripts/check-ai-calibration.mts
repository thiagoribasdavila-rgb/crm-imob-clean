import { mergeCalibration, flattenCalibration, calibrationSummary, DEFAULT_CALIBRATION, CALIBRATION_RAILS } from "../lib/ai/calibration.ts";
import { marketingEfficiencyPlan } from "../lib/ai/marketing-strategist.ts";
import type { CostBucket } from "../lib/marketing/cost-report.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`); };

// 1. sem overrides → defaults intactos, nada rejeitado
{
  const { calibration, rejected } = mergeCalibration({});
  t("vazio → defaults", JSON.stringify(calibration) === JSON.stringify(DEFAULT_CALIBRATION) && rejected.length === 0);
}
// 2. override válido dentro do trilho
{
  const { calibration, rejected } = mergeCalibration({ fatigue: { freqLimit: 3 } });
  t("freqLimit 3 aceito", calibration.fatigue.freqLimit === 3 && rejected.length === 0);
}
// 3. fora do trilho → clamp + reporte
{
  const { calibration, rejected } = mergeCalibration({ fatigue: { freqLimit: 99 } });
  t("freqLimit 99 → clamp 6", calibration.fatigue.freqLimit === 6);
  t("clamp é reportado", rejected.some((r) => r.path === "fatigue.freqLimit" && r.reason.includes("trilho")));
}
// 4. política travada → rejeitado, valor intacto
{
  const { calibration, rejected } = mergeCalibration({ audience: { minRadiusKm: 5 } });
  t("política travada rejeitada", rejected.some((r) => r.path === "audience.minRadiusKm" && r.reason.includes("travado")));
  t("valor de política intacto", calibration.audience.minRadiusKm === 24);
}
// 5. lixo: grupo/campo desconhecido, não-numérico, tipos errados
{
  const { calibration, rejected } = mergeCalibration({ hacker: { x: 1 }, marketing: { foo: 9, cplRatioReview: "abc" } });
  t("grupo desconhecido rejeitado", rejected.some((r) => r.path === "hacker"));
  t("campo desconhecido rejeitado", rejected.some((r) => r.path === "marketing.foo"));
  t("não-numérico rejeitado", rejected.some((r) => r.path === "marketing.cplRatioReview" && r.reason.includes("numérico")));
  t("default preservado após lixo", calibration.marketing.cplRatioReview === 2);
}
{
  const arr = mergeCalibration([1, 2]);
  t("array → rejeitado sem crash", arr.rejected.length === 1 && arr.calibration.marketing.minSpendToJudgeBrl === 300);
  const nil = mergeCalibration(null);
  t("null → defaults sem reclamar", nil.rejected.length === 0);
  const grpArr = mergeCalibration({ fatigue: [1] });
  t("grupo array → rejeitado", grpArr.rejected.some((r) => r.path === "fatigue"));
}
// 6. flatten cobre todos os trilhos e marca travas
{
  const flat = flattenCalibration(DEFAULT_CALIBRATION);
  t("flatten cobre todos os params", flat.length === Object.keys(CALIBRATION_RAILS).length);
  t("travas marcadas", flat.filter((f) => f.locked).length === 3);
  t("valores batem com default", flat.every((f) => Number.isFinite(f.value)));
}
// 7. summary legível cita política travada
{
  const s = calibrationSummary(DEFAULT_CALIBRATION);
  t("summary 9 linhas", s.length === 9);
  t("summary cita HOUSING travado", s.some((l) => l.includes("HOUSING") && l.includes("travado")));
}
// 8. estrategista OBEDECE a calibração: minSpend custom
{
  const camp = (label: string, spend: number, leads: number): CostBucket => ({ key: label, label, spend, leads, sales: 0, cpl: leads > 0 ? spend / leads : null, cac: null, share: 0 });
  // default (300): gasto 250 sem leads NÃO pausa; calibrado p/ 100: pausa
  const pDefault = marketingEfficiencyPlan([], [camp("X", 250, 0)], { salesKnown: false });
  const pCalibrado = marketingEfficiencyPlan([], [camp("X", 250, 0)], { salesKnown: false, minSpendToJudgeBrl: 100 });
  t("default: 250 sem leads → tolera", !pDefault.moves.some((m) => m.kind === "pausar"));
  t("calibrado 100: 250 sem leads → pausa", pCalibrado.moves.some((m) => m.kind === "pausar"));
  // cplRatio custom: mediana 3, cara CPL 5 → só revisa com ratio 1.5, não com 2
  const cs = [camp("b1", 300, 100), camp("b2", 300, 100), camp("cara", 500, 100)];
  cs[2].cpl = 5;
  const pR2 = marketingEfficiencyPlan([], cs, { salesKnown: false });
  const pR15 = marketingEfficiencyPlan([], cs, { salesKnown: false, cplRatioReview: 1.5 });
  t("ratio 2: CPL 5 vs mediana 3 → sem revisar", !pR2.moves.some((m) => m.kind === "revisar"));
  t("ratio 1.5 calibrado: → revisar", pR15.moves.some((m) => m.kind === "revisar" && m.target === "cara"));
}
// 9. regressão: comportamento default idêntico ao pré-calibração
{
  const camp = (label: string, spend: number, leads: number, sales = 0): CostBucket => ({ key: label, label, spend, leads, sales, cpl: leads > 0 ? spend / leads : null, cac: sales > 0 ? spend / sales : null, share: 0 });
  const p = marketingEfficiencyPlan([], [camp("A", 500, 100, 0)]);
  t("regressão: default salesKnown 0 vendas → pausar", p.moves.some((m) => m.kind === "pausar"));
}

console.log(`\n${pass}/${pass + fail} ok`);
process.exit(fail ? 1 : 0);
