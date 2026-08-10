import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
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
import { createReleaseGateExecutionAuthorization, createReleaseGateExecutionAuthorizationPolicy } from "../../lib/release/release-gate-execution-authorization.mjs";
import { createAuthorizedReleaseGateExecutionPolicy, executeAuthorizedReleaseGates } from "../../lib/release/authorized-release-gate-execution.mjs";
import {
  createReleaseGateResultAdjudication,
  createReleaseGateResultAdjudicationPolicy,
} from "../../lib/release/release-gate-result-adjudication.mjs";
import {
  createFinalReleaseApprovalDecision,
  createFinalReleaseApprovalPolicy,
  inspectFinalReleaseApprovalDecision,
  inspectFinalReleaseApprovalPolicy,
} from "../../lib/release/final-release-approval-decision.mjs";

const hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const keyOf = (target) => `${target.moduleId}:${target.revision}:${target.gate}`;
const slug = (value) => value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase().replace(/^-|-$/g, "");

export async function fixture({ failFirstGate = false } = {}) {
  const memory = createModuleCompletionMemory([{ moduleId: "conversion-core", moduleName: "Conversion Core", canonicalOwner: "conversion-core", revision: 1, completionLevel: "locally_verified", outcome: "captura governada", sourcePaths: ["lib/conversion-core.mjs"], evidencePaths: ["tests/conversion-core.test.mjs"], checks: { contracts: true, typecheck: true, lint: true, secretScan: true }, releaseGates: { runtimeHomologated: false, cleanBuildVerified: false, rollbackReady: false, directorApproved: false } }]);
  const entry = memory.entries[0];
  const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration: createModuleDependencyGraphConfiguration({ sourceMemoryHash: memory.memoryHash, modules: [{ moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash, dependencies: [] }] }) });
  const compositionDecision = evaluateReleaseCompositionEligibility({ graph, plan: createReleaseCompositionPlan({ compositionId: "conversion-core-candidate", sourceGraphHash: graph.graphHash, roots: [{ moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash }] }) });
  const plan = createReleaseGateEvidencePlan({ decision: compositionDecision });
  const intakePolicy = createReleaseEvidenceIntakePolicy({ decision: compositionDecision, plan });
  const requirements = plan.modules[0].gates.flatMap((gate) => gate.requiredEvidence.map((evidenceType) => ({ gate, evidenceType })));
  const records = requirements.map(({ gate, evidenceType }, index) => createReleaseGateEvidenceRecord({ evidenceId: `adjudication-proof-${index + 1}`, moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash, compositionDecisionHash: compositionDecision.decisionHash, gate: gate.gate, evidenceType, ownerRole: RELEASE_GATE_REQUIREMENTS[gate.gate].ownerRole, environment: gate.gate === "directorApproved" ? "governance" : "isolated", result: "passed", observedAt: "2026-08-09T10:00:00.000Z", validUntil: "2026-08-09T12:00:00.000Z", artifacts: [`evidence/${gate.gate}/${evidenceType}.json`], artifactHash: `${index + 1}`.repeat(64).slice(0, 64) }));
  const roles = [...new Set(plan.modules[0].gates.map((gate) => gate.ownerRole))];
  const reviewerKeys = Object.fromEntries(roles.map((role) => [role, generateKeyPairSync("ed25519")]));
  const signers = roles.map((role) => ({ keyId: `${role.replaceAll("_", "-")}-key`, actorId: `${role.replaceAll("_", "-")}-actor`, role, channels: ["isolated_handoff"], publicKeyPem: reviewerKeys[role].publicKey.export({ type: "spki", format: "pem" }).toString(), validFrom: "2026-08-09T00:00:00.000Z", validUntil: "2026-08-10T00:00:00.000Z", status: "active" }));
  const provenancePolicy = createReleaseEvidenceProvenancePolicy({ decision: compositionDecision, plan, intakePolicy, trustedSigners: signers, maxSignatureAgeSeconds: 900 });
  const admissionPolicy = createReleaseEvidenceAdmissionPolicy({ decision: compositionDecision, plan, intakePolicy, provenancePolicy });
  const admissions = roles.map((role, index) => {
    const signer = signers.find((item) => item.role === role);
    const intake = createReleaseEvidenceIntake({ decision: compositionDecision, plan, policy: intakePolicy, intakeId: `adjudication-intake-${role.replaceAll("_", "-")}`, submitter: { actorId: signer.actorId, role }, channel: "isolated_handoff", submittedAt: "2026-08-09T10:05:00.000Z", records: records.filter((record) => record.ownerRole === role) });
    const intakeResult = processReleaseEvidenceIntake({ decision: compositionDecision, plan, policy: intakePolicy, intake, receivedAt: "2026-08-09T10:06:00.000Z" });
    const envelope = createReleaseEvidenceProvenanceEnvelope({ decision: compositionDecision, plan, intakePolicy, provenancePolicy, intake, intakeResult, keyId: signer.keyId, signedAt: "2026-08-09T10:07:00.000Z", nonce: `adjudication-${index + 1}`, privateKey: reviewerKeys[role].privateKey });
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
    return createHumanReleaseGateDecision({ packet, packetContext, decisionPolicy, decisionId: `adjudication-decision-${gate.gate.toLowerCase()}`, moduleId: packet.modules[0].moduleId, gate: gate.gate, keyId: signer.keyId, outcome: "approved", reason: "Evidências revisadas e aceitas explicitamente.", decidedAt: "2026-08-09T10:12:00.000Z", nonce: `adjudication-decision-${gate.gate.toLowerCase()}`, privateKey: reviewerKeys[gate.reviewerRole].privateKey });
  });
  const decisionRegister = recordHumanReleaseGateDecisions({ packet, packetContext, decisionPolicy, decisions, recordedAt: "2026-08-09T10:13:00.000Z" });
  const controllerKeys = generateKeyPairSync("ed25519");
  const authorizer = { keyId: "release-controller-key", actorId: "release-controller-operator", role: "release-controller", publicKeyPem: controllerKeys.publicKey.export({ type: "spki", format: "pem" }).toString(), validFrom: "2026-08-09T00:00:00.000Z", validUntil: "2026-08-10T00:00:00.000Z", status: "active" };
  const authorizationPolicy = createReleaseGateExecutionAuthorizationPolicy({ packetContext, decisionPolicy, trustedAuthorizers: [authorizer] });
  const authorization = createReleaseGateExecutionAuthorization({ packet, packetContext, decisionPolicy, decisions, decisionRegister, authorizationPolicy, authorizationId: "adjudication-execution-authorization", keyId: authorizer.keyId, reason: "Execução isolada dos gates explicitamente aprovados.", authorizedAt: "2026-08-09T10:14:00.000Z", expiresAt: "2026-08-09T10:20:00.000Z", nonce: "adjudication-execution-once", privateKey: controllerKeys.privateKey });
  const executorKeys = generateKeyPairSync("ed25519");
  const executor = { keyId: "isolated-executor-key", actorId: "isolated-executor-operator", role: "release-gate-executor", publicKeyPem: executorKeys.publicKey.export({ type: "spki", format: "pem" }).toString(), validFrom: "2026-08-09T00:00:00.000Z", validUntil: "2026-08-10T00:00:00.000Z", status: "active" };
  const descriptors = authorization.authorizedTargets.map((target) => ({ targetKey: keyOf(target), handlerId: `execute-${slug(target.gate)}`, handlerDigest: hash(`trusted-handler:${keyOf(target)}`) }));
  const executionPolicy = createAuthorizedReleaseGateExecutionPolicy({ packetContext, decisionPolicy, authorizationPolicy, trustedExecutors: [executor], trustedGateHandlers: descriptors });
  const firstTarget = descriptors[0].targetKey;
  const gateCatalog = new Map(descriptors.map((descriptor) => [descriptor.targetKey, { ...descriptor, async execute({ target }) { const failed = failFirstGate && descriptor.targetKey === firstTarget; return { status: failed ? "failed" : "passed", exitCode: failed ? 2 : 0, summary: failed ? `Gate ${target.gate} falhou no verificador isolado.` : `Gate ${target.gate} concluído em isolamento verificável.`, evidence: [{ type: failed ? "failure-record" : "gate-result", artifactPath: `evidence/${slug(descriptor.targetKey)}/result.json`, artifactHash: hash(`result:${descriptor.targetKey}:${failed}`) }] }; } }]));
  const consumed = new Set();
  const consumptionStore = { async claim(claim) { if (consumed.has(claim.authorizationHash)) return false; consumed.add(claim.authorizationHash); return true; } };
  let tick = 0;
  const executionRegister = await executeAuthorizedReleaseGates({ packet, packetContext, decisionPolicy, decisions, decisionRegister, authorizationPolicy, authorization, executionPolicy, executionId: "adjudication-isolated-execution", executorKeyId: executor.keyId, privateKey: executorKeys.privateKey, gateCatalog, consumptionStore, clock: () => new Date(Date.parse("2026-08-09T10:15:00.000Z") + tick++ * 1000).toISOString() });
  const adjudicatorKeys = generateKeyPairSync("ed25519");
  const adjudicator = { keyId: "gate-result-adjudicator-key", actorId: "gate-result-adjudicator-operator", role: "release-gate-adjudicator", publicKeyPem: adjudicatorKeys.publicKey.export({ type: "spki", format: "pem" }).toString(), validFrom: "2026-08-09T00:00:00.000Z", validUntil: "2026-08-10T00:00:00.000Z", status: "active" };
  const adjudicationPolicy = createReleaseGateResultAdjudicationPolicy({ packetContext, decisionPolicy, authorizationPolicy, executionPolicy, trustedAdjudicators: [adjudicator] });
  return { packet, packetContext, decisionPolicy, decisions, decisionRegister, authorizationPolicy, authorization, executionPolicy, executionRegister, executor, authorizer, adjudicatorKeys, adjudicator, adjudicationPolicy };
}

export function gateDecisions(value, rejectFailed = false) {
  return value.executionRegister.receipts.map((receipt) => ({
    receiptHash: receipt.receiptHash,
    targetKey: receipt.targetKey,
    disposition: rejectFailed && receipt.status === "failed" ? "rejected" : "accepted",
    reasonCode: rejectFailed && receipt.status === "failed" ? "execution-failure" : "evidence-accepted",
  }));
}

export function adjudicationArguments(value, overrides = {}) {
  return { packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy, decisions: value.decisions, decisionRegister: value.decisionRegister, authorizationPolicy: value.authorizationPolicy, authorization: value.authorization, executionPolicy: value.executionPolicy, executionRegister: value.executionRegister, adjudicationPolicy: value.adjudicationPolicy, adjudicationId: "gate-result-adjudication-one", keyId: value.adjudicator.keyId, gateDecisions: gateDecisions(value), reason: "Os recibos assinados foram revisados contra as evidências produzidas.", decidedAt: "2026-08-09T10:16:00.000Z", nonce: "gate-result-adjudication-once", privateKey: value.adjudicatorKeys.privateKey, ...overrides };
}

export function approvalFixture(value) {
  const approverKeys = generateKeyPairSync("ed25519");
  const approver = {
    keyId: "final-release-director-key",
    actorId: "final-release-director-operator",
    role: "release-approval-director",
    publicKeyPem: approverKeys.publicKey.export({ type: "spki", format: "pem" }).toString(),
    validFrom: "2026-08-09T00:00:00.000Z",
    validUntil: "2026-08-10T00:00:00.000Z",
    status: "active",
  };
  const approvalPolicy = createFinalReleaseApprovalPolicy({
    packetContext: value.packetContext,
    decisionPolicy: value.decisionPolicy,
    authorizationPolicy: value.authorizationPolicy,
    executionPolicy: value.executionPolicy,
    adjudicationPolicy: value.adjudicationPolicy,
    trustedApprovers: [approver],
  });
  return { approverKeys, approver, approvalPolicy };
}

export function approvalArguments(value, adjudicationRegister, approval, overrides = {}) {
  return {
    adjudicationRegister,
    approvalPolicy: approval.approvalPolicy,
    packet: value.packet,
    packetContext: value.packetContext,
    decisionPolicy: value.decisionPolicy,
    decisions: value.decisions,
    decisionRegister: value.decisionRegister,
    authorizationPolicy: value.authorizationPolicy,
    authorization: value.authorization,
    executionPolicy: value.executionPolicy,
    executionRegister: value.executionRegister,
    adjudicationPolicy: value.adjudicationPolicy,
    approvalId: "final-release-approval-one",
    keyId: approval.approver.keyId,
    outcome: "approved",
    reasonCode: "release-approved",
    reason: "Os gates adjudicados foram aceitos para a decisão final independente.",
    decidedAt: "2026-08-09T10:17:00.000Z",
    nonce: "final-release-approval-once",
    privateKey: approval.approverKeys.privateKey,
    ...overrides,
  };
}

test("política exige diretor final independente e mantém efeitos externos desligados", async () => {
  const value = await fixture();
  const approval = approvalFixture(value);
  const inspection = inspectFinalReleaseApprovalPolicy(approval.approvalPolicy, value);
  assert.equal(inspection.ok, true);
  assert.notEqual(approval.approver.actorId, value.adjudicator.actorId);
  for (const key of ["automaticReleaseApproval", "automaticReleaseMemoryUpdate", "automaticPackageGeneration", "automaticDeploy", "automaticReleasePromotion"]) assert.equal(approval.approvalPolicy[key], false);
});

test("adjudicação aceita permite aprovação assinada sem memória, pacote, deploy ou promoção", async () => {
  const value = await fixture();
  const adjudicationRegister = createReleaseGateResultAdjudication(adjudicationArguments(value));
  const approval = approvalFixture(value);
  const record = createFinalReleaseApprovalDecision(approvalArguments(value, adjudicationRegister, approval));
  const inspection = inspectFinalReleaseApprovalDecision(record, { ...value, approvalPolicy: approval.approvalPolicy, adjudicationRegister });
  assert.equal(inspection.ok, true);
  assert.equal(record.releaseApproved, true);
  for (const key of ["releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) assert.equal(record[key], false);
});

test("resultado rejeitado não pode aprovar release e decisão de rejeição permanece válida", async () => {
  const value = await fixture({ failFirstGate: true });
  const adjudicationRegister = createReleaseGateResultAdjudication(adjudicationArguments(value, { gateDecisions: gateDecisions(value, true) }));
  const approval = approvalFixture(value);
  assert.throws(() => createFinalReleaseApprovalDecision(approvalArguments(value, adjudicationRegister, approval)), /unaccepted_gate_results_cannot_approve_release/);
  const record = createFinalReleaseApprovalDecision(approvalArguments(value, adjudicationRegister, approval, { outcome: "rejected", reasonCode: "gate-results-rejected", reason: "O conjunto de gates contém falha e não autoriza a liberação final." }));
  assert.equal(record.releaseApproved, false);
  assert.equal(inspectFinalReleaseApprovalDecision(record, { ...value, approvalPolicy: approval.approvalPolicy, adjudicationRegister }).ok, true);
});

test("ator anterior não pode aprovar e decisão fora da janela é bloqueada", async () => {
  const value = await fixture();
  assert.throws(() => createFinalReleaseApprovalPolicy({ packetContext: value.packetContext, decisionPolicy: value.decisionPolicy, authorizationPolicy: value.authorizationPolicy, executionPolicy: value.executionPolicy, adjudicationPolicy: value.adjudicationPolicy, trustedApprovers: [{ ...value.adjudicator, role: "release-approval-director" }] }), /release_execution_and_final_approval_authority_must_be_separate/);
  const adjudicationRegister = createReleaseGateResultAdjudication(adjudicationArguments(value));
  const approval = approvalFixture(value);
  assert.throws(() => createFinalReleaseApprovalDecision(approvalArguments(value, adjudicationRegister, approval, { decidedAt: "2026-08-09T11:00:00.000Z" })), /final_release_decision_window_expired/);
});

test("adulteração do vínculo, conteúdo, assinatura ou hash final é detectada", async () => {
  const value = await fixture();
  const adjudicationRegister = createReleaseGateResultAdjudication(adjudicationArguments(value));
  const approval = approvalFixture(value);
  const context = { ...value, approvalPolicy: approval.approvalPolicy, adjudicationRegister };
  const record = createFinalReleaseApprovalDecision(approvalArguments(value, adjudicationRegister, approval));
  assert.equal(inspectFinalReleaseApprovalDecision({ ...record, adjudicationRegisterHash: "0".repeat(64) }, context).reason, "final_release_approval_adjudication_register_mismatch");
  assert.equal(inspectFinalReleaseApprovalDecision({ ...record, outcome: "rejected" }, context).ok, false);
  assert.equal(inspectFinalReleaseApprovalDecision({ ...record, signature: `${record.signature}x` }, context).reason, "final_release_approval_signature_invalid");
  assert.equal(inspectFinalReleaseApprovalDecision({ ...record, decisionHash: "0".repeat(64) }, context).reason, "final_release_approval_decision_hash_mismatch");
});
