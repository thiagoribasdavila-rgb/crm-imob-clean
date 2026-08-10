import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  inspectApprovedReleaseMemory,
  inspectApprovedReleaseMemoryPolicy,
} from "./approved-release-memory-commitment.mjs";

export const APPROVED_RELEASE_PACKAGE_AUTHORIZATION_POLICY_SCHEMA = "atlas.approved-release-package-authorization-policy.v1";
export const APPROVED_RELEASE_PACKAGE_AUTHORIZATION_SCHEMA = "atlas.approved-release-package-authorization.v1";
export const APPROVED_RELEASE_PACKAGE_AUTHORIZATION_SIGNATURE_ALGORITHM = "ed25519";
export const APPROVED_RELEASE_PACKAGE_AUTHORIZER_ROLE = "release-approval-director";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function bytes(value) { return Buffer.from(JSON.stringify(canonical(value))); }
function digest(value) { return createHash("sha256").update(bytes(value)).digest("hex"); }
function assertIso(value, field) { if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${field}_invalid`); }
function assertHash(value, field) { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${field}_invalid`); }
function assertSlug(value, field) { if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`${field}_invalid`); }

function validatePackageName(packageName) {
  if (
    typeof packageName !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,118}\.zip$/.test(packageName)
    || packageName.includes("..")
    || packageName.includes("/")
    || packageName.includes("\\")
  ) throw new Error("package_name_invalid");
}

function normalizeAuthorizer(approver) {
  if (!approver || typeof approver !== "object" || Array.isArray(approver)) throw new Error("package_authorizer_invalid");
  assertSlug(approver.keyId, "package_authorizer_key_id");
  assertSlug(approver.actorId, "package_authorizer_actor_id");
  if (approver.role !== APPROVED_RELEASE_PACKAGE_AUTHORIZER_ROLE) throw new Error("package_authorizer_role_invalid");
  if (!["active", "inactive"].includes(approver.status)) throw new Error("package_authorizer_status_invalid");
  assertIso(approver.validFrom, "package_authorizer_valid_from");
  assertIso(approver.validUntil, "package_authorizer_valid_until");
  if (Date.parse(approver.validUntil) <= Date.parse(approver.validFrom)) throw new Error("package_authorizer_validity_invalid");
  try {
    const key = createPublicKey(approver.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch {
    throw new Error("package_authorizer_public_key_invalid");
  }
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

export function createApprovedReleasePackageAuthorizationPolicy({
  approvalPolicy,
  memoryPolicy,
  maxAuthorizationDelaySeconds = 300,
  maxAuthorizationValiditySeconds = 900,
  minReasonLength = 12,
  ...approvalContext
}) {
  const memoryPolicyInspection = inspectApprovedReleaseMemoryPolicy(memoryPolicy, { approvalPolicy, ...approvalContext });
  if (!memoryPolicyInspection.ok) throw new Error(`approved_release_memory_policy_invalid:${memoryPolicyInspection.reason}`);
  if (!Array.isArray(approvalPolicy?.trustedApprovers)) throw new Error("trusted_package_authorizers_invalid");
  const trustedPackageAuthorizers = approvalPolicy.trustedApprovers.map(normalizeAuthorizer).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(trustedPackageAuthorizers.map((item) => item.keyId)).size !== trustedPackageAuthorizers.length) throw new Error("duplicate_package_authorizer_key_id");
  if (new Set(trustedPackageAuthorizers.map((item) => item.actorId)).size !== trustedPackageAuthorizers.length) throw new Error("duplicate_package_authorizer_actor_id");
  if (!Number.isInteger(maxAuthorizationDelaySeconds) || maxAuthorizationDelaySeconds < 1 || maxAuthorizationDelaySeconds > 3600) throw new Error("max_package_authorization_delay_invalid");
  if (!Number.isInteger(maxAuthorizationValiditySeconds) || maxAuthorizationValiditySeconds < 1 || maxAuthorizationValiditySeconds > 3600) throw new Error("max_package_authorization_validity_invalid");
  if (!Number.isInteger(minReasonLength) || minReasonLength < 8 || minReasonLength > 200) throw new Error("min_package_authorization_reason_length_invalid");
  const payload = {
    schema: APPROVED_RELEASE_PACKAGE_AUTHORIZATION_POLICY_SCHEMA,
    compositionId: approvalPolicy.compositionId,
    compositionDecisionHash: approvalPolicy.compositionDecisionHash,
    finalApprovalPolicyHash: approvalPolicy.policyHash,
    approvedReleaseMemoryPolicyHash: memoryPolicy.policyHash,
    requiredMemoryEntrySchema: "atlas.approved-release-memory-entry.v1",
    authorizerRole: APPROVED_RELEASE_PACKAGE_AUTHORIZER_ROLE,
    signatureAlgorithm: APPROVED_RELEASE_PACKAGE_AUTHORIZATION_SIGNATURE_ALGORITHM,
    trustedPackageAuthorizers,
    maxAuthorizationDelaySeconds,
    maxAuthorizationValiditySeconds,
    minReasonLength,
    exactApprovedMemoryBindingRequired: true,
    exactApprovedMemoryEntryBindingRequired: true,
    sameApproverAsCommittedDecisionRequired: true,
    oneShotAuthorizationRequired: true,
    safeZipNameRequired: true,
    reasonRequired: true,
    signatureRequired: true,
    automaticPackageGeneration: false,
    automaticBuild: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectApprovedReleasePackageAuthorizationPolicy(policy, {
  approvalPolicy,
  memoryPolicy,
  ...approvalContext
}) {
  try {
    const recreated = createApprovedReleasePackageAuthorizationPolicy({
      approvalPolicy,
      memoryPolicy,
      ...approvalContext,
      maxAuthorizationDelaySeconds: policy?.maxAuthorizationDelaySeconds,
      maxAuthorizationValiditySeconds: policy?.maxAuthorizationValiditySeconds,
      minReasonLength: policy?.minReasonLength,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "package_authorization_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "package_authorization_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedPackageAuthorizers: recreated.trustedPackageAuthorizers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "package_authorization_policy_invalid" };
  }
}

function findApprovedEntry({ memory, approvedEntryHash }) {
  assertHash(approvedEntryHash, "approved_entry_hash");
  const entry = memory.entries.find((candidate) => candidate.entryHash === approvedEntryHash);
  if (!entry) throw new Error("approved_release_memory_entry_not_found");
  return entry;
}

function validateAuthorizationWindow({ entry, authorizationPolicy, signer, authorizedAt, expiresAt }) {
  assertIso(authorizedAt, "package_authorized_at");
  assertIso(expiresAt, "package_authorization_expires_at");
  const committed = Date.parse(entry.committedAt);
  const authorized = Date.parse(authorizedAt);
  const expires = Date.parse(expiresAt);
  if (authorized < committed) throw new Error("package_authorization_before_memory_commit");
  if (authorized - committed > authorizationPolicy.maxAuthorizationDelaySeconds * 1000) throw new Error("package_authorization_window_expired");
  if (expires <= authorized) throw new Error("package_authorization_expiry_invalid");
  if (expires - authorized > authorizationPolicy.maxAuthorizationValiditySeconds * 1000) throw new Error("package_authorization_validity_too_long");
  if (signer.status !== "active") throw new Error("package_authorizer_inactive");
  if (signer.role !== authorizationPolicy.authorizerRole) throw new Error("package_authorizer_role_mismatch");
  if (authorized < Date.parse(signer.validFrom) || expires > Date.parse(signer.validUntil)) throw new Error("package_authorizer_key_outside_validity");
}

function signingPayload({ memory, entry, authorizationPolicy, authorizationId, signer, packageName, reason, authorizedAt, expiresAt, nonce }) {
  return {
    signingSchema: "atlas.approved-release-package-authorization-signing-payload.v1",
    compositionId: entry.compositionId,
    compositionDecisionHash: entry.compositionDecisionHash,
    finalApprovalPolicyHash: entry.finalApprovalPolicyHash,
    approvedReleaseMemoryPolicyHash: memory.policyHash,
    approvedReleaseMemoryHash: memory.memoryHash,
    approvedReleaseMemoryEntryHash: entry.entryHash,
    finalApprovalDecisionHash: entry.finalApprovalDecisionHash,
    approvalId: entry.approvalId,
    authorizationPolicyHash: authorizationPolicy.policyHash,
    authorizationId,
    authorizerKeyId: signer.keyId,
    authorizerActorId: signer.actorId,
    authorizerRole: signer.role,
    authorizationScope: "approved-release-package-assembly-only",
    packageName,
    reason,
    authorizedAt,
    expiresAt,
    nonce,
  };
}

function validateInputs({ memory, memoryPolicy, approvalPolicy, authorizationPolicy, approvalContext }) {
  const policyInspection = inspectApprovedReleasePackageAuthorizationPolicy(authorizationPolicy, { approvalPolicy, memoryPolicy, ...approvalContext });
  if (!policyInspection.ok) throw new Error(`package_authorization_policy_invalid:${policyInspection.reason}`);
  const memoryInspection = inspectApprovedReleaseMemory(memory, { policy: memoryPolicy });
  if (!memoryInspection.ok) throw new Error(`approved_release_memory_invalid:${memoryInspection.reason}`);
}

export function createApprovedReleasePackageAuthorization({
  memory,
  memoryPolicy,
  approvalPolicy,
  packageAuthorizationPolicy,
  approvedEntryHash,
  authorizationId,
  keyId,
  packageName,
  reason,
  authorizedAt,
  expiresAt,
  nonce,
  privateKey,
  ...approvalContext
}) {
  validateInputs({ memory, memoryPolicy, approvalPolicy, authorizationPolicy: packageAuthorizationPolicy, approvalContext });
  const entry = findApprovedEntry({ memory, approvedEntryHash });
  assertSlug(authorizationId, "package_authorization_id");
  assertSlug(keyId, "package_authorization_key_id");
  assertSlug(nonce, "package_authorization_nonce");
  validatePackageName(packageName);
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  if (normalizedReason.length < packageAuthorizationPolicy.minReasonLength || normalizedReason.length > 2000) throw new Error("package_authorization_reason_invalid");
  const signer = packageAuthorizationPolicy.trustedPackageAuthorizers.find((item) => item.keyId === keyId);
  if (!signer) throw new Error("package_authorizer_untrusted");
  if (signer.keyId !== entry.approverKeyId || signer.actorId !== entry.approverActorId) throw new Error("package_authorizer_must_match_committed_approver");
  validateAuthorizationWindow({ entry, authorizationPolicy: packageAuthorizationPolicy, signer, authorizedAt, expiresAt });
  const payload = signingPayload({ memory, entry, authorizationPolicy: packageAuthorizationPolicy, authorizationId, signer, packageName, reason: normalizedReason, authorizedAt, expiresAt, nonce });
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("package_authorization_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), signer.publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_package_authorizer");
  const value = {
    schema: APPROVED_RELEASE_PACKAGE_AUTHORIZATION_SCHEMA,
    ...payload,
    signatureAlgorithm: APPROVED_RELEASE_PACKAGE_AUTHORIZATION_SIGNATURE_ALGORITHM,
    singleUseRequired: true,
    packageAssemblyAuthorized: true,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  return { ...value, authorizationHash: digest(value) };
}

export function inspectApprovedReleasePackageAuthorization(value, {
  memory,
  memoryPolicy,
  approvalPolicy,
  packageAuthorizationPolicy,
  inspectedAt,
  ...approvalContext
}) {
  try {
    if (value?.schema !== APPROVED_RELEASE_PACKAGE_AUTHORIZATION_SCHEMA) throw new Error("package_authorization_schema_invalid");
    validateInputs({ memory, memoryPolicy, approvalPolicy, authorizationPolicy: packageAuthorizationPolicy, approvalContext });
    const entry = findApprovedEntry({ memory, approvedEntryHash: value.approvedReleaseMemoryEntryHash });
    assertSlug(value.authorizationId, "package_authorization_id");
    assertSlug(value.authorizerKeyId, "package_authorization_key_id");
    assertSlug(value.nonce, "package_authorization_nonce");
    validatePackageName(value.packageName);
    if (typeof value.reason !== "string" || value.reason !== value.reason.trim() || value.reason.length < packageAuthorizationPolicy.minReasonLength || value.reason.length > 2000) throw new Error("package_authorization_reason_invalid");
    const signer = packageAuthorizationPolicy.trustedPackageAuthorizers.find((item) => item.keyId === value.authorizerKeyId);
    if (!signer) throw new Error("package_authorizer_untrusted");
    if (signer.keyId !== entry.approverKeyId || signer.actorId !== entry.approverActorId) throw new Error("package_authorizer_must_match_committed_approver");
    validateAuthorizationWindow({ entry, authorizationPolicy: packageAuthorizationPolicy, signer, authorizedAt: value.authorizedAt, expiresAt: value.expiresAt });
    const payload = signingPayload({ memory, entry, authorizationPolicy: packageAuthorizationPolicy, authorizationId: value.authorizationId, signer, packageName: value.packageName, reason: value.reason, authorizedAt: value.authorizedAt, expiresAt: value.expiresAt, nonce: value.nonce });
    for (const [key, expected] of Object.entries(payload)) {
      if (JSON.stringify(value[key]) !== JSON.stringify(expected)) throw new Error(`package_authorization_${key}_mismatch`);
    }
    if (value.signatureAlgorithm !== APPROVED_RELEASE_PACKAGE_AUTHORIZATION_SIGNATURE_ALGORITHM || typeof value.signature !== "string") throw new Error("package_authorization_signature_invalid");
    if (!cryptoVerify(null, bytes(payload), signer.publicKeyPem, Buffer.from(value.signature, "base64url"))) throw new Error("package_authorization_signature_verification_failed");
    for (const key of ["packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (value[key] !== false) throw new Error(`package_authorization_${key}_must_be_false`);
    }
    if (value.singleUseRequired !== true || value.packageAssemblyAuthorized !== true) throw new Error("package_authorization_safety_contract_invalid");
    const hashPayload = { ...value };
    delete hashPayload.authorizationHash;
    if (digest(hashPayload) !== value.authorizationHash) throw new Error("package_authorization_hash_mismatch");
    assertIso(inspectedAt, "package_authorization_inspected_at");
    if (Date.parse(inspectedAt) < Date.parse(value.authorizedAt)) throw new Error("package_authorization_not_yet_active");
    if (Date.parse(inspectedAt) > Date.parse(value.expiresAt)) throw new Error("package_authorization_expired");
    return { ok: true, authorizationHash: value.authorizationHash, packageName: value.packageName, expiresAt: value.expiresAt };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "package_authorization_invalid" };
  }
}
