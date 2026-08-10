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
import {
  createAuthorizedReleaseGateExecutionPolicy,
  executeAuthorizedReleaseGates,
  inspectAuthorizedReleaseGateExecution,
  inspectAuthorizedReleaseGateExecutionPolicy,
} from "../../lib/release/authorized-release-gate-execution.mjs";

const hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const keyOf = (target) => `${target.moduleId}:${target.revision}:${target.gate}`;
const slug = (value) => value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase().replace(/^-|-$/g, "");

function fixture() {
  const memory = createModuleCompletionMemory([{ moduleId: "conversion-core", moduleName: "Conversion Core", canonicalOwner: "conversion-core", revision: 1, completionLevel: "locally_verified", outcome: "captura governada", sourcePaths: ["lib/conversion-core.mjs"], evidencePaths: ["tests/conversion-core.test.mjs"], checks: { contracts: true, typecheck: true, lint: true, secretScan: true }, releaseGates: { runtimeHomologated: false, cleanBuildVerified: false, rollbackReady: false, directorApproved: false } }]);
  const entry = memory.entries[0];
  const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration: createModuleDependencyGraphConfiguration({ sourceMemoryHash: memory.memoryHash, modules: [{ moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash, dependencies: [] }] }) });
  const decision = evaluateReleaseCompositionEligibility({ graph, plan: createReleaseCompositionPlan({ compositionId: "conversion-core-candidate", sourceGraphHash: graph.graphHash, roots: [{ moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash }] }) });
  const plan = createReleaseGateEvidencePlan({ decision });
  const intakePolicy = createReleaseEvidenceIntakePolicy({ decision, plan });
  const requirements = plan.modules[0].gates.flatMap((gate) => gate.requiredEvidence.map((evidenceType) => ({ gate, evidenceType })));
  const records = requirements.map(({ gate, evidenceType }, index) => createReleaseGateEvidenceRecord({ evidenceId: `execution-proof-${index + 1}`, moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash, compositionDecisionHash: decision.decisionHash, gate: gate.gate, evidenceType, ownerRole: RELEASE_GATE_REQUIREMENTS[gate.gate].ownerRole, environment: gate.gate === "directorApproved" ? "governance" : "isolated", result: "passed", observedAt: "2026-08-09T10:00:00.000Z", validUntil: "2026-08-09T12:00:00.000Z", artifacts: [`evidence/${gate.gate}/${evidenceType}.json`], artifactHash: `${index + 1}`.repeat(64).slice(0, 64) }));
  const roles = [...new Set(plan.modules[0].gates.map((gate) => gate.ownerRole))];
  const reviewerKeys = Object.fromEntries(roles.map((role) => [role, generateKeyPairSync("ed25519")]));
  const signers = roles.map((role) => ({ keyId: `${role.replaceAll("_", "-")}-key`, actorId: `${role.replaceAll("_", "-")}-actor`, role, channels: ["isolated_handoff"], publicKeyPem: reviewerKeys[role].publicKey.export({ type: "spki", format: "pem" }).toString(), validFrom: "2026-08-09T00:00:00.000Z", validUntil: "2026-08-10T00:00:00.000Z", status: "active" }));
  const provenancePolicy = createReleaseEvidenceProvenancePolicy({ decision, plan, intakePolicy, trustedSigners: signers, maxSignatureAgeSeconds: 900 });
  const admissionPolicy = createReleaseEvidenceAdmissionPolicy({ decision, plan, intakePolicy, provenancePolicy });
  const admissions = roles.map((role, index) => {
    const signer = signers.find((item) => item.role === role);
    const intake = createReleaseEvidenceIntake({ decision, plan, policy: intakePolicy, intakeId: `execution-intake-${role.replaceAll("_", "-")}`, submitter: { actorId: signer.actorId, role }, channel: "isolated_handoff", submittedAt: "2026-08-09T10:05:00.000Z", records: records.filter((record) => record.ownerRole === role) });
    const intakeResult = processReleaseEvidenceIntake({ decision, plan, policy: intakePolicy, intake, receivedAt: "2026-08-09T10:06:00.000Z" });
    const envelope = createReleaseEvidenceProvenanceEnvelope({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, keyId: signer.keyId, signedAt: "2026-08-09T10:07:00.000Z", nonce: `execution-${index + 1}`, privateKey: reviewerKeys[role].privateKey });
    const provenanceResult = verifyReleaseEvidenceProvenance({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, envelope, verifiedAt: "2026-08-09T10:08:00.000Z" });
    const admissionResult = admitReleaseEvidenceToMatrix({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy, intake, intakeResult, envelope, provenanceResult, admittedAt: "2026-08-09T10:09:00.000Z" });
    return { intake, intakeResult, envelope, provenanceResult, admissionResult };
  });
  const evaluationPolicy = createAdmittedEvidenceMatrixEvaluationPolicy({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy });
  const evaluationResult = evaluateAdmittedEvidenceMatrix({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy, admissions, evaluatedAt: "2026-08-09T10:10:00.000Z" });
  const packetPolicy = createReleaseGateReviewPacketPolicy({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy });
  const packetContext = { decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy, packetPolicy, admissions, evaluationResult };
  const packet = prepareReleaseGateReviewPacket({ ...packetContext, preparedAt: "2026-08-09T10:11:00.000Z" });
  const decisionPolicy = createHumanReleaseGateDecisionPolicy(packetContext);
  const decisions = packet.modules[0].gates.map((gate) => {
    const signer = signers.find((item) => item.role === gate.reviewerRole);
    return createHumanReleaseGateDecision({ packet, packetContext, decisionPolicy, decisionId: `execution-decision-${gate.gate.toLowerCase()}`, moduleId: packet.modules[0].moduleId, gate: gate.gate, keyId: signer.keyId, outcome: "approved", reason: "Evidências revisadas e aceitas explicitamente.", decidedAt: "2026-08-09T10:12:00.000Z", nonce: `execution-decision-${gate.gate.toLowerCase()}`, privateKey: reviewerKeys[gate.reviewerRole].privateKey });
  });
  const decisionRegister = recordHumanReleaseGateDecisions({ packet, packetContext, decisionPolicy, decisions, recordedAt: "2026-08-09T10:13:00.000Z" });
  const controllerKeys = generateKeyPairSync("ed25519");
  const authorizer = { keyId: "release-controller-key", actorId: "release-controller-operator", role: "release-controller", publicKeyPem: controllerKeys.publicKey.export({ type: "spki", format: "pem" }).toString(), validFrom: "2026-08-09T00:00:00.000Z", validUntil: "2026-08-10T00:00:00.000Z", status: "active" };
  const authorizationPolicy = createReleaseGateExecutionAuthorizationPolicy({ packetContext, decisionPolicy, trustedAuthorizers: [authorizer] });
  const authorization = createReleaseGateExecutionAuthorization({ packet, packetContext, decisionPolicy, decisions, decisionRegister, authorizationPolicy, authorizationId: "gate-execution-authorization-one", keyId: authorizer.keyId, reason: "Execução isolada dos gates explicitamente aprovados.", authorizedAt: "2026-08-09T10:14:00.000Z", expiresAt: "2026-08-09T10:20:00.000Z", nonce: "gate-execution-once", privateKey: controllerKeys.privateKey });
  const executorKeys = generateKeyPairSync("ed25519");
  const executor = { keyId: "isolated-executor-key", actorId: "isolated-executor-operator", role: "release-gate-executor", publicKeyPem: executorKeys.publicKey.export({ type: "spki", format: "pem" }).toString(), validFrom: "2026-08-09T00:00:00.000Z", validUntil: "2026-08-10T00:00:00.000Z", status: "active" };
  const descriptors = authorization.authorizedTargets.map((target) => ({ targetKey: keyOf(target), handlerId: `execute-${slug(target.gate)}`, handlerDigest: hash(`trusted-handler:${keyOf(target)}`) }));
  const executionPolicy = createAuthorizedReleaseGateExecutionPolicy({ packetContext, decisionPolicy, authorizationPolicy, trustedExecutors: [executor], trustedGateHandlers: descriptors });
  const gateCatalog = new Map(descriptors.map((descriptor) => [descriptor.targetKey, { ...descriptor, async execute({ target }) { return { status: "passed", exitCode: 0, summary: `Gate ${target.gate} concluído em isolamento verificável.`, evidence: [{ type: "gate-result", artifactPath: `evidence/${slug(descriptor.targetKey)}/result.json`, artifactHash: hash(`result:${descriptor.targetKey}`) }] }; } }]));
  const consumed = new Set();
  const consumptionStore = { async claim(claim) { if (consumed.has(claim.authorizationHash)) return false; consumed.add(claim.authorizationHash); return true; } };
  return { packet, packetContext, decisionPolicy, decisions, decisionRegister, authorizationPolicy, authorization, executorKeys, executor, descriptors, executionPolicy, gateCatalog, consumptionStore };
}

function executionArguments(value, overrides = {}) {
  let tick = 0;
  const clock = () => new Date(Date.parse("2026-08-09T10:15:00.000Z") + tick++ * 1000).toISOString();
  return { packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy, decisions: value.decisions, decisionRegister: value.decisionRegister, authorizationPolicy: value.authorizationPolicy, authorization: value.authorization, executionPolicy: value.executionPolicy, executionId: "isolated-execution-one", executorKeyId: value.executor.keyId, privateKey: value.executorKeys.privateKey, gateCatalog: value.gateCatalog, consumptionStore: value.consumptionStore, clock, ...overrides };
}

test("política exige executor separado, catálogo confiável e isolamento sem efeitos externos", () => {
  const value = fixture();
  const inspection = inspectAuthorizedReleaseGateExecutionPolicy(value.executionPolicy, { packetContext: value.packetContext, decisionPolicy: value.decisionPolicy, authorizationPolicy: value.authorizationPolicy });
  assert.equal(inspection.ok, true);
  assert.equal(value.executionPolicy.isolationMode, "ephemeral-local-sandbox");
  assert.equal(value.executionPolicy.networkAccessAllowed, false);
  assert.equal(value.executionPolicy.databaseMutationAllowed, false);
  assert.equal(value.executionPolicy.arbitraryCommandExecutionAllowed, false);
  assert.ok(value.executionPolicy.trustedExecutors.every((item) => item.keyId !== value.authorizationPolicy.trustedAuthorizers[0].keyId));
  for (const key of ["automaticReleaseApproval", "automaticReleaseMemoryUpdate", "automaticPackageGeneration", "automaticDeploy", "automaticReleasePromotion"]) assert.equal(value.executionPolicy[key], false);
});

test("autorização válida é consumida uma vez e produz recibos assinados para o conjunto exato", async () => {
  const value = fixture();
  const register = await executeAuthorizedReleaseGates(executionArguments(value));
  const inspection = inspectAuthorizedReleaseGateExecution(register, value);
  assert.equal(inspection.ok, true);
  assert.equal(register.status, "execution_complete_passed");
  assert.equal(register.receipts.length, value.authorization.authorizedTargets.length);
  assert.ok(register.receipts.every((receipt) => receipt.gateExecuted && receipt.authorizationConsumed && receipt.status === "passed"));
  for (const key of ["releaseApproved", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) assert.equal(register[key], false);
  await assert.rejects(() => executeAuthorizedReleaseGates(executionArguments(value, { executionId: "isolated-execution-two" })), /execution_authorization_already_consumed/);
});

test("catálogo incompleto, extra ou com identidade divergente é bloqueado antes do consumo", async () => {
  const missing = fixture();
  const missingCatalog = new Map(missing.gateCatalog);
  missingCatalog.delete(missing.authorization.authorizedTargets.map(keyOf)[0]);
  await assert.rejects(() => executeAuthorizedReleaseGates(executionArguments(missing, { gateCatalog: missingCatalog })), /gate_execution_catalog_target_set_mismatch/);

  const divergent = fixture();
  const target = divergent.authorization.authorizedTargets.map(keyOf)[0];
  const divergentCatalog = new Map(divergent.gateCatalog);
  divergentCatalog.set(target, { ...divergentCatalog.get(target), handlerDigest: hash("mutated-handler") });
  await assert.rejects(() => executeAuthorizedReleaseGates(executionArguments(divergent, { gateCatalog: divergentCatalog })), /gate_execution_handler_identity_mismatch/);
});

test("falha isolada fica registrada sem aprovar ou promover a release", async () => {
  const value = fixture();
  const failedKey = value.authorization.authorizedTargets.map(keyOf)[0];
  const gateCatalog = new Map(value.gateCatalog);
  const handler = gateCatalog.get(failedKey);
  gateCatalog.set(failedKey, { ...handler, async execute() { return { status: "failed", exitCode: 2, summary: "Gate recusado pelo verificador isolado durante a execução.", evidence: [{ type: "failure-record", artifactPath: `evidence/${slug(failedKey)}/failure.json`, artifactHash: hash(`failure:${failedKey}`) }] }; } });
  const register = await executeAuthorizedReleaseGates(executionArguments(value, { gateCatalog }));
  assert.equal(register.status, "execution_complete_failed");
  assert.equal(register.receipts.filter((item) => item.status === "failed").length, 1);
  assert.equal(inspectAuthorizedReleaseGateExecution(register, value).ok, true);
  assert.equal(register.releaseApproved, false);
  assert.equal(register.releasePromoted, false);
});

test("adulteração de recibo, assinatura ou hash do registro é detectada", async () => {
  const value = fixture();
  const register = await executeAuthorizedReleaseGates(executionArguments(value));
  const receiptTamper = structuredClone(register);
  receiptTamper.receipts[0].summary = "Resumo adulterado depois da assinatura.";
  assert.equal(inspectAuthorizedReleaseGateExecution(receiptTamper, value).ok, false);
  const signatureTamper = structuredClone(register);
  signatureTamper.signature = `${signatureTamper.signature}x`;
  assert.equal(inspectAuthorizedReleaseGateExecution(signatureTamper, value).reason, "gate_execution_register_signature_invalid");
  assert.equal(inspectAuthorizedReleaseGateExecution({ ...register, registerHash: "0".repeat(64) }, value).reason, "gate_execution_register_hash_mismatch");
});
