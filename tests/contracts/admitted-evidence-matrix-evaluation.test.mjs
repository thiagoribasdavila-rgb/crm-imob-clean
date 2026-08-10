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
import { createAdmittedEvidenceMatrixEvaluationPolicy, evaluateAdmittedEvidenceMatrix, inspectAdmittedEvidenceMatrixEvaluationPolicy, inspectAdmittedEvidenceMatrixEvaluationResult } from "../../lib/release/admitted-evidence-matrix-evaluation.mjs";

function fixture({ complete = false } = {}) {
  const memory = createModuleCompletionMemory([{ moduleId: "conversion-core", moduleName: "Conversion Core", canonicalOwner: "conversion-core", revision: 1, completionLevel: "locally_verified", outcome: "captura governada", sourcePaths: ["lib/conversion-core.mjs"], evidencePaths: ["tests/conversion-core.test.mjs"], checks: { contracts: true, typecheck: true, lint: true, secretScan: true }, releaseGates: { runtimeHomologated: false, cleanBuildVerified: false, rollbackReady: false, directorApproved: false } }]);
  const entry = memory.entries[0];
  const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration: createModuleDependencyGraphConfiguration({ sourceMemoryHash: memory.memoryHash, modules: [{ moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash, dependencies: [] }] }) });
  const decision = evaluateReleaseCompositionEligibility({ graph, plan: createReleaseCompositionPlan({ compositionId: "conversion-core-candidate", sourceGraphHash: graph.graphHash, roots: [{ moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash }] }) });
  const plan = createReleaseGateEvidencePlan({ decision });
  const intakePolicy = createReleaseEvidenceIntakePolicy({ decision, plan });
  const requirements = complete
    ? plan.modules[0].gates.flatMap((gate) => gate.requiredEvidence.map((evidenceType) => ({ gate, evidenceType })))
    : [{ gate: plan.modules[0].gates[0], evidenceType: plan.modules[0].gates[0].requiredEvidence[0] }];
  const records = requirements.map(({ gate, evidenceType }, index) => createReleaseGateEvidenceRecord({ evidenceId: `proof-${index + 1}`, moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash, compositionDecisionHash: decision.decisionHash, gate: gate.gate, evidenceType, ownerRole: RELEASE_GATE_REQUIREMENTS[gate.gate].ownerRole, environment: gate.gate === "directorApproved" ? "governance" : "isolated", result: "passed", observedAt: "2026-08-08T10:00:00.000Z", validUntil: "2026-08-09T10:00:00.000Z", artifacts: [`evidence/${gate.gate}/${evidenceType}.json`], artifactHash: `${index + 1}`.repeat(64).slice(0, 64) }));
  const roles = [...new Set(records.map((record) => record.ownerRole))];
  const keyPairs = Object.fromEntries(roles.map((role) => [role, generateKeyPairSync("ed25519")]));
  const signers = roles.map((role) => ({ keyId: `${role.replaceAll("_", "-")}-key`, actorId: `${role.replaceAll("_", "-")}-actor`, role, channels: ["isolated_handoff"], publicKeyPem: keyPairs[role].publicKey.export({ type: "spki", format: "pem" }).toString(), validFrom: "2026-08-08T00:00:00.000Z", validUntil: "2026-08-10T00:00:00.000Z", status: "active" }));
  const provenancePolicy = createReleaseEvidenceProvenancePolicy({ decision, plan, intakePolicy, trustedSigners: signers, maxSignatureAgeSeconds: 900 });
  const admissionPolicy = createReleaseEvidenceAdmissionPolicy({ decision, plan, intakePolicy, provenancePolicy });
  const admissions = roles.map((role, index) => {
    const signer = signers.find((item) => item.role === role);
    const intake = createReleaseEvidenceIntake({ decision, plan, policy: intakePolicy, intakeId: `intake-${role.replaceAll("_", "-")}`, submitter: { actorId: signer.actorId, role }, channel: "isolated_handoff", submittedAt: "2026-08-08T10:05:00.000Z", records: records.filter((record) => record.ownerRole === role) });
    const intakeResult = processReleaseEvidenceIntake({ decision, plan, policy: intakePolicy, intake, receivedAt: "2026-08-08T10:06:00.000Z" });
    const envelope = createReleaseEvidenceProvenanceEnvelope({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, keyId: signer.keyId, signedAt: "2026-08-08T10:07:00.000Z", nonce: `evaluate-${index + 1}`, privateKey: keyPairs[role].privateKey });
    const provenanceResult = verifyReleaseEvidenceProvenance({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, envelope, verifiedAt: "2026-08-08T10:08:00.000Z" });
    const admissionResult = admitReleaseEvidenceToMatrix({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy, intake, intakeResult, envelope, provenanceResult, admittedAt: "2026-08-08T10:09:00.000Z" });
    return { intake, intakeResult, envelope, provenanceResult, admissionResult };
  });
  const evaluationPolicy = createAdmittedEvidenceMatrixEvaluationPolicy({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy });
  return { decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy, admissions };
}

test("política canônica avalia só recibos admitidos sem promoção automática", () => {
  const value = fixture();
  assert.equal(inspectAdmittedEvidenceMatrixEvaluationPolicy(value.evaluationPolicy, value).ok, true);
  assert.equal(value.evaluationPolicy.evaluateAdmittedRecordsOnly, true);
  assert.equal(value.evaluationPolicy.automaticGateExecution, false);
  assert.equal(value.evaluationPolicy.automaticReleasePromotion, false);
});

test("cobertura parcial é avaliada sem executar gates ou atualizar memória", () => {
  const value = fixture();
  const result = evaluateAdmittedEvidenceMatrix({ ...value, evaluatedAt: "2026-08-08T10:10:00.000Z" });
  assert.equal(result.status, "matrix_evaluated_incomplete");
  assert.equal(result.recordsEvaluated, 1);
  assert.equal(result.evidenceMatrixEvaluated, true);
  assert.equal(result.evidenceCoverageComplete, false);
  assert.ok(result.matrixSummary.missingEvidenceItems > 0);
  for (const key of ["gatesExecuted", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) assert.equal(result[key], false);
  assert.equal(inspectAdmittedEvidenceMatrixEvaluationResult(result, value).ok, true);
});

test("cobertura completa continua sem gerar pacote ou promover release", () => {
  const value = fixture({ complete: true });
  const result = evaluateAdmittedEvidenceMatrix({ ...value, evaluatedAt: "2026-08-08T10:10:00.000Z" });
  assert.equal(result.status, "matrix_evaluated_complete");
  assert.equal(result.evidenceCoverageComplete, true);
  assert.equal(result.matrixSummary.allEvidenceSatisfied, true);
  assert.equal(result.packageGenerated, false);
  assert.equal(result.releasePromoted, false);
});

test("resultado de admissão adulterado falha fechado", () => {
  const value = fixture();
  const admissions = structuredClone(value.admissions);
  admissions[0].admissionResult.recordsAdmitted = 99;
  const result = evaluateAdmittedEvidenceMatrix({ ...value, admissions, evaluatedAt: "2026-08-08T10:10:00.000Z" });
  assert.equal(result.status, "rejected");
  assert.equal(result.evidenceMatrixEvaluated, false);
  assert.ok(result.rejectionReasons.some((reason) => reason.startsWith("admission_invalid:")));
});

test("intake adulterado não fornece evidência à matriz", () => {
  const value = fixture();
  const admissions = structuredClone(value.admissions);
  admissions[0].intake.intakeId = "forged-intake";
  const result = evaluateAdmittedEvidenceMatrix({ ...value, admissions, evaluatedAt: "2026-08-08T10:10:00.000Z" });
  assert.equal(result.status, "rejected");
  assert.equal(result.recordsEvaluated, 0);
  assert.equal(result.matrixHash, null);
});

test("janela vencida e avaliação anterior à admissão são bloqueadas", () => {
  const value = fixture();
  const early = evaluateAdmittedEvidenceMatrix({ ...value, evaluatedAt: "2026-08-08T10:08:59.999Z" });
  assert.ok(early.rejectionReasons.includes("evaluation_before_admission:0"));
  const late = evaluateAdmittedEvidenceMatrix({ ...value, evaluatedAt: "2026-08-08T10:19:00.001Z" });
  assert.ok(late.rejectionReasons.includes("evaluation_window_expired:0"));
});

test("resultado da avaliação adulterado não revalida", () => {
  const value = fixture();
  const result = evaluateAdmittedEvidenceMatrix({ ...value, evaluatedAt: "2026-08-08T10:10:00.000Z" });
  assert.equal(inspectAdmittedEvidenceMatrixEvaluationResult({ ...result, packageGenerated: true }, value).ok, false);
});
