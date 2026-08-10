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
import { createReleaseGateReviewPacketPolicy, prepareReleaseGateReviewPacket } from "../../lib/release/release-gate-review-packet.mjs";
import { createHumanReleaseGateDecision, createHumanReleaseGateDecisionPolicy, recordHumanReleaseGateDecisions } from "../../lib/release/human-release-gate-decisions.mjs";
import {
  createReleaseGateExecutionAuthorization,
  createReleaseGateExecutionAuthorizationPolicy,
  inspectReleaseGateExecutionAuthorization,
  inspectReleaseGateExecutionAuthorizationPolicy,
} from "../../lib/release/release-gate-execution-authorization.mjs";

function fixture() {
  const memory = createModuleCompletionMemory([{ moduleId: "conversion-core", moduleName: "Conversion Core", canonicalOwner: "conversion-core", revision: 1, completionLevel: "locally_verified", outcome: "captura governada", sourcePaths: ["lib/conversion-core.mjs"], evidencePaths: ["tests/conversion-core.test.mjs"], checks: { contracts: true, typecheck: true, lint: true, secretScan: true }, releaseGates: { runtimeHomologated: false, cleanBuildVerified: false, rollbackReady: false, directorApproved: false } }]);
  const entry = memory.entries[0];
  const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration: createModuleDependencyGraphConfiguration({ sourceMemoryHash: memory.memoryHash, modules: [{ moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash, dependencies: [] }] }) });
  const compositionDecision = evaluateReleaseCompositionEligibility({ graph, plan: createReleaseCompositionPlan({ compositionId: "conversion-core-candidate", sourceGraphHash: graph.graphHash, roots: [{ moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash }] }) });
  const plan = createReleaseGateEvidencePlan({ decision: compositionDecision });
  const intakePolicy = createReleaseEvidenceIntakePolicy({ decision: compositionDecision, plan });
  const requirements = plan.modules[0].gates.flatMap((gate) => gate.requiredEvidence.map((evidenceType) => ({ gate, evidenceType })));
  const records = requirements.map(({ gate, evidenceType }, index) => createReleaseGateEvidenceRecord({ evidenceId: `authorization-proof-${index + 1}`, moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash, compositionDecisionHash: compositionDecision.decisionHash, gate: gate.gate, evidenceType, ownerRole: RELEASE_GATE_REQUIREMENTS[gate.gate].ownerRole, environment: gate.gate === "directorApproved" ? "governance" : "isolated", result: "passed", observedAt: "2026-08-09T10:00:00.000Z", validUntil: "2026-08-09T12:00:00.000Z", artifacts: [`evidence/${gate.gate}/${evidenceType}.json`], artifactHash: `${index + 1}`.repeat(64).slice(0, 64) }));
  const roles = [...new Set(plan.modules[0].gates.map((gate) => gate.ownerRole))];
  const reviewerKeys = Object.fromEntries(roles.map((role) => [role, generateKeyPairSync("ed25519")]));
  const signers = roles.map((role) => ({ keyId: `${role.replaceAll("_", "-")}-key`, actorId: `${role.replaceAll("_", "-")}-actor`, role, channels: ["isolated_handoff"], publicKeyPem: reviewerKeys[role].publicKey.export({ type: "spki", format: "pem" }).toString(), validFrom: "2026-08-09T00:00:00.000Z", validUntil: "2026-08-10T00:00:00.000Z", status: "active" }));
  const provenancePolicy = createReleaseEvidenceProvenancePolicy({ decision: compositionDecision, plan, intakePolicy, trustedSigners: signers, maxSignatureAgeSeconds: 900 });
  const admissionPolicy = createReleaseEvidenceAdmissionPolicy({ decision: compositionDecision, plan, intakePolicy, provenancePolicy });
  const admissions = roles.map((role, index) => {
    const signer = signers.find((item) => item.role === role);
    const intake = createReleaseEvidenceIntake({ decision: compositionDecision, plan, policy: intakePolicy, intakeId: `authorization-intake-${role.replaceAll("_", "-")}`, submitter: { actorId: signer.actorId, role }, channel: "isolated_handoff", submittedAt: "2026-08-09T10:05:00.000Z", records: records.filter((record) => record.ownerRole === role) });
    const intakeResult = processReleaseEvidenceIntake({ decision: compositionDecision, plan, policy: intakePolicy, intake, receivedAt: "2026-08-09T10:06:00.000Z" });
    const envelope = createReleaseEvidenceProvenanceEnvelope({ decision: compositionDecision, plan, intakePolicy, provenancePolicy, intake, intakeResult, keyId: signer.keyId, signedAt: "2026-08-09T10:07:00.000Z", nonce: `authorization-${index + 1}`, privateKey: reviewerKeys[role].privateKey });
    const provenanceResult = verifyReleaseEvidenceProvenance({ decision: compositionDecision, plan, intakePolicy, provenancePolicy, intake, intakeResult, envelope, verifiedAt: "2026-08-09T10:08:00.000Z" });
    const admissionResult = admitReleaseEvidenceToMatrix({ decision: compositionDecision, plan, intakePolicy, provenancePolicy, admissionPolicy, intake, intakeResult, envelope, provenanceResult, admittedAt: "2026-08-09T10:09:00.000Z" });
    return { intake, intakeResult, envelope, provenanceResult, admissionResult };
  });
  const evaluationPolicy = createAdmittedEvidenceMatrixEvaluationPolicy({ decision: compositionDecision, plan, intakePolicy, provenancePolicy, admissionPolicy });
  const evaluationResult = evaluateAdmittedEvidenceMatrix({ decision: compositionDecision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy, admissions, evaluatedAt: "2026-08-09T10:10:00.000Z" });
  const packetPolicy = createReleaseGateReviewPacketPolicy({ decision: compositionDecision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy });
  const packetContext = { decision: compositionDecision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy, packetPolicy, admissions, evaluationResult };
  const packet = prepareReleaseGateReviewPacket({ ...packetContext, preparedAt: "2026-08-09T10:11:00.000Z" });
  const decisionPolicy = createHumanReleaseGateDecisionPolicy(packetContext);
  const decisions = packet.modules[0].gates.map((gate) => {
    const signer = signers.find((item) => item.role === gate.reviewerRole);
    return createHumanReleaseGateDecision({ packet, packetContext, decisionPolicy, decisionId: `authorization-decision-${gate.gate.toLowerCase()}`, moduleId: packet.modules[0].moduleId, gate: gate.gate, keyId: signer.keyId, outcome: "approved", reason: "Evidências revisadas e aceitas explicitamente.", decidedAt: "2026-08-09T10:12:00.000Z", nonce: `authorization-decision-${gate.gate.toLowerCase()}`, privateKey: reviewerKeys[gate.reviewerRole].privateKey });
  });
  const decisionRegister = recordHumanReleaseGateDecisions({ packet, packetContext, decisionPolicy, decisions, recordedAt: "2026-08-09T10:13:00.000Z" });
  const controllerKeys = generateKeyPairSync("ed25519");
  const authorizer = { keyId: "release-controller-key", actorId: "release-controller-operator", role: "release-controller", publicKeyPem: controllerKeys.publicKey.export({ type: "spki", format: "pem" }).toString(), validFrom: "2026-08-09T00:00:00.000Z", validUntil: "2026-08-10T00:00:00.000Z", status: "active" };
  const authorizationPolicy = createReleaseGateExecutionAuthorizationPolicy({ packetContext, decisionPolicy, trustedAuthorizers: [authorizer] });
  return { packet, packetContext, decisionPolicy, decisions, decisionRegister, reviewerKeys, signers, controllerKeys, authorizer, authorizationPolicy };
}

function authorize(value, overrides = {}) {
  return createReleaseGateExecutionAuthorization({ packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy, decisions: value.decisions, decisionRegister: value.decisionRegister, authorizationPolicy: value.authorizationPolicy, authorizationId: "gate-execution-authorization-one", keyId: value.authorizer.keyId, reason: "Execução isolada dos gates explicitamente aprovados.", authorizedAt: "2026-08-09T10:14:00.000Z", expiresAt: "2026-08-09T10:20:00.000Z", nonce: "gate-execution-once", privateKey: value.controllerKeys.privateKey, ...overrides });
}

test("política separa revisores da autoridade de execução e mantém todos os efeitos automáticos desligados", () => {
  const value = fixture();
  assert.equal(inspectReleaseGateExecutionAuthorizationPolicy(value.authorizationPolicy, { packetContext: value.packetContext, decisionPolicy: value.decisionPolicy }).ok, true);
  assert.equal(value.authorizationPolicy.authorizerRole, "release-controller");
  assert.ok(!value.packetContext.provenancePolicy.trustedSigners.some((item) => item.keyId === value.authorizer.keyId));
  for (const key of ["automaticGateExecution", "automaticReleaseApproval", "automaticReleaseMemoryUpdate", "automaticPackageGeneration", "automaticDeploy", "automaticReleasePromotion"]) assert.equal(value.authorizationPolicy[key], false);
});

test("registro integralmente aprovado gera autorização curta para o conjunto exato de gates", () => {
  const value = fixture();
  const authorization = authorize(value);
  const inspection = inspectReleaseGateExecutionAuthorization(authorization, { packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy, decisions: value.decisions, decisionRegister: value.decisionRegister, authorizationPolicy: value.authorizationPolicy, inspectedAt: "2026-08-09T10:15:00.000Z" });
  assert.equal(inspection.ok, true);
  assert.equal(authorization.authorizedTargets.length, 4);
  assert.equal(authorization.singleUseRequired, true);
  assert.equal(authorization.executionAuthorized, true);
  for (const key of ["gatesExecuted", "releaseApproved", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) assert.equal(authorization[key], false);
});

test("revisão parcial ou rejeitada não pode gerar autorização", () => {
  const value = fixture();
  const partial = recordHumanReleaseGateDecisions({ packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy, decisions: value.decisions.slice(0, 1), recordedAt: "2026-08-09T10:13:00.000Z" });
  assert.throws(() => authorize({ ...value, decisions: value.decisions.slice(0, 1), decisionRegister: partial }), /human_review_not_complete_approved/);
  const gate = value.packet.modules[0].gates.at(-1);
  const signer = value.signers.find((item) => item.role === gate.reviewerRole);
  const rejectedDecision = createHumanReleaseGateDecision({
    packet: value.packet,
    packetContext: value.packetContext,
    decisionPolicy: value.decisionPolicy,
    decisionId: `rejected-${gate.gate.toLowerCase()}`,
    moduleId: value.packet.modules[0].moduleId,
    gate: gate.gate,
    keyId: signer.keyId,
    outcome: "rejected",
    reason: "Evidência insuficiente para autorizar a execução.",
    decidedAt: "2026-08-09T10:12:00.000Z",
    nonce: `rejected-${gate.gate.toLowerCase()}`,
    privateKey: value.reviewerKeys[gate.reviewerRole].privateKey,
  });
  const rejectedDecisions = [...value.decisions.slice(0, -1), rejectedDecision];
  const rejected = recordHumanReleaseGateDecisions({ packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy, decisions: rejectedDecisions, recordedAt: "2026-08-09T10:13:00.000Z" });
  assert.equal(rejected.status, "human_review_complete_rejected");
  assert.throws(() => authorize({ ...value, decisions: rejectedDecisions, decisionRegister: rejected }), /human_review_not_complete_approved/);
});

test("autoridade não confiável, chave errada e janela excessiva são recusadas", () => {
  const value = fixture();
  assert.throws(() => authorize(value, { keyId: "unknown-controller" }), /execution_authorizer_untrusted/);
  const wrongKeys = generateKeyPairSync("ed25519");
  assert.throws(() => authorize(value, { privateKey: wrongKeys.privateKey }), /private_key_does_not_match_execution_authorizer/);
  assert.throws(() => authorize(value, { expiresAt: "2026-08-09T11:20:00.000Z" }), /authorization_validity_too_long/);
});

test("conteúdo, assinatura e expiração adulterados são detectados", () => {
  const value = fixture();
  const authorization = authorize(value);
  const context = { packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy, decisions: value.decisions, decisionRegister: value.decisionRegister, authorizationPolicy: value.authorizationPolicy, inspectedAt: "2026-08-09T10:15:00.000Z" };
  assert.equal(inspectReleaseGateExecutionAuthorization({ ...authorization, releaseApproved: true }, context).ok, false);
  assert.equal(inspectReleaseGateExecutionAuthorization({ ...authorization, authorizationScope: "all-gates" }, context).ok, false);
  assert.equal(inspectReleaseGateExecutionAuthorization({ ...authorization, signature: `${authorization.signature}x` }, context).ok, false);
  assert.equal(inspectReleaseGateExecutionAuthorization(authorization, { ...context, inspectedAt: "2026-08-09T10:21:00.000Z" }).reason, "execution_authorization_expired");
});
