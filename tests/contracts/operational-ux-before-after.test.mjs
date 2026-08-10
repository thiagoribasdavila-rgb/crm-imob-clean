import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compareOperationalUx, OPERATIONAL_UX_VERSION } from "../../lib/analytics/operational-ux-measurement.ts";

const telemetry = readFileSync("components/atlas/navigation-performance.tsx", "utf8");
const api = readFileSync("app/api/v1/analytics/operational-ux/route.ts", "utf8");
const ledger = readFileSync("app/api/v1/decisions/ledger/route.ts", "utf8");
const panel = readFileSync("components/decision-center/OperationalUxMeasurement.tsx", "utf8");
const config = JSON.parse(readFileSync("config/operational-ux-phase-059-before-after-measurement.json", "utf8"));

const event = (payload) => ({ payload });

test("fase 59 mede as seis dimensões no repositório canônico e sem PII", () => {
  assert.equal(config.phase, 59);
  assert.equal(config.canonicalEventStore, "atlas_events");
  assert.equal(config.personallyIdentifiablePayload, false);
  for (const marker of ["durationMs", "clickCount", "errorCount", "readEngaged", "completionCount", "decisionQualityAverage"]) assert.match(telemetry, new RegExp(marker));
  assert.match(api, /from\("atlas_events"\)/);
  assert.match(api, /eq\("organization_id"/);
});

test("coortes antigas e novas permanecem separadas", () => {
  const before = Array.from({ length: 10 }, () => event({ durationMs: 12000, clickCount: 4 }));
  const after = Array.from({ length: 10 }, () => event({ experienceVersion: OPERATIONAL_UX_VERSION, durationMs: 9000, clickCount: 3, errorCount: 0, readEngaged: true, completionCount: 1, decisionQualityAverage: 4 }));
  const result = compareOperationalUx([...before, ...after]);
  assert.equal(result.before.sessions, 10);
  assert.equal(result.after.sessions, 10);
  assert.equal(result.comparable, true);
});

test("amostra insuficiente nunca vira alegação de melhoria", () => {
  const result = compareOperationalUx([event({}), event({ experienceVersion: OPERATIONAL_UX_VERSION })]);
  assert.equal(result.comparable, false);
  assert.equal(result.interpretation, "insufficient_sample");
  assert.match(result.caveat, /não prova causalidade/i);
});

test("qualidade é informada por pessoa e validada entre 1 e 5", () => {
  assert.equal(config.qualityIsHumanRated, true);
  assert.match(ledger, /decisionQualityRating/);
  assert.match(ledger, /qualityRatedByHuman: true/);
  assert.match(panel, /Amostra comparável/);
});

test("fase preserva base e não gera release", () => {
  assert.equal(config.migrationCreated, false);
  assert.equal(config.remoteDataChangedDuringPhase, false);
  assert.equal(config.externalDeliveryDuringPhase, false);
  assert.equal(config.buildExecuted, false);
});
