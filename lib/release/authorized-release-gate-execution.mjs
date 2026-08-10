import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  inspectReleaseGateExecutionAuthorization,
  inspectReleaseGateExecutionAuthorizationPolicy,
} from "./release-gate-execution-authorization.mjs";

export const AUTHORIZED_GATE_EXECUTION_POLICY_SCHEMA = "atlas.authorized-release-gate-execution-policy.v1";
export const AUTHORIZED_GATE_EXECUTION_RECEIPT_SCHEMA = "atlas.authorized-release-gate-execution-receipt.v1";
export const AUTHORIZED_GATE_EXECUTION_REGISTER_SCHEMA = "atlas.authorized-release-gate-execution-register.v1";
export const AUTHORIZED_GATE_EXECUTION_SIGNATURE_ALGORITHM = "ed25519";
export const AUTHORIZED_GATE_EXECUTOR_ROLE = "release-gate-executor";
export const AUTHORIZED_GATE_ISOLATION_MODE = "ephemeral-local-sandbox";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function bytes(value) { return Buffer.from(JSON.stringify(canonical(value))); }
function digest(value) { return createHash("sha256").update(bytes(value)).digest("hex"); }
function assertIso(value, field) { if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${field}_invalid`); }
function assertSlug(value, field) { if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`${field}_invalid`); }
function assertHash(value, field) { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${field}_invalid`); }
function targetKey(target) { return `${target.moduleId}:${target.revision}:${target.gate}`; }
function receiptSlug(value) { return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase().replace(/^-|-$/g, ""); }

function plannedTargetKeys(packetContext) {
  return packetContext.plan.modules.flatMap((releaseModule) => releaseModule.gates.map((gate) => `${releaseModule.moduleId}:${releaseModule.revision}:${gate.gate}`)).sort();
}

function validateExecutor(executor) {
  if (!executor || typeof executor !== "object" || Array.isArray(executor)) throw new Error("gate_executor_invalid");
  assertSlug(executor.keyId, "gate_executor_key_id");
  assertSlug(executor.actorId, "gate_executor_actor_id");
  if (executor.role !== AUTHORIZED_GATE_EXECUTOR_ROLE) throw new Error("gate_executor_role_invalid");
  if (!['active', 'inactive'].includes(executor.status)) throw new Error("gate_executor_status_invalid");
  assertIso(executor.validFrom, "gate_executor_valid_from");
  assertIso(executor.validUntil, "gate_executor_valid_until");
  if (Date.parse(executor.validUntil) <= Date.parse(executor.validFrom)) throw new Error("gate_executor_validity_invalid");
  try {
    const key = createPublicKey(executor.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch { throw new Error("gate_executor_public_key_invalid"); }
  return {
    keyId: executor.keyId,
    actorId: executor.actorId,
    role: executor.role,
    publicKeyPem: executor.publicKeyPem,
    validFrom: executor.validFrom,
    validUntil: executor.validUntil,
    status: executor.status,
  };
}

function validateHandlerDescriptor(descriptor, allowedTargets) {
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) throw new Error("gate_handler_descriptor_invalid");
  if (typeof descriptor.targetKey !== "string" || !allowedTargets.has(descriptor.targetKey)) throw new Error("gate_handler_target_not_planned");
  assertSlug(descriptor.handlerId, "gate_handler_id");
  assertHash(descriptor.handlerDigest, "gate_handler_digest");
  return { targetKey: descriptor.targetKey, handlerId: descriptor.handlerId, handlerDigest: descriptor.handlerDigest };
}

export function createAuthorizedReleaseGateExecutionPolicy({
  packetContext,
  decisionPolicy,
  authorizationPolicy,
  trustedExecutors = [],
  trustedGateHandlers = [],
  maxGateDurationSeconds = 900,
  maxEvidenceItemsPerGate = 20,
}) {
  const authorizationPolicyInspection = inspectReleaseGateExecutionAuthorizationPolicy(authorizationPolicy, { packetContext, decisionPolicy });
  if (!authorizationPolicyInspection.ok) throw new Error(`execution_authorization_policy_invalid:${authorizationPolicyInspection.reason}`);
  if (!Array.isArray(trustedExecutors)) throw new Error("trusted_gate_executors_invalid");
  if (!Array.isArray(trustedGateHandlers)) throw new Error("trusted_gate_handlers_invalid");
  const normalizedExecutors = trustedExecutors.map(validateExecutor).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(normalizedExecutors.map((item) => item.keyId)).size !== normalizedExecutors.length) throw new Error("duplicate_gate_executor_key_id");
  if (new Set(normalizedExecutors.map((item) => item.actorId)).size !== normalizedExecutors.length) throw new Error("duplicate_gate_executor_actor_id");
  const authorizationIdentities = new Set(authorizationPolicy.trustedAuthorizers.flatMap((item) => [item.keyId, item.actorId]));
  if (normalizedExecutors.some((item) => authorizationIdentities.has(item.keyId) || authorizationIdentities.has(item.actorId))) throw new Error("execution_authority_and_executor_must_be_separate");
  const allowedTargets = new Set(plannedTargetKeys(packetContext));
  const normalizedHandlers = trustedGateHandlers.map((item) => validateHandlerDescriptor(item, allowedTargets)).sort((a, b) => a.targetKey.localeCompare(b.targetKey));
  if (new Set(normalizedHandlers.map((item) => item.targetKey)).size !== normalizedHandlers.length) throw new Error("duplicate_gate_handler_target");
  if (!Number.isInteger(maxGateDurationSeconds) || maxGateDurationSeconds < 1 || maxGateDurationSeconds > 3600) throw new Error("max_gate_duration_invalid");
  if (!Number.isInteger(maxEvidenceItemsPerGate) || maxEvidenceItemsPerGate < 1 || maxEvidenceItemsPerGate > 100) throw new Error("max_evidence_items_invalid");
  const payload = {
    schema: AUTHORIZED_GATE_EXECUTION_POLICY_SCHEMA,
    compositionId: packetContext.decision.compositionId,
    compositionDecisionHash: packetContext.decision.decisionHash,
    evidencePlanHash: packetContext.plan.planHash,
    humanDecisionPolicyHash: decisionPolicy.policyHash,
    authorizationPolicyHash: authorizationPolicy.policyHash,
    executorRole: AUTHORIZED_GATE_EXECUTOR_ROLE,
    signatureAlgorithm: AUTHORIZED_GATE_EXECUTION_SIGNATURE_ALGORITHM,
    isolationMode: AUTHORIZED_GATE_ISOLATION_MODE,
    trustedExecutors: normalizedExecutors,
    trustedGateHandlers: normalizedHandlers,
    maxGateDurationSeconds,
    maxEvidenceItemsPerGate,
    exactAuthorizedTargetSetRequired: true,
    trustedHandlerCatalogRequired: true,
    atomicAuthorizationClaimRequired: true,
    executeAllIsolatedGates: true,
    networkAccessAllowed: false,
    databaseMutationAllowed: false,
    arbitraryCommandExecutionAllowed: false,
    automaticReleaseApproval: false,
    automaticReleaseMemoryUpdate: false,
    automaticPackageGeneration: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectAuthorizedReleaseGateExecutionPolicy(policy, context) {
  try {
    const recreated = createAuthorizedReleaseGateExecutionPolicy({
      ...context,
      trustedExecutors: policy?.trustedExecutors,
      trustedGateHandlers: policy?.trustedGateHandlers,
      maxGateDurationSeconds: policy?.maxGateDurationSeconds,
      maxEvidenceItemsPerGate: policy?.maxEvidenceItemsPerGate,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "gate_execution_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "gate_execution_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedExecutors: recreated.trustedExecutors.length, trustedGateHandlers: recreated.trustedGateHandlers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "gate_execution_policy_invalid" };
  }
}

function validateExecutorWindow(executor, startedAt, completedAt) {
  assertIso(startedAt, "gate_execution_started_at");
  assertIso(completedAt, "gate_execution_completed_at");
  if (Date.parse(completedAt) < Date.parse(startedAt)) throw new Error("gate_execution_time_order_invalid");
  if (executor.status !== "active") throw new Error("gate_executor_inactive");
  if (Date.parse(startedAt) < Date.parse(executor.validFrom) || Date.parse(completedAt) > Date.parse(executor.validUntil)) throw new Error("gate_executor_key_outside_validity");
}

function normalizeEvidence(evidence, maximum) {
  if (!Array.isArray(evidence) || evidence.length < 1 || evidence.length > maximum) throw new Error("gate_execution_evidence_invalid");
  return evidence.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("gate_execution_evidence_item_invalid");
    assertSlug(item.type, "gate_execution_evidence_type");
    if (typeof item.artifactPath !== "string" || item.artifactPath.length < 3 || item.artifactPath.length > 500 || item.artifactPath.startsWith("/") || item.artifactPath.includes("..")) throw new Error("gate_execution_evidence_path_invalid");
    assertHash(item.artifactHash, "gate_execution_evidence_hash");
    return { type: item.type, artifactPath: item.artifactPath, artifactHash: item.artifactHash };
  }).sort((a, b) => `${a.type}:${a.artifactPath}`.localeCompare(`${b.type}:${b.artifactPath}`));
}

function receiptSigningPayload({ authorization, executionPolicy, executionId, executor, target, handler, result, gateStartedAt, gateCompletedAt }) {
  return {
    signingSchema: "atlas.authorized-release-gate-execution-receipt-signing-payload.v1",
    compositionId: authorization.compositionId,
    compositionDecisionHash: authorization.compositionDecisionHash,
    authorizationHash: authorization.authorizationHash,
    executionPolicyHash: executionPolicy.policyHash,
    executionId,
    executorKeyId: executor.keyId,
    executorActorId: executor.actorId,
    executorRole: executor.role,
    target,
    targetKey: targetKey(target),
    handlerId: handler.handlerId,
    handlerDigest: handler.handlerDigest,
    isolationMode: AUTHORIZED_GATE_ISOLATION_MODE,
    networkAccess: false,
    databaseMutation: false,
    status: result.status,
    exitCode: result.exitCode,
    summary: result.summary,
    evidence: result.evidence,
    startedAt: gateStartedAt,
    completedAt: gateCompletedAt,
  };
}

function signPayload(payload, privateKey, publicKeyPem, failureReason) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error(failureReason); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_gate_executor");
  return signature;
}

function normalizeHandlerResult(value, policy) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("gate_handler_result_invalid");
  if (!['passed', 'failed'].includes(value.status)) throw new Error("gate_handler_status_invalid");
  if (!Number.isInteger(value.exitCode) || value.exitCode < 0 || value.exitCode > 255) throw new Error("gate_handler_exit_code_invalid");
  if ((value.status === "passed" && value.exitCode !== 0) || (value.status === "failed" && value.exitCode === 0)) throw new Error("gate_handler_status_exit_code_mismatch");
  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  if (summary.length < 8 || summary.length > 500) throw new Error("gate_handler_summary_invalid");
  return { status: value.status, exitCode: value.exitCode, summary, evidence: normalizeEvidence(value.evidence, policy.maxEvidenceItemsPerGate) };
}

function verifyExactCatalog(authorization, executionPolicy, gateCatalog) {
  if (!(gateCatalog instanceof Map)) throw new Error("gate_execution_catalog_must_be_map");
  const expectedKeys = authorization.authorizedTargets.map(targetKey).sort();
  const receivedKeys = [...gateCatalog.keys()].sort();
  if (JSON.stringify(receivedKeys) !== JSON.stringify(expectedKeys)) throw new Error("gate_execution_catalog_target_set_mismatch");
  const policyHandlers = new Map(executionPolicy.trustedGateHandlers.map((item) => [item.targetKey, item]));
  for (const key of expectedKeys) {
    const runtimeHandler = gateCatalog.get(key);
    const trustedHandler = policyHandlers.get(key);
    if (!trustedHandler) throw new Error("authorized_target_has_no_trusted_handler");
    if (!runtimeHandler || typeof runtimeHandler.execute !== "function") throw new Error("gate_execution_handler_missing");
    if (runtimeHandler.handlerId !== trustedHandler.handlerId || runtimeHandler.handlerDigest !== trustedHandler.handlerDigest) throw new Error("gate_execution_handler_identity_mismatch");
  }
}

export async function executeAuthorizedReleaseGates({
  packet,
  packetContext,
  decisionPolicy,
  decisions,
  decisionRegister,
  authorizationPolicy,
  authorization,
  executionPolicy,
  executionId,
  executorKeyId,
  privateKey,
  gateCatalog,
  consumptionStore,
  clock = () => new Date().toISOString(),
}) {
  const policyInspection = inspectAuthorizedReleaseGateExecutionPolicy(executionPolicy, { packetContext, decisionPolicy, authorizationPolicy });
  if (!policyInspection.ok) throw new Error(`gate_execution_policy_invalid:${policyInspection.reason}`);
  assertSlug(executionId, "gate_execution_id");
  assertSlug(executorKeyId, "gate_executor_key_id");
  if (!consumptionStore || typeof consumptionStore.claim !== "function") throw new Error("atomic_authorization_consumption_store_required");
  if (typeof clock !== "function") throw new Error("gate_execution_clock_invalid");
  const startedAt = clock();
  assertIso(startedAt, "gate_execution_started_at");
  const authorizationInspection = inspectReleaseGateExecutionAuthorization(authorization, { packet, packetContext, decisionPolicy, decisions, decisionRegister, authorizationPolicy, inspectedAt: startedAt });
  if (!authorizationInspection.ok) throw new Error(`execution_authorization_invalid:${authorizationInspection.reason}`);
  const executor = executionPolicy.trustedExecutors.find((item) => item.keyId === executorKeyId);
  if (!executor) throw new Error("gate_executor_untrusted");
  if (executor.status !== "active") throw new Error("gate_executor_inactive");
  verifyExactCatalog(authorization, executionPolicy, gateCatalog);
  const claim = {
    schema: "atlas.release-gate-authorization-consumption-claim.v1",
    authorizationHash: authorization.authorizationHash,
    executionPolicyHash: executionPolicy.policyHash,
    executionId,
    executorKeyId: executor.keyId,
    claimedAt: startedAt,
  };
  const claimResult = await consumptionStore.claim(Object.freeze({ ...claim, claimHash: digest(claim) }));
  if (claimResult !== true) throw new Error("execution_authorization_already_consumed");
  const receipts = [];
  for (const target of authorization.authorizedTargets) {
    const key = targetKey(target);
    const handler = gateCatalog.get(key);
    const gateStartedAt = clock();
    assertIso(gateStartedAt, "gate_started_at");
    let rawResult;
    try {
      rawResult = await handler.execute(Object.freeze({
        executionId,
        authorizationHash: authorization.authorizationHash,
        target: Object.freeze({ ...target }),
        isolation: Object.freeze({ mode: AUTHORIZED_GATE_ISOLATION_MODE, networkAccess: false, databaseMutation: false }),
      }));
    } catch {
      rawResult = { status: "failed", exitCode: 1, summary: "O executor isolado falhou sem expor detalhes internos.", evidence: [{ type: "failure-record", artifactPath: `evidence/${receiptSlug(key)}/failure.json`, artifactHash: digest({ key, executionId, status: "failed" }) }] };
    }
    const gateCompletedAt = clock();
    assertIso(gateCompletedAt, "gate_completed_at");
    validateExecutorWindow(executor, gateStartedAt, gateCompletedAt);
    if (Date.parse(gateCompletedAt) - Date.parse(gateStartedAt) > executionPolicy.maxGateDurationSeconds * 1000) throw new Error("gate_execution_duration_exceeded");
    const result = normalizeHandlerResult(rawResult, executionPolicy);
    const payload = receiptSigningPayload({ authorization, executionPolicy, executionId, executor, target, handler, result, gateStartedAt, gateCompletedAt });
    const signature = signPayload(payload, privateKey, executor.publicKeyPem, "gate_receipt_signature_creation_failed");
    const receipt = {
      schema: AUTHORIZED_GATE_EXECUTION_RECEIPT_SCHEMA,
      receiptId: `${executionId}-${receiptSlug(target.moduleId)}-${receiptSlug(target.gate)}`,
      ...payload,
      signatureAlgorithm: AUTHORIZED_GATE_EXECUTION_SIGNATURE_ALGORITHM,
      authorizationConsumed: true,
      gateExecuted: true,
      releaseApproved: false,
      releaseMemoryUpdated: false,
      packageGenerated: false,
      deployExecuted: false,
      releasePromoted: false,
      signature,
    };
    receipts.push({ ...receipt, receiptHash: digest(receipt) });
  }
  const completedAt = clock();
  validateExecutorWindow(executor, startedAt, completedAt);
  const registerPayload = {
    signingSchema: "atlas.authorized-release-gate-execution-register-signing-payload.v1",
    compositionId: authorization.compositionId,
    compositionDecisionHash: authorization.compositionDecisionHash,
    authorizationHash: authorization.authorizationHash,
    executionPolicyHash: executionPolicy.policyHash,
    executionId,
    executorKeyId: executor.keyId,
    executorActorId: executor.actorId,
    executorRole: executor.role,
    isolationMode: AUTHORIZED_GATE_ISOLATION_MODE,
    authorizationConsumed: true,
    status: receipts.every((item) => item.status === "passed") ? "execution_complete_passed" : "execution_complete_failed",
    receiptHashes: receipts.map((item) => item.receiptHash),
    startedAt,
    completedAt,
  };
  const signature = signPayload(registerPayload, privateKey, executor.publicKeyPem, "gate_execution_register_signature_creation_failed");
  const register = {
    schema: AUTHORIZED_GATE_EXECUTION_REGISTER_SCHEMA,
    ...registerPayload,
    signatureAlgorithm: AUTHORIZED_GATE_EXECUTION_SIGNATURE_ALGORITHM,
    receipts,
    gatesExecuted: true,
    releaseApproved: false,
    releaseMemoryUpdated: false,
    packageGenerated: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  return { ...register, registerHash: digest(register) };
}

export function inspectAuthorizedReleaseGateExecution(register, {
  packet,
  packetContext,
  decisionPolicy,
  decisions,
  decisionRegister,
  authorizationPolicy,
  authorization,
  executionPolicy,
}) {
  try {
    if (register?.schema !== AUTHORIZED_GATE_EXECUTION_REGISTER_SCHEMA) throw new Error("gate_execution_register_schema_invalid");
    const policyInspection = inspectAuthorizedReleaseGateExecutionPolicy(executionPolicy, { packetContext, decisionPolicy, authorizationPolicy });
    if (!policyInspection.ok) throw new Error(`gate_execution_policy_invalid:${policyInspection.reason}`);
    const authorizationInspection = inspectReleaseGateExecutionAuthorization(authorization, { packet, packetContext, decisionPolicy, decisions, decisionRegister, authorizationPolicy, inspectedAt: register.startedAt });
    if (!authorizationInspection.ok) throw new Error(`execution_authorization_invalid:${authorizationInspection.reason}`);
    const executor = executionPolicy.trustedExecutors.find((item) => item.keyId === register.executorKeyId);
    if (!executor) throw new Error("gate_executor_untrusted");
    validateExecutorWindow(executor, register.startedAt, register.completedAt);
    if (!Array.isArray(register.receipts) || register.receipts.length !== authorization.authorizedTargets.length) throw new Error("gate_receipt_set_incomplete");
    const handlers = new Map(executionPolicy.trustedGateHandlers.map((item) => [item.targetKey, item]));
    const expectedTargets = authorization.authorizedTargets.map(targetKey).sort();
    const receivedTargets = register.receipts.map((item) => item.targetKey).sort();
    if (JSON.stringify(receivedTargets) !== JSON.stringify(expectedTargets)) throw new Error("gate_receipt_target_set_mismatch");
    for (const receipt of register.receipts) {
      if (receipt.schema !== AUTHORIZED_GATE_EXECUTION_RECEIPT_SCHEMA) throw new Error("gate_receipt_schema_invalid");
      const target = authorization.authorizedTargets.find((item) => targetKey(item) === receipt.targetKey);
      const handler = handlers.get(receipt.targetKey);
      if (!target || !handler) throw new Error("gate_receipt_target_untrusted");
      const result = normalizeHandlerResult(receipt, executionPolicy);
      const payload = receiptSigningPayload({ authorization, executionPolicy, executionId: register.executionId, executor, target, handler, result, gateStartedAt: receipt.startedAt, gateCompletedAt: receipt.completedAt });
      for (const [key, expected] of Object.entries(payload)) if (JSON.stringify(receipt[key]) !== JSON.stringify(expected)) throw new Error(`gate_receipt_${key}_mismatch`);
      if (receipt.signatureAlgorithm !== AUTHORIZED_GATE_EXECUTION_SIGNATURE_ALGORITHM || !cryptoVerify(null, bytes(payload), executor.publicKeyPem, Buffer.from(receipt.signature, "base64url"))) throw new Error("gate_receipt_signature_invalid");
      for (const key of ["releaseApproved", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) if (receipt[key] !== false) throw new Error(`gate_receipt_${key}_must_be_false`);
      if (receipt.authorizationConsumed !== true || receipt.gateExecuted !== true) throw new Error("gate_receipt_execution_contract_invalid");
      const hashPayload = { ...receipt };
      delete hashPayload.receiptHash;
      if (digest(hashPayload) !== receipt.receiptHash) throw new Error("gate_receipt_hash_mismatch");
    }
    const expectedStatus = register.receipts.every((item) => item.status === "passed") ? "execution_complete_passed" : "execution_complete_failed";
    const payload = {
      signingSchema: "atlas.authorized-release-gate-execution-register-signing-payload.v1",
      compositionId: authorization.compositionId,
      compositionDecisionHash: authorization.compositionDecisionHash,
      authorizationHash: authorization.authorizationHash,
      executionPolicyHash: executionPolicy.policyHash,
      executionId: register.executionId,
      executorKeyId: executor.keyId,
      executorActorId: executor.actorId,
      executorRole: executor.role,
      isolationMode: AUTHORIZED_GATE_ISOLATION_MODE,
      authorizationConsumed: true,
      status: expectedStatus,
      receiptHashes: register.receipts.map((item) => item.receiptHash),
      startedAt: register.startedAt,
      completedAt: register.completedAt,
    };
    for (const [key, expected] of Object.entries(payload)) if (JSON.stringify(register[key]) !== JSON.stringify(expected)) throw new Error(`gate_execution_register_${key}_mismatch`);
    if (register.signatureAlgorithm !== AUTHORIZED_GATE_EXECUTION_SIGNATURE_ALGORITHM || !cryptoVerify(null, bytes(payload), executor.publicKeyPem, Buffer.from(register.signature, "base64url"))) throw new Error("gate_execution_register_signature_invalid");
    for (const key of ["releaseApproved", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) if (register[key] !== false) throw new Error(`gate_execution_register_${key}_must_be_false`);
    if (register.gatesExecuted !== true || register.authorizationConsumed !== true) throw new Error("gate_execution_register_contract_invalid");
    const hashPayload = { ...register };
    delete hashPayload.registerHash;
    if (digest(hashPayload) !== register.registerHash) throw new Error("gate_execution_register_hash_mismatch");
    return { ok: true, registerHash: register.registerHash, status: register.status, executedGates: register.receipts.length, failedGates: register.receipts.filter((item) => item.status === "failed").length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "gate_execution_register_invalid" };
  }
}
