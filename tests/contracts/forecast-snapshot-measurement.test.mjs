import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateFrozenForecast, assessForecastTrend } from "../../lib/analytics/forecast-measurement.ts";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("avalia somente vendas da coorte congelada dentro do horizonte", () => {
  const result = evaluateFrozenForecast({
    snapshotAt: "2026-01-01T00:00:00.000Z",
    horizonEnd: "2026-01-31T00:00:00.000Z",
    predictedWeighted: 100,
    frozen: [{ id: "a", stage: "proposal", value: 100, expectedCloseAt: null, probability: 50, predictedWeighted: 50 }],
    observed: [
      { id: "a", value: 80, won_at: "2026-01-20T00:00:00.000Z" },
      { id: "b", value: 999, won_at: "2026-01-20T00:00:00.000Z" },
    ],
  });
  assert.deepEqual(result, { actualWonValue: 80, actualWonCount: 1, absoluteError: 20, accuracyPercent: 80, direction: "below" });
});

test("não inventa precisão quando a previsão é zero", () => {
  const result = evaluateFrozenForecast({ snapshotAt: "2026-01-01T00:00:00Z", horizonEnd: "2026-02-01T00:00:00Z", predictedWeighted: 0, frozen: [], observed: [] });
  assert.equal(result.accuracyPercent, null);
});

test("tendência exige três janelas independentes, mesmo horizonte e amostra mínima", () => {
  const insufficient = assessForecastTrend([{ snapshot_at: "2026-01-01", horizon_end: "2026-01-31", horizon_days: 30, opportunity_count: 10, accuracy_percent: 70 }]);
  assert.equal(insufficient.claimAllowed, false);
  const comparable = assessForecastTrend([
    { snapshot_at: "2026-01-01", horizon_end: "2026-01-31", horizon_days: 30, opportunity_count: 10, accuracy_percent: 70 },
    { snapshot_at: "2026-01-31", horizon_end: "2026-03-02", horizon_days: 30, opportunity_count: 10, accuracy_percent: 75 },
    { snapshot_at: "2026-03-02", horizon_end: "2026-04-01", horizon_days: 30, opportunity_count: 10, accuracy_percent: 80 },
  ]);
  assert.equal(comparable.claimAllowed, true);
  assert.equal(comparable.movement, 10);
});

test("contrato preserva organização, gestão, imutabilidade e aferição manual", () => {
  const api = read("app/api/v1/analytics/forecast/snapshots/route.ts");
  const migration = read("supabase/migrations/20260804224827_phase_56_forecast_snapshot_measurement.sql");
  const ui = read("components/forecast/ForecastMeasurementPanel.tsx");
  assert.match(api, /eq\("organization_id", org\)/);
  assert.match(api, /director.*superintendent/);
  assert.match(api, /FORECAST_HORIZON_OPEN/);
  assert.match(api, /opportunity_snapshot/);
  assert.match(api, /externalActionExecuted: false/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /forecast snapshot source is immutable/);
  assert.match(migration, /before delete on public\.forecast_snapshots/);
  assert.match(migration, /revoke insert, update, delete.*authenticated/);
  assert.match(ui, /Tendência ainda não declarada/);
  assert.match(ui, /Aferir resultado/);
});
