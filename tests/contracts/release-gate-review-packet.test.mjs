import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { createModuleCompletionMemory } from "../../lib/release/module-completion-memory.mjs";
import { buildModuleDependencyGraph, createModuleDependencyGraphConfiguration } from "../../lib/release/module-dependency-graph.mjs";
import { createReleaseCompositionPlan, evaluateReleaseCompositionEligibility } from "../../lib/release/release-composition-eligibility.mjs";
import { createReleaseGateEvidencePlan, createReleaseGateEvidenceRecord, RELEASE_GATE_REQUIREMENTS } from "../../lib/release/release-gate-evidence-matrix.mjs";
import { createReleaseEvidenceIntake, createReleaseEvidenceIntakePolicy, processReleaseEvidenceIntake } from "../../lib/release/release-evidence-intake.mjs";
import { createReleaseEvidenceProvenanceEnvelope, createReleaseEvidenceProvenancePolicy, verifyReleaseEvidenceProvenance } from "../../lib/release/release-evidence-provenance.mjs";
import { admitReleaseEvidenceToMatrix, createReleaseEvidenceAdmissionPolicy } from "../../lib/release/release-evidence-admission.mjs";
import { createAdmittedEvidenceMatrixEvaluationPolicy, evaluateAdmittedEvidenceMatrix } from "../../lib/release/admitted-evidence-matrix-evaluation.mjs";
import { createReleaseGateReviewPacketPolicy, inspectReleaseGateReviewPacket, inspectReleaseGateReviewPacketPolicy, prepareReleaseGateReviewPacket } from "../../lib/release/release-gate-review-packet.mjs";

function fixture({ complete = false, validUntil = "2026-08-09T11:00:00.000Z" } = {}) {
  const memory = createModuleCompletionMemory([{ moduleId: "conversion-core", moduleName: "Conversion Core", canonicalOwner: "conversion-core", revision: 1, completionLevel: "locally_verified", outcome: "captura governada", sourcePaths: ["lib/conversion-core.mjs"], evidencePaths: ["tests/conversion-core.test.mjs"], checks: { contracts: true, typecheck: true, lint: true, secretScan: true }, releaseGates: { runtimeHomologated: false, cleanBuildVerified: false, rollbackReady: false, directorApproved: false } }]);
  const entry = memory.entries[0];
  const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration: createModuleDependencyGraphConfiguration({ sourceMemoryHash: memory.memoryHash, modules: [{ moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash, dependencies: [] }] }) });
  const decision = evaluateReleaseCompositionEligibility({ graph, plan: createReleaseCompositionPlan({ compositionId: "conversion-core-candidate", sourceGraphHash: graph.graphHash, roots: [{ moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash }] }) });
  const plan = createReleaseGateEvidencePlan({ decision });
  const intakePolicy = createReleaseEvidenceIntakePolicy({ decision, plan });
  const requirements = complete
    ? plan.modules[0].gates.flatMap((gate) => gate.requiredEvidence.map((evidenceType) => ({ gate, evidenceType })))
    : [{ gate: plan.modules[0].gates[0], evidenceType: plan.modules[0].gates[0].requiredEvidence[0] }];
  const records = requirements.map(({ gate, evidenceType }, index) => createReleaseGateEvidenceRecord({ evidenceId: `review-proof-${index + 1}`, moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash, compositionDecisionHash: decision.decisionHash, gate: gate.gate, evidenceType, ownerRole: RELEASE_GATE_REQUIREMENTS[gate.gate].ownerRole, environment: gate.gate === "directorApproved" ? "governance" : "isolated", result: "passed", observedAt: "2026-08-09T10:00:00.000Z", validUntil, artifacts: [`evidence/${gate.gate}/${evidenceType}.json`], artifactHash: `${index + 1}`.repeat(64).slice(0, 64) }));
  const roles = [...new Set(records.map((record) => record.ownerRole))];
  const keyPairs = Object.fromEntries(roles.map((role) => [role, generateKeyPairSync("ed25519")]));
  const signers = roles.map((role) => ({ keyId: `${role.replaceAll("_", "-")}-review-key`, actorId: `${role.replaceAll("_", "-")}-review-actor`, role, channels: ["isolated_handoff"], publicKeyPem: keyPairs[role].publicKey.export({ type: "spki", format: "pem" }).toString(), validFrom: "2026-08-09T00:00:00.000Z", validUntil: "2026-08-10T00:00:00.000Z", status: "active" }));
  const provenancePolicy = createReleaseEvidenceProvenancePolicy({ decision, plan, intakePolicy, trustedSigners: signers, maxSignatureAgeSeconds: 900 });
  const admissionPolicy = createReleaseEvidenceAdmissionPolicy({ decision, plan, intakePolicy, provenancePolicy });
  const admissions = roles.map((role, index) => {
    const signer = signers.find((item) => item.role === role);
    const intake = createReleaseEvidenceIntake({ decision, plan, policy: intakePolicy, intakeId: `review-intake-${role.replaceAll("_", "-")}`, submitter: { actorId: signer.actorId, role }, channel: "isolated_handoff", submittedAt: "2026-08-09T10:05:00.000Z", records: records.filter((record) => record.ownerRole === role) });
    const intakeResult = processReleaseEvidenceIntake({ decision, plan, policy: intakePolicy, intake, receivedAt: "2026-08-09T10:06:00.000Z" });
    const envelope = createReleaseEvidenceProvenanceEnvelope({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, keyId: signer.keyId, signedAt: "2026-08-09T10:07:00.000Z", nonce: `review-${index + 1}`, privateKey: keyPairs[role].privateKey });
    const provenanceResult = verifyReleaseEvidenceProvenance({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, envelope, verifiedAt: "2026-08-09T10:08:00.000Z" });
    const admissionResult = admitReleaseEvidenceToMatrix({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy, intake, intakeResult, envelope, provenanceResult, admittedAt: "2026-08-09T10:09:00.000Z" });
    return { intake, intakeResult, envelope, provenanceResult, admissionResult };
  });
  const evaluationPolicy = createAdmittedEvidenceMatrixEvaluationPolicy({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy });
  const evaluationResult = evaluateAdmittedEvidenceMatrix({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy, admissions, evaluatedAt: "2026-08-09T10:10:00.000Z" });
  const packetPolicy = createReleaseGateReviewPacketPolicy({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy });
  return { decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy, packetPolicy, admissions, evaluationResult };
}

test("política do dossiê exige revisão humana e impede efeitos automáticos", () => {
  const value = fixture();
  assert.equal(inspectReleaseGateReviewPacketPolicy(value.packetPolicy, value).ok, true);
  assert.equal(value.packetPolicy.humanReviewRequired, true);
  assert.equal(value.packetPolicy.approvalMayNotBeInferred, true);
  for (const key of ["automaticGateExecution", "automaticApproval", "automaticReleaseMemoryUpdate", "automaticPackageGeneration", "automaticDeploy", "automaticReleasePromotion"]) assert.equal(value.packetPolicy[key], false);
});

test("cobertura incompleta gera dossiê bloqueado e rastreável", () => {
  const value = fixture();
  const packet = prepareReleaseGateReviewPacket({ ...value, preparedAt: "2026-08-09T10:11:00.000Z" });
  assert.equal(packet.status, "blocked_incomplete_evidence");
  assert.equal(packet.evidenceRevalidatedAtPreparation, true);
  assert.ok(packet.matrixSummary.missingEvidenceItems > 0);
  assert.ok(packet.modules[0].gates.some((gate) => gate.reviewStatus === "blocked_missing_evidence"));
  assert.equal(inspectReleaseGateReviewPacket(packet, value).ok, true);
});

test("cobertura completa prepara revisão sem registrar aprovação", () => {
  const value = fixture({ complete: true });
  const packet = prepareReleaseGateReviewPacket({ ...value, preparedAt: "2026-08-09T10:11:00.000Z" });
  assert.equal(packet.status, "ready_for_human_review");
  assert.equal(packet.matrixSummary.allEvidenceSatisfied, true);
  assert.deepEqual(packet.reviewerRoles, ["director", "engineering", "operations", "quality_assurance"]);
  for (const key of ["approvalRecorded", "gatesExecuted", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) assert.equal(packet[key], false);
});

test("resultado de avaliação adulterado é rejeitado", () => {
  const value = fixture({ complete: true });
  const packet = prepareReleaseGateReviewPacket({ ...value, evaluationResult: { ...value.evaluationResult, evidenceCoverageComplete: false }, preparedAt: "2026-08-09T10:11:00.000Z" });
  assert.equal(packet.status, "rejected");
  assert.ok(packet.rejectionReasons.some((reason) => reason.startsWith("evaluation_result_invalid:")));
});

test("preparação anterior ou fora da janela é rejeitada", () => {
  const value = fixture();
  const early = prepareReleaseGateReviewPacket({ ...value, preparedAt: "2026-08-09T10:09:59.999Z" });
  assert.ok(early.rejectionReasons.includes("packet_prepared_before_evaluation"));
  const late = prepareReleaseGateReviewPacket({ ...value, preparedAt: "2026-08-09T10:15:00.001Z" });
  assert.ok(late.rejectionReasons.includes("packet_preparation_window_expired"));
});

test("prova que vence após avaliação bloqueia a revisão no preparo", () => {
  const value = fixture({ complete: true, validUntil: "2026-08-09T10:10:30.000Z" });
  assert.equal(value.evaluationResult.status, "matrix_evaluated_complete");
  const packet = prepareReleaseGateReviewPacket({ ...value, preparedAt: "2026-08-09T10:11:00.000Z" });
  assert.equal(packet.status, "blocked_incomplete_evidence");
  assert.ok(packet.invalidEvidence.every((item) => item.reason === "evidence_expired"));
  assert.ok(packet.matrixSummary.missingEvidenceItems > 0);
});

test("dossiê adulterado não revalida", () => {
  const value = fixture({ complete: true });
  const packet = prepareReleaseGateReviewPacket({ ...value, preparedAt: "2026-08-09T10:11:00.000Z" });
  assert.equal(inspectReleaseGateReviewPacket({ ...packet, approvalRecorded: true }, value).ok, false);
});
