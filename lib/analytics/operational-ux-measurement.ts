export const OPERATIONAL_UX_VERSION = "atlas-v30-phase-59";
export const OPERATIONAL_UX_MINIMUM_SAMPLE = 10;

export type UxEventRow = { payload?: Record<string, unknown> | null };
type Cohort = { sessions: number; averageDurationMs: number | null; averageClicks: number | null; errorRate: number | null; readingRate: number | null; completionRate: number | null; decisionQuality: number | null };

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null;
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const rate = (values: boolean[]) => values.length ? values.filter(Boolean).length / values.length : null;

function summarize(rows: UxEventRow[]): Cohort {
  const payloads = rows.map((row) => row.payload ?? {});
  return {
    sessions: payloads.length,
    averageDurationMs: average(payloads.map((item) => number(item.durationMs)).filter((item): item is number => item !== null)),
    averageClicks: average(payloads.map((item) => number(item.clickCount)).filter((item): item is number => item !== null)),
    errorRate: rate(payloads.map((item) => (number(item.errorCount) ?? 0) > 0)),
    readingRate: rate(payloads.filter((item) => typeof item.readEngaged === "boolean").map((item) => item.readEngaged === true)),
    completionRate: rate(payloads.map((item) => (number(item.completionCount) ?? 0) > 0)),
    decisionQuality: average(payloads.map((item) => number(item.decisionQualityAverage)).filter((item): item is number => item !== null)),
  };
}

export function compareOperationalUx(rows: UxEventRow[], minimumSample = OPERATIONAL_UX_MINIMUM_SAMPLE) {
  const beforeRows = rows.filter((row) => row.payload?.experienceVersion !== OPERATIONAL_UX_VERSION);
  const afterRows = rows.filter((row) => row.payload?.experienceVersion === OPERATIONAL_UX_VERSION);
  const before = summarize(beforeRows);
  const after = summarize(afterRows);
  const comparable = before.sessions >= minimumSample && after.sessions >= minimumSample;
  return { before, after, comparable, minimumSample, interpretation: comparable ? "comparison_available" : "insufficient_sample", caveat: "Associação observada; não prova causalidade. Leitura é proxy de tempo e profundidade de rolagem; qualidade é avaliação humana." };
}
