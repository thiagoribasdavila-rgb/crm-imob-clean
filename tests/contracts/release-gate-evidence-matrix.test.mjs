import assert from "node:assert/strict";
import test from "node:test";
import { createModuleCompletionMemory } from "../../lib/release/module-completion-memory.mjs";
import { buildModuleDependencyGraph, createModuleDependencyGraphConfiguration } from "../../lib/release/module-dependency-graph.mjs";
import { createReleaseCompositionPlan, evaluateReleaseCompositionEligibility } from "../../lib/release/release-composition-eligibility.mjs";
import { createReleaseGateEvidencePlan, createReleaseGateEvidenceRecord, evaluateReleaseGateEvidenceMatrix, inspectReleaseGateEvidencePlan, inspectReleaseGateEvidenceRecord, RELEASE_GATE_REQUIREMENTS } from "../../lib/release/release-gate-evidence-matrix.mjs";

function entry(moduleId) {
  return {
    moduleId, moduleName: moduleId, canonicalOwner: "conversion-core", revision: 1,
    completionLevel: "locally_verified", outcome: "resultado verificável",
    sourcePaths: [`lib/${moduleId}.mjs`], evidencePaths: [`tests/${moduleId}.test.mjs`],
    checks: { contracts: true, typecheck: true, lint: true, secretScan: true },
    releaseGates: { runtimeHomologated: false, cleanBuildVerified: false, rollbackReady: false, directorApproved: false },
  };
}

function fixture() {
  const memory = createModuleCompletionMemory([entry("foundation"), entry("readiness")]);
  const [foundation, readiness] = memory.entries;
  const configuration = createModuleDependencyGraphConfiguration({
    sourceMemoryHash: memory.memoryHash,
    modules: [
      { moduleId: foundation.moduleId, revision: 1, entryHash: foundation.entryHash, dependencies: [] },
      { moduleId: readiness.moduleId, revision: 1, entryHash: readiness.entryHash, dependencies: [{ moduleId: foundation.moduleId, revision: 1, entryHash: foundation.entryHash }] },
    ],
  });
  const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration });
  const compositionPlan = createReleaseCompositionPlan({
    compositionId: "conversion-core-candidate", sourceGraphHash: graph.graphHash,
    roots: [{ moduleId: readiness.moduleId, revision: 1, entryHash: readiness.entryHash }],
  });
  const decision = evaluateReleaseCompositionEligibility({ graph, plan: compositionPlan });
  const evidencePlan = createReleaseGateEvidencePlan({ decision });
  return { decision, evidencePlan };
}

function recordsFor({ decision, evidencePlan }) {
  let sequence = 0;
  return evidencePlan.modules.flatMap((module) => module.gates.flatMap((gate) => gate.requiredEvidence.map((evidenceType) => createReleaseGateEvidenceRecord({
    evidenceId: `proof-${++sequence}`,
    moduleId: module.moduleId,
    revision: module.revision,
    entryHash: module.entryHash,
    compositionDecisionHash: decision.decisionHash,
    gate: gate.gate,
    evidenceType,
    ownerRole: RELEASE_GATE_REQUIREMENTS[gate.gate].ownerRole,
    environment: gate.gate === "directorApproved" ? "governance" : "isolated",
    result: "passed",
    observedAt: "2026-08-08T10:00:00.000Z",
    validUntil: "2026-08-09T10:00:00.000Z",
    artifacts: [`evidence/${module.moduleId}/${gate.gate}/${evidenceType}.json`],
    artifactHash: "a".repeat(64),
  }))));
}

test("plano exige 8 gates e 14 provas para dois módulos", () => {
  const { evidencePlan } = fixture();
  assert.equal(inspectReleaseGateEvidencePlan(evidencePlan).ok, true);
  assert.equal(evidencePlan.modules.length, 2);
  assert.equal(evidencePlan.modules.flatMap((module) => module.gates).length, 8);
  assert.equal(evidencePlan.modules.flatMap((module) => module.gates).flatMap((gate) => gate.requiredEvidence).length, 14);
});

test("sem evidências mantém todos os gates bloqueados", () => {
  const fixtureValue = fixture();
  const matrix = evaluateReleaseGateEvidenceMatrix({ ...fixtureValue, plan: fixtureValue.evidencePlan, records: [], evaluatedAt: "2026-08-08T12:00:00.000Z" });
  assert.equal(matrix.summary.satisfiedGates, 0);
  assert.equal(matrix.summary.missingEvidenceItems, 14);
  assert.equal(matrix.summary.allEvidenceSatisfied, false);
  assert.equal(matrix.summary.packageGenerated, false);
});

test("provas completas só habilitam decisão posterior controlada", () => {
  const fixtureValue = fixture();
  const matrix = evaluateReleaseGateEvidenceMatrix({ ...fixtureValue, plan: fixtureValue.evidencePlan, records: recordsFor(fixtureValue), evaluatedAt: "2026-08-08T12:00:00.000Z" });
  assert.equal(matrix.summary.satisfiedGates, 8);
  assert.equal(matrix.summary.missingEvidenceItems, 0);
  assert.equal(matrix.summary.allEvidenceSatisfied, true);
  assert.equal(matrix.summary.releaseMemoryUpdated, false);
  assert.equal(matrix.summary.packageGenerated, false);
});

test("prova expirada ou vinculada a outra decisão não é aceita", () => {
  const fixtureValue = fixture();
  const records = recordsFor(fixtureValue);
  const expired = createReleaseGateEvidenceRecord({ ...records[0], evidenceId: "expired-proof", validUntil: "2026-08-08T11:00:00.000Z" });
  const wrongDecision = createReleaseGateEvidenceRecord({ ...records[1], evidenceId: "wrong-decision-proof", compositionDecisionHash: "b".repeat(64) });
  const matrix = evaluateReleaseGateEvidenceMatrix({ ...fixtureValue, plan: fixtureValue.evidencePlan, records: [expired, wrongDecision], evaluatedAt: "2026-08-08T12:00:00.000Z" });
  assert.equal(matrix.summary.invalidEvidenceItems, 2);
  assert.equal(matrix.summary.allEvidenceSatisfied, false);
});

test("recusa plano e registro adulterados", () => {
  const fixtureValue = fixture();
  const plan = structuredClone(fixtureValue.evidencePlan);
  plan.modules[0].gates[0].ownerRole = "director";
  assert.equal(inspectReleaseGateEvidencePlan(plan).ok, false);
  const record = recordsFor(fixtureValue)[0];
  const changed = { ...record, artifactHash: "c".repeat(64) };
  assert.equal(inspectReleaseGateEvidenceRecord(changed).ok, false);
});
