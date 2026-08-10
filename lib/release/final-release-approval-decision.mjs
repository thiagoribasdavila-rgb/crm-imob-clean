import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  inspectReleaseGateResultAdjudication,
  inspectReleaseGateResultAdjudicationPolicy,
} from "./release-gate-result-adjudication.mjs";

export const FINAL_RELEASE_APPROVAL_POLICY_SCHEMA = "atlas.final-release-approval-policy.v1";
export const FINAL_RELEASE_APPROVAL_DECISION_SCHEMA = "atlas.final-release-approval-decision.v1";
export const FINAL_RELEASE_APPROVAL_SIGNATURE_ALGORITHM = "ed25519";
export const FINAL_RELEASE_APPROVER_ROLE = "release-approval-director";
export const FINAL_RELEASE_APPROVAL_OUTCOMES = Object.freeze(["approved", "rejected"]);
export const FINAL_RELEASE_APPROVAL_REASON_CODES = Object.freeze([
  "release-approved",
  "gate-results-rejected",
  "risk-not-accepted",
  "evidence-inconclusive",
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

function validateApprover(approver) {
  if (!approver || typeof approver !== "object" || Array.isArray(approver)) throw new Error("final_release_approver_invalid");
  assertSlug(approver.keyId, "final_release_approver_key_id");
  assertSlug(approver.actorId, "final_release_approver_actor_id");
  if (approver.role !== FINAL_RELEASE_APPROVER_ROLE) throw new Error("final_release_approver_role_invalid");
  if (!["active", "inactive"].includes(approver.status)) throw new Error("final_release_approver_status_invalid");
  assertIso(approver.validFrom, "final_release_approver_valid_from");
  assertIso(approver.validUntil, "final_release_approver_valid_until");
  if (Date.parse(approver.validUntil) <= Date.parse(approver.validFrom)) throw new Error("final_release_approver_validity_invalid");
  try {
    const key = createPublicKey(approver.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch { throw new Error("final_release_approver_public_key_invalid"); }
  return {
    keyId: approver.keyId,
    actorId: approver.actorId,
    role: approver.role,
    publicKeyPem: approver.publicKeyPem,
    validFrom: approver.validFrom,
    validUntil: approver.validUntil,
    status: approver.status,
  };
}

function forbiddenApprovalIdentities({ authorizationPolicy, executionPolicy, adjudicationPolicy }) {
  return new Set([
    ...authorizationPolicy.trustedAuthorizers.flatMap((item) => [item.keyId, item.actorId]),
    ...executionPolicy.trustedExecutors.flatMap((item) => [item.keyId, item.actorId]),
    ...adjudicationPolicy.trustedAdjudicators.flatMap((item) => [item.keyId, item.actorId]),
  ]);
}

export function createFinalReleaseApprovalPolicy({
  packetContext,
  decisionPolicy,
  authorizationPolicy,
  executionPolicy,
  adjudicationPolicy,
  trustedApprovers = [],
  maxDecisionDelaySeconds = 1800,
  minReasonLength = 12,
}) {
  const adjudicationInspection = inspectReleaseGateResultAdjudicationPolicy(adjudicationPolicy, {
    packetContext,
    decisionPolicy,
    authorizationPolicy,
    executionPolicy,
  });
  if (!adjudicationInspection.ok) throw new Error(`gate_result_adjudication_policy_invalid:${adjudicationInspection.reason}`);
  if (!Array.isArray(trustedApprovers)) throw new Error("trusted_final_release_approvers_invalid");
  const normalizedApprovers = trustedApprovers.map(validateApprover).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(normalizedApprovers.map((item) => item.keyId)).size !== normalizedApprovers.length) throw new Error("duplicate_final_release_approver_key_id");
  if (new Set(normalizedApprovers.map((item) => item.actorId)).size !== normalizedApprovers.length) throw new Error("duplicate_final_release_approver_actor_id");
  const forbidden = forbiddenApprovalIdentities({ authorizationPolicy, executionPolicy, adjudicationPolicy });
  if (normalizedApprovers.some((item) => forbidden.has(item.keyId) || forbidden.has(item.actorId))) throw new Error("release_execution_and_final_approval_authority_must_be_separate");
  if (!Number.isInteger(maxDecisionDelaySeconds) || maxDecisionDelaySeconds < 1 || maxDecisionDelaySeconds > 86400) throw new Error("max_final_release_decision_delay_invalid");
  if (!Number.isInteger(minReasonLength) || minReasonLength < 8 || minReasonLength > 200) throw new Error("min_final_release_reason_length_invalid");
  const payload = {
    schema: FINAL_RELEASE_APPROVAL_POLICY_SCHEMA,
    compositionId: packetContext.decision.compositionId,
    compositionDecisionHash: packetContext.decision.decisionHash,
    evidencePlanHash: packetContext.plan.planHash,
    humanDecisionPolicyHash: decisionPolicy.policyHash,
    authorizationPolicyHash: authorizationPolicy.policyHash,
    executionPolicyHash: executionPolicy.policyHash,
    adjudicationPolicyHash: adjudicationPolicy.policyHash,
    approverRole: FINAL_RELEASE_APPROVER_ROLE,
    signatureAlgorithm: FINAL_RELEASE_APPROVAL_SIGNATURE_ALGORITHM,
    trustedApprovers: normalizedApprovers,
    maxDecisionDelaySeconds,
    minReasonLength,
    allowedOutcomes: [...FINAL_RELEASE_APPROVAL_OUTCOMES],
    allowedReasonCodes: [...FINAL_RELEASE_APPROVAL_REASON_CODES],
    exactAdjudicationRegisterBindingRequired: true,
    acceptedGateResultsRequiredForApproval: true,
    independentFinalApproverRequired: true,
    signatureRequired: true,
    automaticReleaseApproval: false,
    automaticReleaseMemoryUpdate: false,
    automaticPackageGeneration: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectFinalReleaseApprovalPolicy(policy, context) {
  try {
    const recreated = createFinalReleaseApprovalPolicy({
      ...context,
      trustedApprovers: policy?.trustedApprovers,
      maxDecisionDelaySeconds: policy?.maxDecisionDelaySeconds,
      minReasonLength: policy?.minReasonLength,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "final_release_approval_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "final_release_approval_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedApprovers: recreated.trustedApprovers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "final_release_approval_policy_invalid" };
  }
}

function inspectAdjudication(adjudicationRegister, context) {
  const inspection = inspectReleaseGateResultAdjudication(adjudicationRegister, context);
  if (!inspection.ok) throw new Error(`gate_result_adjudication_register_invalid:${inspection.reason}`);
  for (const key of ["releaseApproved", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) {
    if (adjudicationRegister[key] !== false) throw new Error(`gate_result_adjudication_${key}_must_be_false`);
  }
  return inspection;
}

function validateDecisionWindow({ adjudicationRegister, policy, approver, decidedAt }) {
  assertIso(decidedAt, "final_release_decided_at");
  const decided = Date.parse(decidedAt);
  const adjudicated = Date.parse(adjudicationRegister.decidedAt);
  if (decided < adjudicated) throw new Error("final_release_decision_before_adjudication");
  if (decided - adjudicated > policy.maxDecisionDelaySeconds * 1000) throw new Error("final_release_decision_window_expired");
  if (approver.status !== "active") throw new Error("final_release_approver_inactive");
  if (decided < Date.parse(approver.validFrom) || decided > Date.parse(approver.validUntil)) throw new Error("final_release_approver_key_outside_validity");
}

function normalizeDecision({ outcome, reasonCode, reason, adjudicationRegister, policy }) {
  if (!policy.allowedOutcomes.includes(outcome)) throw new Error("final_release_outcome_invalid");
  if (!policy.allowedReasonCodes.includes(reasonCode)) throw new Error("final_release_reason_code_invalid");
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  if (normalizedReason.length < policy.minReasonLength || normalizedReason.length > 2000) throw new Error("final_release_reason_invalid");
  if (outcome === "approved") {
    if (!adjudicationRegister.gateResultsAccepted || adjudicationRegister.status !== "gate_results_accepted") throw new Error("unaccepted_gate_results_cannot_approve_release");
    if (reasonCode !== "release-approved") throw new Error("approved_release_reason_code_invalid");
  } else if (reasonCode === "release-approved") {
    throw new Error("rejected_release_reason_code_invalid");
  }
  if (!adjudicationRegister.gateResultsAccepted && outcome !== "rejected") throw new Error("rejected_gate_results_require_release_rejection");
  return { outcome, reasonCode, reason: normalizedReason };
}

function signingPayload({ adjudicationRegister, policy, approvalId, approver, decision, decidedAt, nonce }) {
  return {
    signingSchema: "atlas.final-release-approval-signing-payload.v1",
    compositionId: adjudicationRegister.compositionId,
    compositionDecisionHash: adjudicationRegister.compositionDecisionHash,
    adjudicationPolicyHash: adjudicationRegister.adjudicationPolicyHash,
    adjudicationRegisterHash: adjudicationRegister.registerHash,
    finalApprovalPolicyHash: policy.policyHash,
    approvalId,
    approverKeyId: approver.keyId,
    approverActorId: approver.actorId,
    approverRole: approver.role,
    outcome: decision.outcome,
    reasonCode: decision.reasonCode,
    reason: decision.reason,
    decidedAt,
    nonce,
  };
}

export function createFinalReleaseApprovalDecision({
  adjudicationRegister,
  approvalPolicy,
  approvalId,
  keyId,
  outcome,
  reasonCode,
  reason,
  decidedAt,
  nonce,
  privateKey,
  ...context
}) {
  const policyInspection = inspectFinalReleaseApprovalPolicy(approvalPolicy, context);
  if (!policyInspection.ok) throw new Error(`final_release_approval_policy_invalid:${policyInspection.reason}`);
  inspectAdjudication(adjudicationRegister, { ...context, adjudicationRegister });
  assertSlug(approvalId, "final_release_approval_id");
  assertSlug(keyId, "final_release_approver_key_id");
  assertSlug(nonce, "final_release_approval_nonce");
  const approver = approvalPolicy.trustedApprovers.find((item) => item.keyId === keyId);
  if (!approver) throw new Error("final_release_approver_untrusted");
  const forbidden = forbiddenApprovalIdentities(context);
  if (forbidden.has(approver.keyId) || forbidden.has(approver.actorId)) throw new Error("prior_release_actor_cannot_approve_final_release");
  validateDecisionWindow({ adjudicationRegister, policy: approvalPolicy, approver, decidedAt });
  const decision = normalizeDecision({ outcome, reasonCode, reason, adjudicationRegister, policy: approvalPolicy });
  const payload = signingPayload({ adjudicationRegister, policy: approvalPolicy, approvalId, approver, decision, decidedAt, nonce });
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("final_release_approval_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), approver.publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_final_release_approver");
  const record = {
    schema: FINAL_RELEASE_APPROVAL_DECISION_SCHEMA,
    ...payload,
    signatureAlgorithm: FINAL_RELEASE_APPROVAL_SIGNATURE_ALGORITHM,
    approvalRecorded: true,
    resultSetAdjudicated: true,
    gateResultsAccepted: adjudicationRegister.gateResultsAccepted,
    releaseApproved: outcome === "approved",
    releaseMemoryUpdated: false,
    packageGenerated: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  return { ...record, decisionHash: digest(record) };
}

export function inspectFinalReleaseApprovalDecision(record, context) {
  try {
    if (record?.schema !== FINAL_RELEASE_APPROVAL_DECISION_SCHEMA) throw new Error("final_release_approval_decision_schema_invalid");
    const policyInspection = inspectFinalReleaseApprovalPolicy(context.approvalPolicy, context);
    if (!policyInspection.ok) throw new Error(`final_release_approval_policy_invalid:${policyInspection.reason}`);
    inspectAdjudication(context.adjudicationRegister, context);
    if (record.adjudicationRegisterHash !== context.adjudicationRegister.registerHash) throw new Error("final_release_approval_adjudication_register_mismatch");
    assertSlug(record.approvalId, "final_release_approval_id");
    assertSlug(record.nonce, "final_release_approval_nonce");
    const approver = context.approvalPolicy.trustedApprovers.find((item) => item.keyId === record.approverKeyId);
    if (!approver) throw new Error("final_release_approver_untrusted");
    const forbidden = forbiddenApprovalIdentities(context);
    if (forbidden.has(approver.keyId) || forbidden.has(approver.actorId)) throw new Error("prior_release_actor_cannot_approve_final_release");
    validateDecisionWindow({ adjudicationRegister: context.adjudicationRegister, policy: context.approvalPolicy, approver, decidedAt: record.decidedAt });
    const decision = normalizeDecision({ outcome: record.outcome, reasonCode: record.reasonCode, reason: record.reason, adjudicationRegister: context.adjudicationRegister, policy: context.approvalPolicy });
    const payload = signingPayload({ adjudicationRegister: context.adjudicationRegister, policy: context.approvalPolicy, approvalId: record.approvalId, approver, decision, decidedAt: record.decidedAt, nonce: record.nonce });
    for (const [key, expected] of Object.entries(payload)) if (JSON.stringify(record[key]) !== JSON.stringify(expected)) throw new Error(`final_release_approval_${key}_mismatch`);
    if (record.signatureAlgorithm !== FINAL_RELEASE_APPROVAL_SIGNATURE_ALGORITHM || !cryptoVerify(null, bytes(payload), approver.publicKeyPem, Buffer.from(record.signature, "base64url"))) throw new Error("final_release_approval_signature_invalid");
    if (record.approvalRecorded !== true || record.resultSetAdjudicated !== true || record.gateResultsAccepted !== context.adjudicationRegister.gateResultsAccepted || record.releaseApproved !== (record.outcome === "approved")) throw new Error("final_release_approval_contract_invalid");
    for (const key of ["releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) if (record[key] !== false) throw new Error(`final_release_approval_${key}_must_be_false`);
    const hashPayload = { ...record };
    delete hashPayload.decisionHash;
    if (digest(hashPayload) !== record.decisionHash) throw new Error("final_release_approval_decision_hash_mismatch");
    return { ok: true, decisionHash: record.decisionHash, outcome: record.outcome, releaseApproved: record.releaseApproved };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "final_release_approval_decision_invalid" };
  }
}
