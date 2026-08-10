import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { createModuleCompletionMemory } from "../../lib/release/module-completion-memory.mjs";
import { buildModuleDependencyGraph, createModuleDependencyGraphConfiguration } from "../../lib/release/module-dependency-graph.mjs";
import { createReleaseCompositionPlan, evaluateReleaseCompositionEligibility } from "../../lib/release/release-composition-eligibility.mjs";
import { createReleaseGateEvidencePlan, createReleaseGateEvidenceRecord } from "../../lib/release/release-gate-evidence-matrix.mjs";
import { createReleaseEvidenceIntake, createReleaseEvidenceIntakePolicy, processReleaseEvidenceIntake } from "../../lib/release/release-evidence-intake.mjs";
import { createReleaseEvidenceProvenanceEnvelope, createReleaseEvidenceProvenancePolicy, verifyReleaseEvidenceProvenance } from "../../lib/release/release-evidence-provenance.mjs";
import { admitReleaseEvidenceToMatrix, createReleaseEvidenceAdmissionPolicy, extractAdmittedEvidenceRecords, inspectReleaseEvidenceAdmissionPolicy, inspectReleaseEvidenceAdmissionResult } from "../../lib/release/release-evidence-admission.mjs";

function fixture({ validUntil = "2026-08-09T10:00:00.000Z", admittedAt = "2026-08-08T10:09:00.000Z" } = {}) {
  const memory = createModuleCompletionMemory([{ moduleId: "conversion-core", moduleName: "Conversion Core", canonicalOwner: "conversion-core", revision: 1, completionLevel: "locally_verified", outcome: "captura governada", sourcePaths: ["lib/conversion-core.mjs"], evidencePaths: ["tests/conversion-core.test.mjs"], checks: { contracts: true, typecheck: true, lint: true, secretScan: true }, releaseGates: { runtimeHomologated: false, cleanBuildVerified: false, rollbackReady: false, directorApproved: false } }]);
  const entry = memory.entries[0];
  const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration: createModuleDependencyGraphConfiguration({ sourceMemoryHash: memory.memoryHash, modules: [{ moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash, dependencies: [] }] }) });
  const decision = evaluateReleaseCompositionEligibility({ graph, plan: createReleaseCompositionPlan({ compositionId: "conversion-core-candidate", sourceGraphHash: graph.graphHash, roots: [{ moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash }] }) });
  const plan = createReleaseGateEvidencePlan({ decision });
  const intakePolicy = createReleaseEvidenceIntakePolicy({ decision, plan });
  const record = createReleaseGateEvidenceRecord({ evidenceId: "qa-runtime-proof", moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash, compositionDecisionHash: decision.decisionHash, gate: "runtimeHomologated", evidenceType: "authenticated_role_flow_receipt", ownerRole: "quality_assurance", environment: "isolated", result: "passed", observedAt: "2026-08-08T10:00:00.000Z", validUntil, artifacts: ["evidence/runtime/proof.json"], artifactHash: "a".repeat(64) });
  const intake = createReleaseEvidenceIntake({ decision, plan, policy: intakePolicy, intakeId: "qa-intake-one", submitter: { actorId: "qa-lead", role: "quality_assurance" }, channel: "isolated_handoff", submittedAt: "2026-08-08T10:05:00.000Z", records: [record] });
  const intakeResult = processReleaseEvidenceIntake({ decision, plan, policy: intakePolicy, intake, receivedAt: "2026-08-08T10:06:00.000Z" });
  const keys = generateKeyPairSync("ed25519");
  const signer = { keyId: "qa-key-one", actorId: "qa-lead", role: "quality_assurance", channels: ["isolated_handoff"], publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(), validFrom: "2026-08-08T00:00:00.000Z", validUntil: "2026-08-10T00:00:00.000Z", status: "active" };
  const provenancePolicy = createReleaseEvidenceProvenancePolicy({ decision, plan, intakePolicy, trustedSigners: [signer], maxSignatureAgeSeconds: 900 });
  const envelope = createReleaseEvidenceProvenanceEnvelope({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, keyId: signer.keyId, signedAt: "2026-08-08T10:07:00.000Z", nonce: "proof-once", privateKey: keys.privateKey });
  const provenanceResult = verifyReleaseEvidenceProvenance({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, envelope, verifiedAt: "2026-08-08T10:08:00.000Z" });
  const admissionPolicy = createReleaseEvidenceAdmissionPolicy({ decision, plan, intakePolicy, provenancePolicy });
  const context = { decision, plan, intakePolicy, provenancePolicy, admissionPolicy, intake, intakeResult, envelope, provenanceResult };
  return { ...context, admittedAt };
}

test("política de admissão é canônica, atômica e não executa a matriz", () => {
  const value = fixture();
  assert.equal(inspectReleaseEvidenceAdmissionPolicy(value.admissionPolicy, value).ok, true);
  assert.equal(value.admissionPolicy.atomicAdmission, true);
  assert.equal(value.admissionPolicy.automaticEvidenceMatrixEvaluation, false);
  assert.equal(value.admissionPolicy.automaticGateExecution, false);
  assert.equal(value.admissionPolicy.automaticReleasePromotion, false);
});

test("somente procedência verificada torna os recibos elegíveis para a matriz", () => {
  const value = fixture();
  const result = admitReleaseEvidenceToMatrix(value);
  assert.equal(result.status, "admitted_to_evidence_matrix");
  assert.equal(result.provenanceVerified, true);
  assert.equal(result.eligibleForEvidenceMatrix, true);
  assert.equal(result.recordsAdmitted, 1);
  for (const key of ["evidenceMatrixEvaluated", "gatesExecuted", "releaseMemoryUpdated", "packageGenerated", "deployExecuted"]) assert.equal(result[key], false);
  assert.deepEqual(extractAdmittedEvidenceRecords(result, value.intake), value.intake.records);
  assert.equal(inspectReleaseEvidenceAdmissionResult(result, value).ok, true);
});

test("resultado de procedência adulterado é colocado em quarentena", () => {
  const value = fixture();
  const result = admitReleaseEvidenceToMatrix({ ...value, provenanceResult: { ...value.provenanceResult, signerKeyId: "forged-key" } });
  assert.equal(result.status, "quarantined");
  assert.ok(result.rejectionReasons.includes("provenance_result_invalid_or_tampered"));
});

test("resultado com data inválida falha fechado sem interromper o processo", () => {
  const value = fixture();
  const result = admitReleaseEvidenceToMatrix({ ...value, provenanceResult: { ...value.provenanceResult, verifiedAt: "not-a-date" } });
  assert.equal(result.status, "quarantined");
  assert.ok(result.rejectionReasons.includes("provenance_result_reverification_failed"));
});

test("bloqueia replay de intake, evidence id e hash do registro", () => {
  const value = fixture();
  const result = admitReleaseEvidenceToMatrix({ ...value, seenIntakeHashes: [value.intake.intakeHash], seenEvidenceIds: [value.intake.records[0].evidenceId], seenRecordHashes: [value.intake.records[0].recordHash] });
  assert.equal(result.recordsAdmitted, 0);
  assert.deepEqual(result.rejectionReasons, ["evidence_id_already_admitted", "intake_already_admitted", "record_hash_already_admitted"]);
});

test("bloqueia evidência expirada e janela de admissão vencida", () => {
  const expiredEvidence = fixture({ validUntil: "2026-08-08T10:08:30.000Z" });
  assert.ok(admitReleaseEvidenceToMatrix(expiredEvidence).rejectionReasons.includes("record_expired:qa-runtime-proof"));
  const delayed = fixture({ admittedAt: "2026-08-08T10:19:00.001Z" });
  assert.ok(admitReleaseEvidenceToMatrix(delayed).rejectionReasons.includes("admission_window_expired"));
});

test("bloqueia admissão anterior à verificação e política adulterada", () => {
  const value = fixture({ admittedAt: "2026-08-08T10:07:59.999Z" });
  assert.ok(admitReleaseEvidenceToMatrix(value).rejectionReasons.includes("admission_before_provenance_verification"));
  const tampered = { ...value.admissionPolicy, maxRecordsPerAdmission: 49 };
  const result = admitReleaseEvidenceToMatrix({ ...value, admittedAt: "2026-08-08T10:09:00.000Z", admissionPolicy: tampered });
  assert.equal(result.status, "quarantined");
  assert.ok(result.rejectionReasons.some((reason) => reason.startsWith("admission_policy_invalid:")));
});

test("extração rejeita resultado de admissão ou manifesto adulterado", () => {
  const value = fixture();
  const result = admitReleaseEvidenceToMatrix(value);
  assert.deepEqual(extractAdmittedEvidenceRecords({ ...result, resultHash: "b".repeat(64) }, value.intake), []);
  assert.deepEqual(extractAdmittedEvidenceRecords({ ...result, admittedRecordManifest: [] }, value.intake), []);
});
