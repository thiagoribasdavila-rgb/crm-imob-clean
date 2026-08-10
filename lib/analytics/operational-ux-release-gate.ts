type UxEventRow = { payload?: Record<string, unknown> | null };

const OPERATIONAL_UX_VERSION = "atlas-v30-phase-59";
const OPERATIONAL_UX_MINIMUM_SAMPLE = 10;

export const OPERATIONAL_UX_RELEASE_FLAG = "operational_ux_v30";
export const OPERATIONAL_UX_ROLLBACK_TARGET = "atlas-v3-operational-safe";

export type ReleaseGateStatus = "blocked" | "ready_for_director" | "approved" | "rolled_back";

export type ReleaseChecklistItem = {
  key: string;
  label: string;
  passed: boolean;
  evidence: string;
};

const percent = (value: number | null) => value === null ? "não medido" : `${(value * 100).toFixed(1)}%`;
const decimal = (value: number | null) => value === null ? "não medido" : value.toFixed(1);
const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null;
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const rate = (values: boolean[]) => values.length ? values.filter(Boolean).length / values.length : null;

function summarize(rows: UxEventRow[]) {
  const payloads = rows.map((row) => row.payload ?? {});
  return {
    sessions: payloads.length,
    averageDurationMs: average(payloads.map((item) => numeric(item.durationMs)).filter((item): item is number => item !== null)),
    averageClicks: average(payloads.map((item) => numeric(item.clickCount)).filter((item): item is number => item !== null)),
    errorRate: rate(payloads.map((item) => (numeric(item.errorCount) ?? 0) > 0)),
    readingRate: rate(payloads.filter((item) => typeof item.readEngaged === "boolean").map((item) => item.readEngaged === true)),
    completionRate: rate(payloads.map((item) => (numeric(item.completionCount) ?? 0) > 0)),
    decisionQuality: average(payloads.map((item) => numeric(item.decisionQualityAverage)).filter((item): item is number => item !== null)),
  };
}

function compareOperationalUx(rows: UxEventRow[]) {
  const before = summarize(rows.filter((row) => row.payload?.experienceVersion !== OPERATIONAL_UX_VERSION));
  const after = summarize(rows.filter((row) => row.payload?.experienceVersion === OPERATIONAL_UX_VERSION));
  const comparable = before.sessions >= OPERATIONAL_UX_MINIMUM_SAMPLE && after.sessions >= OPERATIONAL_UX_MINIMUM_SAMPLE;
  return { before, after, comparable, minimumSample: OPERATIONAL_UX_MINIMUM_SAMPLE, interpretation: comparable ? "comparison_available" : "insufficient_sample", caveat: "Associação observada; não prova causalidade." };
}

export function evaluateOperationalUxRelease(rows: UxEventRow[]) {
  const measurement = compareOperationalUx(rows);
  const { before, after } = measurement;
  const checklist: ReleaseChecklistItem[] = [
    {
      key: "comparable_sample",
      label: "Amostra mínima antes e depois",
      passed: measurement.comparable,
      evidence: `${before.sessions} sessões antes e ${after.sessions} depois; mínimo ${measurement.minimumSample} por coorte.`,
    },
    {
      key: "error_safety",
      label: "Erros sem regressão observada",
      passed: measurement.comparable && after.errorRate !== null && (before.errorRate === null ? after.errorRate <= 0.05 : after.errorRate <= before.errorRate),
      evidence: `Antes ${percent(before.errorRate)}; depois ${percent(after.errorRate)}.`,
    },
    {
      key: "interaction_efficiency",
      label: "Cliques sem regressão observada",
      passed: measurement.comparable && before.averageClicks !== null && after.averageClicks !== null && after.averageClicks <= before.averageClicks,
      evidence: `Antes ${decimal(before.averageClicks)}; depois ${decimal(after.averageClicks)} cliques por sessão.`,
    },
    {
      key: "completion_safety",
      label: "Conclusão sem regressão observada",
      passed: measurement.comparable && after.completionRate !== null && (before.completionRate === null || after.completionRate >= before.completionRate),
      evidence: `Antes ${percent(before.completionRate)}; depois ${percent(after.completionRate)}.`,
    },
    {
      key: "decision_utility",
      label: "Qualidade média das decisões",
      passed: measurement.comparable && after.decisionQuality !== null && after.decisionQuality >= 4,
      evidence: `Avaliação humana depois: ${decimal(after.decisionQuality)}/5; mínimo 4/5.`,
    },
  ];
  const evidenceReady = checklist.every((item) => item.passed);
  return {
    experienceVersion: OPERATIONAL_UX_VERSION,
    rollbackTarget: OPERATIONAL_UX_ROLLBACK_TARGET,
    evidenceReady,
    recommendedStatus: evidenceReady ? "ready_for_director" as const : "blocked" as const,
    checklist,
    measurement,
    caveat: "O gate usa associação observada e aceite humano; não atribui causalidade ao redesign.",
  };
}
