import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { createModuleCompletionMemory } from "../../lib/release/module-completion-memory.mjs";
import { buildModuleDependencyGraph, createModuleDependencyGraphConfiguration } from "../../lib/release/module-dependency-graph.mjs";
import { createReleaseCompositionPlan, evaluateReleaseCompositionEligibility } from "../../lib/release/release-composition-eligibility.mjs";
import { createReleaseGateEvidencePlan, createReleaseGateEvidenceRecord } from "../../lib/release/release-gate-evidence-matrix.mjs";
import { createReleaseEvidenceIntake, createReleaseEvidenceIntakePolicy, processReleaseEvidenceIntake } from "../../lib/release/release-evidence-intake.mjs";
import { createReleaseEvidenceProvenanceEnvelope, createReleaseEvidenceProvenancePolicy, inspectReleaseEvidenceProvenanceEnvelope, inspectReleaseEvidenceProvenancePolicy, verifyReleaseEvidenceProvenance } from "../../lib/release/release-evidence-provenance.mjs";

function fixture(overrides = {}) {
  const memory = createModuleCompletionMemory([{ moduleId: "conversion-core", moduleName: "Conversion Core", canonicalOwner: "conversion-core", revision: 1, completionLevel: "locally_verified", outcome: "captura governada", sourcePaths: ["lib/conversion-core.mjs"], evidencePaths: ["tests/conversion-core.test.mjs"], checks: { contracts: true, typecheck: true, lint: true, secretScan: true }, releaseGates: { runtimeHomologated: false, cleanBuildVerified: false, rollbackReady: false, directorApproved: false } }]);
  const entry = memory.entries[0];
  const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration: createModuleDependencyGraphConfiguration({ sourceMemoryHash: memory.memoryHash, modules: [{ moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash, dependencies: [] }] }) });
  const decision = evaluateReleaseCompositionEligibility({ graph, plan: createReleaseCompositionPlan({ compositionId: "conversion-core-candidate", sourceGraphHash: graph.graphHash, roots: [{ moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash }] }) });
  const plan = createReleaseGateEvidencePlan({ decision });
  const intakePolicy = createReleaseEvidenceIntakePolicy({ decision, plan });
  const record = createReleaseGateEvidenceRecord({ evidenceId: "qa-runtime-proof", moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash, compositionDecisionHash: decision.decisionHash, gate: "runtimeHomologated", evidenceType: "authenticated_role_flow_receipt", ownerRole: "quality_assurance", environment: "isolated", result: "passed", observedAt: "2026-08-08T10:00:00.000Z", validUntil: "2026-08-09T10:00:00.000Z", artifacts: ["evidence/runtime/proof.json"], artifactHash: "a".repeat(64) });
  const intake = createReleaseEvidenceIntake({ decision, plan, policy: intakePolicy, intakeId: "qa-intake-one", submitter: { actorId: "qa-lead", role: "quality_assurance" }, channel: "isolated_handoff", submittedAt: "2026-08-08T10:05:00.000Z", records: [record] });
  const intakeResult = processReleaseEvidenceIntake({ decision, plan, policy: intakePolicy, intake, receivedAt: "2026-08-08T10:06:00.000Z" });
  const keys = generateKeyPairSync("ed25519");
  const signer = { keyId: "qa-key-one", actorId: "qa-lead", role: "quality_assurance", channels: ["isolated_handoff"], publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(), validFrom: "2026-08-08T00:00:00.000Z", validUntil: "2026-08-10T00:00:00.000Z", status: "active", ...overrides.signer };
  const provenancePolicy = createReleaseEvidenceProvenancePolicy({ decision, plan, intakePolicy, trustedSigners: [signer], maxSignatureAgeSeconds: 900 });
  const envelope = createReleaseEvidenceProvenanceEnvelope({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, keyId: signer.keyId, signedAt: "2026-08-08T10:07:00.000Z", nonce: "proof-once", privateKey: keys.privateKey });
  return { decision, plan, intakePolicy, intake, intakeResult, keys, signer, provenancePolicy, envelope };
}

test("política canônica aceita somente chaves Ed25519 públicas e únicas", () => {
  const value = fixture();
  assert.equal(inspectReleaseEvidenceProvenancePolicy(value.provenancePolicy, value).ok, true);
  assert.equal(value.provenancePolicy.signatureAlgorithm, "ed25519");
  assert.equal(value.provenancePolicy.automaticEvidenceMatrixAdmission, false);
  assert.throws(() => createReleaseEvidenceProvenancePolicy({ ...value, trustedSigners: [value.signer, value.signer] }), /duplicate_signer_key_id/);
});

test("assinatura válida comprova procedência sem promover matriz ou release", () => {
  const value = fixture();
  const result = verifyReleaseEvidenceProvenance({ ...value, verifiedAt: "2026-08-08T10:08:00.000Z" });
  assert.equal(result.status, "provenance_verified");
  assert.equal(result.provenanceVerified, true);
  assert.equal(result.recordsBoundToSignature, 1);
  for (const key of ["eligibleForEvidenceMatrix", "evidenceMatrixEvaluated", "gatesExecuted", "releaseMemoryUpdated", "packageGenerated", "deployExecuted"]) assert.equal(result[key], false);
});

test("alteração no manifesto ou no recibo invalida o envelope", () => {
  const value = fixture();
  assert.equal(inspectReleaseEvidenceProvenanceEnvelope({ ...value.envelope, recordManifest: [] }, value).ok, false);
  assert.equal(inspectReleaseEvidenceProvenanceEnvelope({ ...value.envelope, intakeHash: "b".repeat(64) }, value).ok, false);
});

test("bloqueia assinatura produzida por chave privada diferente", () => {
  const value = fixture();
  const other = generateKeyPairSync("ed25519");
  assert.throws(() => createReleaseEvidenceProvenanceEnvelope({ ...value, keyId: value.signer.keyId, signedAt: "2026-08-08T10:07:00.000Z", nonce: "wrong-key", privateKey: other.privateKey }), /private_key_does_not_match_trusted_signer/);
});

test("bloqueia replay de envelope e nonce", () => {
  const value = fixture();
  const result = verifyReleaseEvidenceProvenance({ ...value, verifiedAt: "2026-08-08T10:08:00.000Z", seenEnvelopeHashes: [value.envelope.envelopeHash], seenNonces: [value.envelope.nonce] });
  assert.deepEqual(result.rejectionReasons, ["envelope_replay_detected", "nonce_replay_detected"]);
  assert.equal(result.provenanceVerified, false);
});

test("bloqueia identidade, papel ou canal que não coincidem com o intake", () => {
  for (const signer of [{ actorId: "other-actor" }, { role: "director" }, { channels: ["ci_artifact"] }]) {
    const value = fixture({ signer });
    const result = verifyReleaseEvidenceProvenance({ ...value, verifiedAt: "2026-08-08T10:08:00.000Z" });
    assert.equal(result.status, "quarantined");
    assert.ok(result.rejectionReasons.some((reason) => reason.startsWith("signer_")));
  }
});

test("bloqueia chave fora da validade, assinatura futura e assinatura expirada", () => {
  const outside = fixture({ signer: { validFrom: "2026-08-08T10:07:30.000Z" } });
  assert.ok(verifyReleaseEvidenceProvenance({ ...outside, verifiedAt: "2026-08-08T10:08:00.000Z" }).rejectionReasons.includes("signer_key_outside_validity"));
  const value = fixture();
  const expired = verifyReleaseEvidenceProvenance({ ...value, verifiedAt: "2026-08-08T10:30:00.000Z" });
  assert.ok(expired.rejectionReasons.includes("signature_expired"));
});
