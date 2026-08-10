import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildDistributionEvidence } from "../../lib/crm/distribution-evidence.ts";

const at = (minutes) =>
  new Date(Date.parse("2026-08-10T12:00:00.000Z") + minutes * 60_000).toISOString();

function evidence(overrides = {}) {
  return buildDistributionEvidence({
    leads: [],
    assignments: [],
    queue: [],
    projectIds: ["project-a"],
    maximumEvents: 100,
    ...overrides,
  });
}

test("mede mediana e P90 apenas com criação e atribuição compatíveis", () => {
  const minutes = [10, 20, 30, 40, 100];
  const result = evidence({
    leads: minutes.map((_, index) => ({
      id: `lead-${index}`,
      development_id: "project-a",
      assigned_to: "broker-a",
      created_at: at(0),
    })),
    assignments: minutes.map((value, index) => ({
      development_id: "project-a",
      lead_id: `lead-${index}`,
      assigned_to: "broker-a",
      created_at: at(value),
    })),
    queue: [
      {
        development_id: "project-a",
        profile_id: "broker-a",
        enabled: true,
        weight: 1,
      },
    ],
  });

  assert.equal(result.overall.status, "measured");
  assert.equal(result.overall.medianMinutes, 30);
  assert.equal(result.overall.p90Minutes, 100);
  assert.equal(result.coverage.matched, 5);
  assert.equal(result.containsPii, false);
});

test("não transforma amostra baixa em evidência suficiente", () => {
  const result = evidence({
    leads: [
      {
        id: "lead-1",
        development_id: "project-a",
        assigned_to: "broker-a",
        created_at: at(0),
      },
    ],
    assignments: [
      {
        development_id: "project-a",
        lead_id: "lead-1",
        assigned_to: "broker-a",
        created_at: at(15),
      },
    ],
  });

  assert.equal(result.overall.status, "insufficient_sample");
  assert.equal(result.overall.sampleSize, 1);
});

test("expõe concentração histórica e desvio da carga ponderada sem alegar justiça", () => {
  const result = evidence({
    leads: [
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `a-${index}`,
        development_id: "project-a",
        assigned_to: "broker-a",
        created_at: at(0),
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `b-${index}`,
        development_id: "project-a",
        assigned_to: "broker-b",
        created_at: at(0),
      })),
    ],
    assignments: [
      ...Array.from({ length: 3 }, (_, index) => ({
        development_id: "project-a",
        lead_id: `a-${index}`,
        assigned_to: "broker-a",
        created_at: at(10 + index),
      })),
      {
        development_id: "project-a",
        lead_id: "b-0",
        assigned_to: "broker-b",
        created_at: at(20),
      },
    ],
    queue: [
      {
        development_id: "project-a",
        profile_id: "broker-a",
        enabled: true,
        weight: 1,
      },
      {
        development_id: "project-a",
        profile_id: "broker-b",
        enabled: true,
        weight: 2,
      },
    ],
  });
  const project = result.byProject[0];

  assert.equal(project.concentrationPercent, 75);
  assert.equal(project.currentWeightedLoadGap, 2);
  assert.match(result.limitations.join(" "), /não comprova justiça/i);
});

test("ignora evento sem lead compatível e intervalo temporal negativo", () => {
  const result = evidence({
    leads: [
      {
        id: "lead-future",
        development_id: "project-a",
        assigned_to: "broker-a",
        created_at: at(20),
      },
    ],
    assignments: [
      {
        development_id: "project-a",
        lead_id: "missing",
        assigned_to: "broker-a",
        created_at: at(10),
      },
      {
        development_id: "project-a",
        lead_id: "lead-future",
        assigned_to: "broker-a",
        created_at: at(10),
      },
    ],
  });

  assert.equal(result.overall.status, "unavailable");
  assert.deepEqual(result.coverage, { matched: 0, observed: 2 });
});

test("API e interface mantêm contrato por organização e linguagem prudente", () => {
  const api = readFileSync("app/api/v1/crm/distribution/route.ts", "utf8");
  const page = readFileSync("app/(crm)/distribution/page.tsx", "utf8");

  assert.match(api, /buildDistributionEvidence/);
  assert.match(api, /\.eq\("organization_id", organizationId\)/);
  assert.match(page, /data-phase="364-distribution-evidence"/);
  assert.match(page, /AMOSTRA BAIXA/);
  assert.match(page, /não comprova justiça da decisão/i);
  assert.doesNotMatch(page, /justiça comprovada/i);
});
