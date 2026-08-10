import assert from "node:assert/strict";
import test from "node:test";
import { createModuleCompletionMemory } from "../../lib/release/module-completion-memory.mjs";
import { buildModuleDependencyGraph, createModuleDependencyGraphConfiguration } from "../../lib/release/module-dependency-graph.mjs";
import { createReleaseCompositionPlan, evaluateReleaseCompositionEligibility } from "../../lib/release/release-composition-eligibility.mjs";
import { createReleaseGateEvidencePlan, createReleaseGateEvidenceRecord } from "../../lib/release/release-gate-evidence-matrix.mjs";
import { createReleaseEvidenceIntake, createReleaseEvidenceIntakePolicy, inspectReleaseEvidenceIntake, inspectReleaseEvidenceIntakePolicy, processReleaseEvidenceIntake } from "../../lib/release/release-evidence-intake.mjs";

function fixture() {
  const memory = createModuleCompletionMemory([{
    moduleId: "conversion-core", moduleName: "Conversion Core", canonicalOwner: "conversion-core", revision: 1,
    completionLevel: "locally_verified", outcome: "captura governada", sourcePaths: ["lib/conversion-core.mjs"],
    evidencePaths: ["tests/conversion-core.test.mjs"], checks: { contracts: true, typecheck: true, lint: true, secretScan: true },
    releaseGates: { runtimeHomologated: false, cleanBuildVerified: false, rollbackReady: false, directorApproved: false },
  }]);
  const moduleEntry = memory.entries[0];
  const configuration = createModuleDependencyGraphConfiguration({ sourceMemoryHash: memory.memoryHash, modules: [{ moduleId: moduleEntry.moduleId, revision: 1, entryHash: moduleEntry.entryHash, dependencies: [] }] });
  const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration });
  const compositionPlan = createReleaseCompositionPlan({ compositionId: "conversion-core-candidate", sourceGraphHash: graph.graphHash, roots: [{ moduleId: moduleEntry.moduleId, revision: 1, entryHash: moduleEntry.entryHash }] });
  const decision = evaluateReleaseCompositionEligibility({ graph, plan: compositionPlan });
  const plan = createReleaseGateEvidencePlan({ decision });
  const policy = createReleaseEvidenceIntakePolicy({ decision, plan });
  const record = createReleaseGateEvidenceRecord({
    evidenceId: "qa-runtime-proof", moduleId: moduleEntry.moduleId, revision: 1, entryHash: moduleEntry.entryHash,
    compositionDecisionHash: decision.decisionHash, gate: "runtimeHomologated", evidenceType: "authenticated_role_flow_receipt",
    ownerRole: "quality_assurance", environment: "isolated", result: "passed", observedAt: "2026-08-08T10:00:00.000Z",
    validUntil: "2026-08-09T10:00:00.000Z", artifacts: ["evidence/runtime/authenticated-role-flow.json"], artifactHash: "a".repeat(64),
  });
  const intake = createReleaseEvidenceIntake({ decision, plan, policy, intakeId: "qa-intake-one", submitter: { actorId: "qa-lead", role: "quality_assurance" }, channel: "isolated_handoff", submittedAt: "2026-08-08T10:05:00.000Z", records: [record] });
  return { decision, plan, policy, record, intake };
}

test("política fica vinculada à decisão e ao plano canônicos", () => {
  const value = fixture();
  assert.equal(inspectReleaseEvidenceIntakePolicy(value.policy, value).ok, true);
  assert.equal(value.policy.automaticGateExecution, false);
  assert.equal(value.policy.automaticReleasePromotion, false);
});

test("recibo válido entra apenas em revisão de procedência", () => {
  const value = fixture();
  assert.equal(inspectReleaseEvidenceIntake(value.intake, value).ok, true);
  const result = processReleaseEvidenceIntake({ ...value, receivedAt: "2026-08-08T10:06:00.000Z" });
  assert.equal(result.status, "accepted_for_provenance_review");
  assert.equal(result.recordsAcceptedForReview, 1);
  assert.equal(result.provenanceVerified, false);
  assert.equal(result.eligibleForEvidenceMatrix, false);
  assert.equal(result.gatesExecuted, false);
  assert.equal(result.packageGenerated, false);
});

test("bloqueia replay do lote, id de evidência ou hash do registro", () => {
  const value = fixture();
  const result = processReleaseEvidenceIntake({ ...value, receivedAt: "2026-08-08T10:06:00.000Z", seenIntakeHashes: [value.intake.intakeHash], seenEvidenceIds: [value.record.evidenceId], seenRecordHashes: [value.record.recordHash] });
  assert.equal(result.status, "quarantined");
  assert.deepEqual(result.rejectionReasons, ["evidence_id_replay_detected", "intake_replay_detected", "record_hash_replay_detected"]);
});

test("bloqueia papel diferente do proprietário da evidência", () => {
  const value = fixture();
  const intake = createReleaseEvidenceIntake({ ...value, intakeId: "director-intake", submitter: { actorId: "commercial-director", role: "director" }, channel: "governance_portal", submittedAt: "2026-08-08T10:05:00.000Z", records: [value.record] });
  const result = processReleaseEvidenceIntake({ ...value, intake, receivedAt: "2026-08-08T10:06:00.000Z" });
  assert.equal(result.status, "quarantined");
  assert.ok(result.rejectionReasons.includes("submitter_role_mismatch:qa-runtime-proof"));
});

test("bloqueia artefato absoluto, remoto ou com travessia de diretório", () => {
  const value = fixture();
  for (const [suffix, artifact] of [["absolute", "/tmp/proof.json"], ["remote", "https://example.test/proof.json"], ["traversal", "evidence/../secret.json"]]) {
    const record = createReleaseGateEvidenceRecord({ ...value.record, evidenceId: `unsafe-${suffix}`, artifacts: [artifact] });
    const intake = createReleaseEvidenceIntake({ ...value, intakeId: `unsafe-${suffix}-intake`, submitter: { actorId: "qa-lead", role: "quality_assurance" }, channel: "isolated_handoff", submittedAt: "2026-08-08T10:05:00.000Z", records: [record] });
    const result = processReleaseEvidenceIntake({ ...value, intake, receivedAt: "2026-08-08T10:06:00.000Z" });
    assert.ok(result.rejectionReasons.includes(`unsafe_artifact_reference:unsafe-${suffix}`));
  }
});

test("bloqueia validade expirada, relógio futuro e recibo adulterado", () => {
  const value = fixture();
  const expiredRecord = createReleaseGateEvidenceRecord({ ...value.record, evidenceId: "expired-proof", validUntil: "2026-08-08T10:05:30.000Z" });
  const futureIntake = createReleaseEvidenceIntake({ ...value, intakeId: "future-intake", submitter: { actorId: "qa-lead", role: "quality_assurance" }, channel: "isolated_handoff", submittedAt: "2026-08-08T11:00:00.000Z", records: [expiredRecord] });
  const result = processReleaseEvidenceIntake({ ...value, intake: futureIntake, receivedAt: "2026-08-08T10:06:00.000Z" });
  assert.ok(result.rejectionReasons.includes("record_expired:expired-proof"));
  assert.ok(result.rejectionReasons.includes("submitted_at_exceeds_clock_skew"));
  assert.equal(inspectReleaseEvidenceIntake({ ...value.intake, channel: "ci_artifact" }, value).ok, false);
});
