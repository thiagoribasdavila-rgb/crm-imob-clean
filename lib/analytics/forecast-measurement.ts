export type FrozenOpportunity = {
  id: string;
  stage: string;
  value: number;
  expectedCloseAt: string | null;
  probability: number;
  predictedWeighted: number;
};

export type ObservedOpportunity = {
  id: string;
  value: number | null;
  won_at: string | null;
};

export type EvaluatedForecast = {
  actualWonValue: number;
  actualWonCount: number;
  absoluteError: number;
  accuracyPercent: number | null;
  direction: "above" | "below" | "matched";
};

const rounded = (value: number) => Math.round(value * 100) / 100;

export function evaluateFrozenForecast(input: {
  snapshotAt: string;
  horizonEnd: string;
  predictedWeighted: number;
  frozen: FrozenOpportunity[];
  observed: ObservedOpportunity[];
}): EvaluatedForecast {
  const start = new Date(input.snapshotAt).getTime();
  const end = new Date(input.horizonEnd).getTime();
  const frozenIds = new Set(input.frozen.map((item) => item.id));
  const won = input.observed.filter((item) => {
    const at = item.won_at ? new Date(item.won_at).getTime() : Number.NaN;
    return frozenIds.has(item.id) && Number.isFinite(at) && at > start && at <= end;
  });
  const actualWonValue = rounded(won.reduce((sum, item) => sum + Math.max(0, Number(item.value) || 0), 0));
  const predicted = Math.max(0, Number(input.predictedWeighted) || 0);
  const absoluteError = rounded(Math.abs(predicted - actualWonValue));
  const accuracyPercent = predicted > 0
    ? rounded(Math.max(0, 100 - (absoluteError / predicted) * 100))
    : null;
  return {
    actualWonValue,
    actualWonCount: won.length,
    absoluteError,
    accuracyPercent,
    direction: actualWonValue > predicted ? "above" : actualWonValue < predicted ? "below" : "matched",
  };
}

export type ComparableForecast = {
  snapshot_at: string;
  horizon_end: string;
  horizon_days: number;
  opportunity_count: number;
  accuracy_percent: number | null;
};

export function assessForecastTrend(rows: ComparableForecast[]) {
  const measured = rows
    .filter((item) => item.accuracy_percent !== null && item.opportunity_count >= 5)
    .sort((a, b) => new Date(a.horizon_end).getTime() - new Date(b.horizon_end).getTime());
  const groups = [30, 60, 90].map((horizonDays) => measured.filter((item) => item.horizon_days === horizonDays));
  const comparable = groups.find((group) => group.length >= 3 && group.every((item, index) => index === 0 || new Date(item.snapshot_at).getTime() >= new Date(group[index - 1].horizon_end).getTime()));
  if (!comparable) return { status: "insufficient_evidence" as const, claimAllowed: false, samples: Math.max(0, ...groups.map((group) => group.length)), movement: null, horizonDays: null };
  const recent = comparable.slice(-3).map((item) => Number(item.accuracy_percent));
  const movement = rounded(recent[2] - recent[0]);
  return { status: "comparable" as const, claimAllowed: true, samples: comparable.length, movement, horizonDays: comparable[0].horizon_days };
}
