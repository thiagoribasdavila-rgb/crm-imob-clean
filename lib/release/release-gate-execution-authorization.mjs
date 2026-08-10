import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  inspectHumanReleaseGateDecisionPolicy,
  inspectHumanReleaseGateDecisionRegister,
} from "./human-release-gate-decisions.mjs";

export const RELEASE_GATE_EXECUTION_AUTHORIZATION_POLICY_SCHEMA = "atlas.release-gate-execution-authorization-policy.v1";
export const RELEASE_GATE_EXECUTION_AUTHORIZATION_SCHEMA = "atlas.release-gate-execution-authorization.v1";
export const RELEASE_GATE_EXECUTION_AUTHORIZATION_SIGNATURE_ALGORITHM = "ed25519";
export const RELEASE_GATE_EXECUTION_AUTHORIZER_ROLE = "release-controller";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function bytes(value) { return Buffer.from(JSON.stringify(canonical(value))); }
function digest(value) { return createHash("sha256").update(bytes(value)).digest("hex"); }
function assertIso(value, field) { if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${field}_invalid`); }
function assertSlug(value, field) { if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`${field}_invalid`); }

function validateAuthorizer(authorizer) {
  if (!authorizer || typeof authorizer !== "object" || Array.isArray(authorizer)) throw new Error("execution_authorizer_invalid");
  assertSlug(authorizer.keyId, "execution_authorizer_key_id");
  assertSlug(authorizer.actorId, "execution_authorizer_actor_id");
  if (authorizer.role !== RELEASE_GATE_EXECUTION_AUTHORIZER_ROLE) throw new Error("execution_authorizer_role_invalid");
  if (!["active", "inactive"].includes(authorizer.status)) throw new Error("execution_authorizer_status_invalid");
  assertIso(authorizer.validFrom, "execution_authorizer_valid_from");
  assertIso(authorizer.validUntil, "execution_authorizer_valid_until");
  if (Date.parse(authorizer.validUntil) <= Date.parse(authorizer.validFrom)) throw new Error("execution_authorizer_validity_invalid");
  try {
    const key = createPublicKey(authorizer.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch { throw new Error("execution_authorizer_public_key_invalid"); }
  return {
    keyId: authorizer.keyId,
    actorId: authorizer.actorId,
    role: authorizer.role,
    publicKeyPem: authorizer.publicKeyPem,
    validFrom: authorizer.validFrom,
    validUntil: authorizer.validUntil,
    status: authorizer.status,
  };
}

function validateContext(context) {
  const inspection = inspectHumanReleaseGateDecisionPolicy(context.decisionPolicy, context.packetContext);
  if (!inspection.ok) throw new Error(`human_decision_policy_invalid:${inspection.reason}`);
}

export function createReleaseGateExecutionAuthorizationPolicy({
  packetContext,
  decisionPolicy,
  trustedAuthorizers = [],
  maxAuthorizationDelaySeconds = 300,
  maxAuthorizationValiditySeconds = 900,
  minReasonLength = 12,
}) {
  validateContext({ packetContext, decisionPolicy });
  if (!Array.isArray(trustedAuthorizers)) throw new Error("trusted_execution_authorizers_invalid");
  const normalizedAuthorizers = trustedAuthorizers.map(validateAuthorizer).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(normalizedAuthorizers.map((item) => item.keyId)).size !== normalizedAuthorizers.length) throw new Error("duplicate_execution_authorizer_key_id");
  if (new Set(normalizedAuthorizers.map((item) => item.actorId)).size !== normalizedAuthorizers.length) throw new Error("duplicate_execution_authorizer_actor_id");
  if (!Number.isInteger(maxAuthorizationDelaySeconds) || maxAuthorizationDelaySeconds < 1 || maxAuthorizationDelaySeconds > 3600) throw new Error("max_authorization_delay_invalid");
  if (!Number.isInteger(maxAuthorizationValiditySeconds) || maxAuthorizationValiditySeconds < 1 || maxAuthorizationValiditySeconds > 3600) throw new Error("max_authorization_validity_invalid");
  if (!Number.isInteger(minReasonLength) || minReasonLength < 8 || minReasonLength > 200) throw new Error("min_authorization_reason_length_invalid");
  const payload = {
    schema: RELEASE_GATE_EXECUTION_AUTHORIZATION_POLICY_SCHEMA,
    compositionId: packetContext.decision.compositionId,
    compositionDecisionHash: packetContext.decision.decisionHash,
    evidencePlanHash: packetContext.plan.planHash,
    reviewPacketPolicyHash: packetContext.packetPolicy.policyHash,
    humanDecisionPolicyHash: decisionPolicy.policyHash,
    requiredDecisionRegisterStatus: "human_review_complete_approved",
    authorizerRole: RELEASE_GATE_EXECUTION_AUTHORIZER_ROLE,
    signatureAlgorithm: RELEASE_GATE_EXECUTION_AUTHORIZATION_SIGNATURE_ALGORITHM,
    trustedAuthorizers: normalizedAuthorizers,
    maxAuthorizationDelaySeconds,
    maxAuthorizationValiditySeconds,
    minReasonLength,
    exactDecisionRegisterBindingRequired: true,
    unanimousExplicitApprovalRequired: true,
    exactApprovedGateSetRequired: true,
    separateExecutionAuthorityRequired: true,
    oneShotAuthorizationRequired: true,
    reasonRequired: true,
    signatureRequired: true,
    automaticGateExecution: false,
    automaticReleaseApproval: false,
    automaticReleaseMemoryUpdate: false,
    automaticPackageGeneration: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectReleaseGateExecutionAuthorizationPolicy(policy, context) {
  try {
    const recreated = createReleaseGateExecutionAuthorizationPolicy({
      ...context,
      trustedAuthorizers: policy?.trustedAuthorizers,
      maxAuthorizationDelaySeconds: policy?.maxAuthorizationDelaySeconds,
      maxAuthorizationValiditySeconds: policy?.maxAuthorizationValiditySeconds,
      minReasonLength: policy?.minReasonLength,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "authorization_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "authorization_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedAuthorizers: recreated.trustedAuthorizers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "execution_authorization_policy_invalid" };
  }
}

function approvedTargets(register) {
  return register.modules.flatMap((module) => module.gates
    .filter((gate) => gate.decisionStatus === "approved")
    .map((gate) => ({
      moduleId: module.moduleId,
      revision: module.revision,
      entryHash: module.entryHash,
      gate: gate.gate,
      reviewerRole: gate.reviewerRole,
      decisionId: gate.decisionId,
      decisionHash: gate.decisionHash,
    })))
    .sort((a, b) => `${a.moduleId}:${a.gate}`.localeCompare(`${b.moduleId}:${b.gate}`));
}

function validateDecisionRegister({ packet, packetContext, decisionPolicy, decisions, decisionRegister }) {
  const inspection = inspectHumanReleaseGateDecisionRegister(decisionRegister, { packet, packetContext, decisionPolicy, decisions });
  if (!inspection.ok) throw new Error(`human_decision_register_invalid:${inspection.reason}`);
  if (decisionRegister.status !== "human_review_complete_approved") throw new Error("human_review_not_complete_approved");
  if (!decisionRegister.explicitReviewComplete || !decisionRegister.unanimousExplicitApproval) throw new Error("unanimous_explicit_approval_missing");
  if (decisionRegister.summary.eligibleGates < 1 || decisionRegister.summary.approvedGates !== decisionRegister.summary.eligibleGates) throw new Error("approved_gate_set_incomplete");
  if (decisionRegister.summary.rejectedGates !== 0 || decisionRegister.summary.missingDecisions !== 0) throw new Error("decision_register_contains_unapproved_gate");
  for (const key of ["gatesExecuted", "releaseApproved", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) {
    if (decisionRegister[key] !== false) throw new Error(`decision_register_${key}_must_be_false`);
  }
  return approvedTargets(decisionRegister);
}

function validateAuthorizationWindow({ decisionRegister, authorizationPolicy, signer, authorizedAt, expiresAt }) {
  assertIso(authorizedAt, "authorized_at");
  assertIso(expiresAt, "expires_at");
  const authorized = Date.parse(authorizedAt);
  const recorded = Date.parse(decisionRegister.recordedAt);
  const expires = Date.parse(expiresAt);
  if (authorized < recorded) throw new Error("authorization_before_decision_recording");
  if (authorized - recorded > authorizationPolicy.maxAuthorizationDelaySeconds * 1000) throw new Error("authorization_window_expired");
  if (expires <= authorized) throw new Error("authorization_expiry_invalid");
  if (expires - authorized > authorizationPolicy.maxAuthorizationValiditySeconds * 1000) throw new Error("authorization_validity_too_long");
  if (signer.status !== "active") throw new Error("execution_authorizer_inactive");
  if (signer.role !== authorizationPolicy.authorizerRole) throw new Error("execution_authorizer_role_mismatch");
  if (authorized < Date.parse(signer.validFrom) || expires > Date.parse(signer.validUntil)) throw new Error("execution_authorizer_key_outside_validity");
}

function signingPayload({ packet, decisionRegister, authorizationPolicy, authorizationId, signer, targets, reason, authorizedAt, expiresAt, nonce }) {
  return {
    signingSchema: "atlas.release-gate-execution-authorization-signing-payload.v1",
    compositionId: packet.compositionId,
    compositionDecisionHash: packet.compositionDecisionHash,
    packetHash: packet.packetHash,
    decisionRegisterHash: decisionRegister.registerHash,
    authorizationPolicyHash: authorizationPolicy.policyHash,
    authorizationId,
    authorizerKeyId: signer.keyId,
    authorizerActorId: signer.actorId,
    authorizerRole: signer.role,
    authorizationScope: "approved-gates-only",
    authorizedTargets: targets,
    reason,
    authorizedAt,
    expiresAt,
    nonce,
  };
}

export function createReleaseGateExecutionAuthorization({
  packet,
  packetContext,
  decisionPolicy,
  decisions,
  decisionRegister,
  authorizationPolicy,
  authorizationId,
  keyId,
  reason,
  authorizedAt,
  expiresAt,
  nonce,
  privateKey,
}) {
  const policyInspection = inspectReleaseGateExecutionAuthorizationPolicy(authorizationPolicy, { packetContext, decisionPolicy });
  if (!policyInspection.ok) throw new Error(`execution_authorization_policy_invalid:${policyInspection.reason}`);
  const targets = validateDecisionRegister({ packet, packetContext, decisionPolicy, decisions, decisionRegister });
  assertSlug(authorizationId, "authorization_id");
  assertSlug(keyId, "authorization_key_id");
  assertSlug(nonce, "authorization_nonce");
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  if (normalizedReason.length < authorizationPolicy.minReasonLength || normalizedReason.length > 2000) throw new Error("authorization_reason_invalid");
  const signer = authorizationPolicy.trustedAuthorizers.find((item) => item.keyId === keyId);
  if (!signer) throw new Error("execution_authorizer_untrusted");
  validateAuthorizationWindow({ decisionRegister, authorizationPolicy, signer, authorizedAt, expiresAt });
  const payload = signingPayload({ packet, decisionRegister, authorizationPolicy, authorizationId, signer, targets, reason: normalizedReason, authorizedAt, expiresAt, nonce });
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("authorization_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), signer.publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_execution_authorizer");
  const value = {
    schema: RELEASE_GATE_EXECUTION_AUTHORIZATION_SCHEMA,
    ...payload,
    signatureAlgorithm: RELEASE_GATE_EXECUTION_AUTHORIZATION_SIGNATURE_ALGORITHM,
    singleUseRequired: true,
    executionAuthorized: true,
    gatesExecuted: false,
    releaseApproved: false,
    releaseMemoryUpdated: false,
    packageGenerated: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  return { ...value, authorizationHash: digest(value) };
}

export function inspectReleaseGateExecutionAuthorization(value, {
  packet,
  packetContext,
  decisionPolicy,
  decisions,
  decisionRegister,
  authorizationPolicy,
  inspectedAt,
}) {
  try {
    if (value?.schema !== RELEASE_GATE_EXECUTION_AUTHORIZATION_SCHEMA) throw new Error("execution_authorization_schema_invalid");
    const policyInspection = inspectReleaseGateExecutionAuthorizationPolicy(authorizationPolicy, { packetContext, decisionPolicy });
    if (!policyInspection.ok) throw new Error(`execution_authorization_policy_invalid:${policyInspection.reason}`);
    const targets = validateDecisionRegister({ packet, packetContext, decisionPolicy, decisions, decisionRegister });
    assertSlug(value.authorizationId, "authorization_id");
    assertSlug(value.authorizerKeyId, "authorization_key_id");
    assertSlug(value.nonce, "authorization_nonce");
    if (typeof value.reason !== "string" || value.reason !== value.reason.trim() || value.reason.length < authorizationPolicy.minReasonLength || value.reason.length > 2000) throw new Error("authorization_reason_invalid");
    const signer = authorizationPolicy.trustedAuthorizers.find((item) => item.keyId === value.authorizerKeyId);
    if (!signer) throw new Error("execution_authorizer_untrusted");
    validateAuthorizationWindow({ decisionRegister, authorizationPolicy, signer, authorizedAt: value.authorizedAt, expiresAt: value.expiresAt });
    const payload = signingPayload({ packet, decisionRegister, authorizationPolicy, authorizationId: value.authorizationId, signer, targets, reason: value.reason, authorizedAt: value.authorizedAt, expiresAt: value.expiresAt, nonce: value.nonce });
    for (const [key, expected] of Object.entries(payload)) {
      if (JSON.stringify(value[key]) !== JSON.stringify(expected)) throw new Error(`execution_authorization_${key}_mismatch`);
    }
    if (value.signatureAlgorithm !== RELEASE_GATE_EXECUTION_AUTHORIZATION_SIGNATURE_ALGORITHM || typeof value.signature !== "string") throw new Error("authorization_signature_invalid");
    if (!cryptoVerify(null, bytes(payload), signer.publicKeyPem, Buffer.from(value.signature, "base64url"))) throw new Error("authorization_signature_verification_failed");
    for (const key of ["gatesExecuted", "releaseApproved", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) {
      if (value[key] !== false) throw new Error(`execution_authorization_${key}_must_be_false`);
    }
    if (value.singleUseRequired !== true || value.executionAuthorized !== true) throw new Error("execution_authorization_safety_contract_invalid");
    const hashPayload = { ...value };
    delete hashPayload.authorizationHash;
    if (digest(hashPayload) !== value.authorizationHash) throw new Error("execution_authorization_hash_mismatch");
    assertIso(inspectedAt, "inspected_at");
    if (Date.parse(inspectedAt) < Date.parse(value.authorizedAt)) throw new Error("execution_authorization_not_yet_active");
    if (Date.parse(inspectedAt) > Date.parse(value.expiresAt)) throw new Error("execution_authorization_expired");
    return { ok: true, authorizationHash: value.authorizationHash, authorizedTargets: targets.length, expiresAt: value.expiresAt };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "execution_authorization_invalid" };
  }
}
