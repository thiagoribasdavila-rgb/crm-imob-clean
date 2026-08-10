import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  inspectAuthorizedReleaseGateExecution,
  inspectAuthorizedReleaseGateExecutionPolicy,
} from "./authorized-release-gate-execution.mjs";

export const RELEASE_GATE_RESULT_ADJUDICATION_POLICY_SCHEMA = "atlas.release-gate-result-adjudication-policy.v1";
export const RELEASE_GATE_RESULT_ADJUDICATION_REGISTER_SCHEMA = "atlas.release-gate-result-adjudication-register.v1";
export const RELEASE_GATE_RESULT_ADJUDICATION_SIGNATURE_ALGORITHM = "ed25519";
export const RELEASE_GATE_RESULT_ADJUDICATOR_ROLE = "release-gate-adjudicator";
export const RELEASE_GATE_RESULT_DISPOSITIONS = Object.freeze(["accepted", "rejected"]);
export const RELEASE_GATE_RESULT_REASON_CODES = Object.freeze([
  "evidence-accepted",
  "execution-failure",
  "receipt-invalid",
  "result-inconclusive",
]);

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

function validateAdjudicator(adjudicator) {
  if (!adjudicator || typeof adjudicator !== "object" || Array.isArray(adjudicator)) throw new Error("gate_result_adjudicator_invalid");
  assertSlug(adjudicator.keyId, "gate_result_adjudicator_key_id");
  assertSlug(adjudicator.actorId, "gate_result_adjudicator_actor_id");
  if (adjudicator.role !== RELEASE_GATE_RESULT_ADJUDICATOR_ROLE) throw new Error("gate_result_adjudicator_role_invalid");
  if (!["active", "inactive"].includes(adjudicator.status)) throw new Error("gate_result_adjudicator_status_invalid");
  assertIso(adjudicator.validFrom, "gate_result_adjudicator_valid_from");
  assertIso(adjudicator.validUntil, "gate_result_adjudicator_valid_until");
  if (Date.parse(adjudicator.validUntil) <= Date.parse(adjudicator.validFrom)) throw new Error("gate_result_adjudicator_validity_invalid");
  try {
    const key = createPublicKey(adjudicator.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch { throw new Error("gate_result_adjudicator_public_key_invalid"); }
  return {
    keyId: adjudicator.keyId,
    actorId: adjudicator.actorId,
    role: adjudicator.role,
    publicKeyPem: adjudicator.publicKeyPem,
    validFrom: adjudicator.validFrom,
    validUntil: adjudicator.validUntil,
    status: adjudicator.status,
  };
}

export function createReleaseGateResultAdjudicationPolicy({
  packetContext,
  decisionPolicy,
  authorizationPolicy,
  executionPolicy,
  trustedAdjudicators = [],
  maxAdjudicationDelaySeconds = 1800,
  minReasonLength = 12,
}) {
  const executionInspection = inspectAuthorizedReleaseGateExecutionPolicy(executionPolicy, { packetContext, decisionPolicy, authorizationPolicy });
  if (!executionInspection.ok) throw new Error(`gate_execution_policy_invalid:${executionInspection.reason}`);
  if (!Array.isArray(trustedAdjudicators)) throw new Error("trusted_gate_result_adjudicators_invalid");
  const normalizedAdjudicators = trustedAdjudicators.map(validateAdjudicator).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(normalizedAdjudicators.map((item) => item.keyId)).size !== normalizedAdjudicators.length) throw new Error("duplicate_gate_result_adjudicator_key_id");
  if (new Set(normalizedAdjudicators.map((item) => item.actorId)).size !== normalizedAdjudicators.length) throw new Error("duplicate_gate_result_adjudicator_actor_id");
  const forbiddenIdentities = new Set([
    ...executionPolicy.trustedExecutors.flatMap((item) => [item.keyId, item.actorId]),
    ...authorizationPolicy.trustedAuthorizers.flatMap((item) => [item.keyId, item.actorId]),
  ]);
  if (normalizedAdjudicators.some((item) => forbiddenIdentities.has(item.keyId) || forbiddenIdentities.has(item.actorId))) throw new Error("execution_authority_executor_and_adjudicator_must_be_separate");
  if (!Number.isInteger(maxAdjudicationDelaySeconds) || maxAdjudicationDelaySeconds < 1 || maxAdjudicationDelaySeconds > 86400) throw new Error("max_adjudication_delay_invalid");
  if (!Number.isInteger(minReasonLength) || minReasonLength < 8 || minReasonLength > 200) throw new Error("min_adjudication_reason_length_invalid");
  const payload = {
    schema: RELEASE_GATE_RESULT_ADJUDICATION_POLICY_SCHEMA,
    compositionId: packetContext.decision.compositionId,
    compositionDecisionHash: packetContext.decision.decisionHash,
    evidencePlanHash: packetContext.plan.planHash,
    humanDecisionPolicyHash: decisionPolicy.policyHash,
    authorizationPolicyHash: authorizationPolicy.policyHash,
    executionPolicyHash: executionPolicy.policyHash,
    adjudicatorRole: RELEASE_GATE_RESULT_ADJUDICATOR_ROLE,
    signatureAlgorithm: RELEASE_GATE_RESULT_ADJUDICATION_SIGNATURE_ALGORITHM,
    trustedAdjudicators: normalizedAdjudicators,
    maxAdjudicationDelaySeconds,
    minReasonLength,
    allowedDispositions: [...RELEASE_GATE_RESULT_DISPOSITIONS],
    allowedReasonCodes: [...RELEASE_GATE_RESULT_REASON_CODES],
    exactExecutionRegisterBindingRequired: true,
    exactReceiptSetRequired: true,
    explicitPerGateDecisionRequired: true,
    passedReceiptRequiredForAcceptance: true,
    executorAdjudicatorSeparationRequired: true,
    authorizerAdjudicatorSeparationRequired: true,
    signatureRequired: true,
    automaticReleaseApproval: false,
    automaticReleaseMemoryUpdate: false,
    automaticPackageGeneration: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectReleaseGateResultAdjudicationPolicy(policy, context) {
  try {
    const recreated = createReleaseGateResultAdjudicationPolicy({
      ...context,
      trustedAdjudicators: policy?.trustedAdjudicators,
      maxAdjudicationDelaySeconds: policy?.maxAdjudicationDelaySeconds,
      minReasonLength: policy?.minReasonLength,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "gate_result_adjudication_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "gate_result_adjudication_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedAdjudicators: recreated.trustedAdjudicators.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "gate_result_adjudication_policy_invalid" };
  }
}

function inspectExecutionRegister(executionRegister, context) {
  const inspection = inspectAuthorizedReleaseGateExecution(executionRegister, context);
  if (!inspection.ok) throw new Error(`gate_execution_register_invalid:${inspection.reason}`);
  if (!executionRegister.gatesExecuted || !executionRegister.authorizationConsumed) throw new Error("gate_execution_not_complete");
  for (const key of ["releaseApproved", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) {
    if (executionRegister[key] !== false) throw new Error(`gate_execution_register_${key}_must_be_false`);
  }
  return inspection;
}

function validateAdjudicationWindow({ executionRegister, policy, adjudicator, decidedAt }) {
  assertIso(decidedAt, "gate_result_decided_at");
  const decided = Date.parse(decidedAt);
  const completed = Date.parse(executionRegister.completedAt);
  if (decided < completed) throw new Error("gate_result_adjudication_before_execution_complete");
  if (decided - completed > policy.maxAdjudicationDelaySeconds * 1000) throw new Error("gate_result_adjudication_window_expired");
  if (adjudicator.status !== "active") throw new Error("gate_result_adjudicator_inactive");
  if (decided < Date.parse(adjudicator.validFrom) || decided > Date.parse(adjudicator.validUntil)) throw new Error("gate_result_adjudicator_key_outside_validity");
}

function normalizeGateDecisions(gateDecisions, executionRegister, policy) {
  if (!Array.isArray(gateDecisions) || gateDecisions.length !== executionRegister.receipts.length) throw new Error("gate_result_decision_set_incomplete");
  const receipts = new Map(executionRegister.receipts.map((receipt) => [receipt.receiptHash, receipt]));
  const normalized = gateDecisions.map((decision) => {
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) throw new Error("gate_result_decision_invalid");
    assertHash(decision.receiptHash, "gate_result_decision_receipt_hash");
    const receipt = receipts.get(decision.receiptHash);
    if (!receipt) throw new Error("gate_result_decision_receipt_untrusted");
    if (decision.targetKey !== receipt.targetKey) throw new Error("gate_result_decision_target_mismatch");
    if (!policy.allowedDispositions.includes(decision.disposition)) throw new Error("gate_result_disposition_invalid");
    if (!policy.allowedReasonCodes.includes(decision.reasonCode)) throw new Error("gate_result_reason_code_invalid");
    if (decision.disposition === "accepted" && receipt.status !== "passed") throw new Error("failed_gate_result_cannot_be_accepted");
    if (decision.disposition === "accepted" && decision.reasonCode !== "evidence-accepted") throw new Error("accepted_gate_reason_code_invalid");
    if (decision.disposition === "rejected" && decision.reasonCode === "evidence-accepted") throw new Error("rejected_gate_reason_code_invalid");
    return {
      receiptHash: decision.receiptHash,
      targetKey: decision.targetKey,
      executionStatus: receipt.status,
      disposition: decision.disposition,
      reasonCode: decision.reasonCode,
    };
  }).sort((a, b) => a.targetKey.localeCompare(b.targetKey));
  if (new Set(normalized.map((item) => item.receiptHash)).size !== executionRegister.receipts.length) throw new Error("gate_result_decision_receipt_set_mismatch");
  return normalized;
}

function signingPayload({ executionRegister, policy, adjudicationId, adjudicator, gateDecisions, reason, decidedAt, nonce }) {
  const accepted = gateDecisions.filter((item) => item.disposition === "accepted").length;
  const rejected = gateDecisions.length - accepted;
  return {
    signingSchema: "atlas.release-gate-result-adjudication-signing-payload.v1",
    compositionId: executionRegister.compositionId,
    compositionDecisionHash: executionRegister.compositionDecisionHash,
    executionPolicyHash: executionRegister.executionPolicyHash,
    executionRegisterHash: executionRegister.registerHash,
    adjudicationPolicyHash: policy.policyHash,
    adjudicationId,
    adjudicatorKeyId: adjudicator.keyId,
    adjudicatorActorId: adjudicator.actorId,
    adjudicatorRole: adjudicator.role,
    executorKeyId: executionRegister.executorKeyId,
    executorActorId: executionRegister.executorActorId,
    status: rejected === 0 ? "gate_results_accepted" : "gate_results_rejected",
    gateDecisions,
    summary: { totalGates: gateDecisions.length, acceptedGates: accepted, rejectedGates: rejected },
    reason,
    decidedAt,
    nonce,
  };
}

export function createReleaseGateResultAdjudication({
  packet,
  packetContext,
  decisionPolicy,
  decisions,
  decisionRegister,
  authorizationPolicy,
  authorization,
  executionPolicy,
  executionRegister,
  adjudicationPolicy,
  adjudicationId,
  keyId,
  gateDecisions,
  reason,
  decidedAt,
  nonce,
  privateKey,
}) {
  const policyInspection = inspectReleaseGateResultAdjudicationPolicy(adjudicationPolicy, { packetContext, decisionPolicy, authorizationPolicy, executionPolicy });
  if (!policyInspection.ok) throw new Error(`gate_result_adjudication_policy_invalid:${policyInspection.reason}`);
  inspectExecutionRegister(executionRegister, { packet, packetContext, decisionPolicy, decisions, decisionRegister, authorizationPolicy, authorization, executionPolicy });
  assertSlug(adjudicationId, "gate_result_adjudication_id");
  assertSlug(keyId, "gate_result_adjudicator_key_id");
  assertSlug(nonce, "gate_result_adjudication_nonce");
  const adjudicator = adjudicationPolicy.trustedAdjudicators.find((item) => item.keyId === keyId);
  if (!adjudicator) throw new Error("gate_result_adjudicator_untrusted");
  if ([executionRegister.executorKeyId, executionRegister.executorActorId].includes(adjudicator.keyId) || [executionRegister.executorKeyId, executionRegister.executorActorId].includes(adjudicator.actorId)) throw new Error("executor_cannot_adjudicate_own_results");
  validateAdjudicationWindow({ executionRegister, policy: adjudicationPolicy, adjudicator, decidedAt });
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  if (normalizedReason.length < adjudicationPolicy.minReasonLength || normalizedReason.length > 2000) throw new Error("gate_result_adjudication_reason_invalid");
  const normalizedDecisions = normalizeGateDecisions(gateDecisions, executionRegister, adjudicationPolicy);
  const payload = signingPayload({ executionRegister, policy: adjudicationPolicy, adjudicationId, adjudicator, gateDecisions: normalizedDecisions, reason: normalizedReason, decidedAt, nonce });
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("gate_result_adjudication_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), adjudicator.publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_gate_result_adjudicator");
  const register = {
    schema: RELEASE_GATE_RESULT_ADJUDICATION_REGISTER_SCHEMA,
    ...payload,
    signatureAlgorithm: RELEASE_GATE_RESULT_ADJUDICATION_SIGNATURE_ALGORITHM,
    resultSetAdjudicated: true,
    gateResultsAccepted: payload.status === "gate_results_accepted",
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

export function inspectReleaseGateResultAdjudication(register, context) {
  try {
    if (register?.schema !== RELEASE_GATE_RESULT_ADJUDICATION_REGISTER_SCHEMA) throw new Error("gate_result_adjudication_register_schema_invalid");
    const policyInspection = inspectReleaseGateResultAdjudicationPolicy(context.adjudicationPolicy, context);
    if (!policyInspection.ok) throw new Error(`gate_result_adjudication_policy_invalid:${policyInspection.reason}`);
    inspectExecutionRegister(context.executionRegister, context);
    if (register.executionRegisterHash !== context.executionRegister.registerHash) throw new Error("gate_result_adjudication_execution_register_mismatch");
    const adjudicator = context.adjudicationPolicy.trustedAdjudicators.find((item) => item.keyId === register.adjudicatorKeyId);
    if (!adjudicator) throw new Error("gate_result_adjudicator_untrusted");
    if ([context.executionRegister.executorKeyId, context.executionRegister.executorActorId].includes(adjudicator.keyId) || [context.executionRegister.executorKeyId, context.executionRegister.executorActorId].includes(adjudicator.actorId)) throw new Error("executor_cannot_adjudicate_own_results");
    validateAdjudicationWindow({ executionRegister: context.executionRegister, policy: context.adjudicationPolicy, adjudicator, decidedAt: register.decidedAt });
    const reason = typeof register.reason === "string" ? register.reason.trim() : "";
    if (reason.length < context.adjudicationPolicy.minReasonLength || reason.length > 2000) throw new Error("gate_result_adjudication_reason_invalid");
    const decisions = normalizeGateDecisions(register.gateDecisions, context.executionRegister, context.adjudicationPolicy);
    const payload = signingPayload({
      executionRegister: context.executionRegister,
      policy: context.adjudicationPolicy,
      adjudicationId: register.adjudicationId,
      adjudicator,
      gateDecisions: decisions,
      reason,
      decidedAt: register.decidedAt,
      nonce: register.nonce,
    });
    for (const [key, expected] of Object.entries(payload)) if (JSON.stringify(register[key]) !== JSON.stringify(expected)) throw new Error(`gate_result_adjudication_${key}_mismatch`);
    if (register.signatureAlgorithm !== RELEASE_GATE_RESULT_ADJUDICATION_SIGNATURE_ALGORITHM || !cryptoVerify(null, bytes(payload), adjudicator.publicKeyPem, Buffer.from(register.signature, "base64url"))) throw new Error("gate_result_adjudication_signature_invalid");
    if (register.resultSetAdjudicated !== true || register.gatesExecuted !== true || register.gateResultsAccepted !== (register.status === "gate_results_accepted")) throw new Error("gate_result_adjudication_contract_invalid");
    for (const key of ["releaseApproved", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) if (register[key] !== false) throw new Error(`gate_result_adjudication_${key}_must_be_false`);
    const hashPayload = { ...register };
    delete hashPayload.registerHash;
    if (digest(hashPayload) !== register.registerHash) throw new Error("gate_result_adjudication_register_hash_mismatch");
    return { ok: true, registerHash: register.registerHash, status: register.status, ...register.summary, gateResultsAccepted: register.gateResultsAccepted };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "gate_result_adjudication_register_invalid" };
  }
}
