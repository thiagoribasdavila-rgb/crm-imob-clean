export type ScenarioMetric = "lead_stage" | "lead_score" | "next_action_scheduled";
export type ScenarioDirection = "increase" | "maintain" | "decrease" | "be_present";

const stageOrder = ["novo", "contato", "qualificacao", "visita", "proposta", "contrato", "ganho"];

function comparable(metric: ScenarioMetric, value: unknown) {
  if (metric === "lead_score") {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (metric === "lead_stage") {
    const normalized = String(value ?? "").trim().toLocaleLowerCase("pt-BR");
    const index = stageOrder.indexOf(normalized);
    return index >= 0 ? index : null;
  }
  return value ? 1 : 0;
}

export function compareScenarioObservation(input: {
  metric: ScenarioMetric;
  expectedDirection: ScenarioDirection;
  baseline: unknown;
  observed: unknown;
}) {
  const baseline = comparable(input.metric, input.baseline);
  const observed = comparable(input.metric, input.observed);
  if (baseline === null || observed === null) {
    return { comparable: false, matched: null, delta: null, reason: "evidence_not_comparable" } as const;
  }
  const delta = observed - baseline;
  const matched = input.expectedDirection === "increase"
    ? delta > 0
    : input.expectedDirection === "decrease"
      ? delta < 0
      : input.expectedDirection === "be_present"
        ? observed > 0
        : delta === 0;
  return { comparable: true, matched, delta, reason: matched ? "expectation_observed" : "expectation_not_observed" } as const;
}

export function scenarioMetricValue(row: Record<string, unknown>, metric: ScenarioMetric) {
  if (metric === "lead_stage") return row.status ?? null;
  if (metric === "lead_score") return row.score_ia ?? null;
  return row.next_action_at ?? row.next_action ?? row.next_contact ?? null;
}
