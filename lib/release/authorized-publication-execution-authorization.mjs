import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  inspectAuthorizedPackagePublicationDecision,
  inspectAuthorizedPackagePublicationDecisionMemory,
  inspectAuthorizedPackagePublicationDecisionPolicy,
} from "./authorized-package-publication-decision.mjs";

export const AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZATION_POLICY_SCHEMA = "atlas.authorized-publication-execution-authorization-policy.v1";
export const AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZATION_SCHEMA = "atlas.authorized-publication-execution-authorization.v1";
export const AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZATION_MEMORY_SCHEMA = "atlas.authorized-publication-execution-authorization-memory.v1";
export const AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZATION_MEMORY_ENTRY_SCHEMA = "atlas.authorized-publication-execution-authorization-memory-entry.v1";
export const AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZATION_SIGNATURE_ALGORITHM = "ed25519";
export const AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZER_ROLE = "release-publication-execution-authorizer";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function bytes(value) { return Buffer.from(JSON.stringify(canonical(value))); }
function digest(value) { return createHash("sha256").update(bytes(value)).digest("hex"); }
function assertIso(value, field) { if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${field}_invalid`); }
function assertHash(value, field) { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${field}_invalid`); }
function assertSlug(value, field) { if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`${field}_invalid`); }

function normalizeExecutionAuthorizer(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("publication_execution_authorizer_invalid");
  assertSlug(value.keyId, "publication_execution_authorizer_key_id");
  assertSlug(value.actorId, "publication_execution_authorizer_actor_id");
  if (value.role !== AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZER_ROLE) throw new Error("publication_execution_authorizer_role_invalid");
  if (!["active", "inactive"].includes(value.status)) throw new Error("publication_execution_authorizer_status_invalid");
  assertIso(value.validFrom, "publication_execution_authorizer_valid_from");
  assertIso(value.validUntil, "publication_execution_authorizer_valid_until");
  if (Date.parse(value.validUntil) <= Date.parse(value.validFrom)) throw new Error("publication_execution_authorizer_validity_invalid");
  try {
    const key = createPublicKey(value.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch {
    throw new Error("publication_execution_authorizer_public_key_invalid");
  }
  return {
    keyId: value.keyId,
    actorId: value.actorId,
    role: value.role,
    publicKeyPem: value.publicKeyPem,
    validFrom: value.validFrom,
    validUntil: value.validUntil,
    status: value.status,
  };
}

function priorIdentities({ publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy }) {
  return new Set([
    ...(publicationPolicy.trustedPublicationDirectors ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(evidencePolicy.trustedEvidenceCustodians ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(assemblyPolicy.trustedPackageAssemblers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(packageAuthorizationPolicy.trustedPackageAuthorizers ?? []).flatMap((item) => [item.keyId, item.actorId]),
  ]);
}

function verifyPublicationPolicy({ publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy }) {
  const inspection = inspectAuthorizedPackagePublicationDecisionPolicy(publicationPolicy, {
    evidencePolicy,
    assemblyPolicy,
    packageAuthorizationPolicy,
  });
  if (!inspection.ok) throw new Error(`publication_execution_publication_policy_invalid:${inspection.reason}`);
}

export function createAuthorizedPublicationExecutionAuthorizationPolicy({
  publicationPolicy,
  evidencePolicy,
  assemblyPolicy,
  packageAuthorizationPolicy,
  trustedExecutionAuthorizers = [],
  maxAuthorizationDelaySeconds = 600,
  maxAuthorizationValiditySeconds = 900,
  minReasonLength = 12,
}) {
  verifyPublicationPolicy({ publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy });
  if (!Array.isArray(trustedExecutionAuthorizers)) throw new Error("trusted_publication_execution_authorizers_invalid");
  const authorizers = trustedExecutionAuthorizers.map(normalizeExecutionAuthorizer).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(authorizers.map((item) => item.keyId)).size !== authorizers.length) throw new Error("duplicate_publication_execution_authorizer_key_id");
  if (new Set(authorizers.map((item) => item.actorId)).size !== authorizers.length) throw new Error("duplicate_publication_execution_authorizer_actor_id");
  const forbidden = priorIdentities({ publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy });
  if (authorizers.some((item) => forbidden.has(item.keyId) || forbidden.has(item.actorId))) {
    throw new Error("publication_execution_authorizer_must_be_independent");
  }
  if (!Number.isInteger(maxAuthorizationDelaySeconds) || maxAuthorizationDelaySeconds < 1 || maxAuthorizationDelaySeconds > 86_400) {
    throw new Error("max_publication_execution_authorization_delay_invalid");
  }
  if (!Number.isInteger(maxAuthorizationValiditySeconds) || maxAuthorizationValiditySeconds < 1 || maxAuthorizationValiditySeconds > 86_400) {
    throw new Error("max_publication_execution_authorization_validity_invalid");
  }
  if (!Number.isInteger(minReasonLength) || minReasonLength < 8 || minReasonLength > 200) {
    throw new Error("min_publication_execution_authorization_reason_length_invalid");
  }
  const payload = {
    schema: AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZATION_POLICY_SCHEMA,
    compositionId: publicationPolicy.compositionId,
    compositionDecisionHash: publicationPolicy.compositionDecisionHash,
    finalApprovalPolicyHash: publicationPolicy.finalApprovalPolicyHash,
    approvedReleaseMemoryPolicyHash: publicationPolicy.approvedReleaseMemoryPolicyHash,
    packageAuthorizationPolicyHash: publicationPolicy.packageAuthorizationPolicyHash,
    packageAssemblyPolicyHash: publicationPolicy.packageAssemblyPolicyHash,
    packageEvidencePolicyHash: publicationPolicy.packageEvidencePolicyHash,
    publicationDecisionPolicyHash: publicationPolicy.policyHash,
    requiredPublicationDecisionSchema: "atlas.authorized-package-publication-decision.v1",
    requiredPublicationDecisionMemoryEntrySchema: "atlas.authorized-package-publication-decision-memory-entry.v1",
    requiredMemoryEntrySchema: AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZATION_MEMORY_ENTRY_SCHEMA,
    authorizerRole: AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZER_ROLE,
    signatureAlgorithm: AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZATION_SIGNATURE_ALGORITHM,
    trustedExecutionAuthorizers: authorizers,
    maxAuthorizationDelaySeconds,
    maxAuthorizationValiditySeconds,
    minReasonLength,
    approvedPublicationDecisionRequired: true,
    exactPublicationDecisionBindingRequired: true,
    exactPublicationDecisionMemoryBindingRequired: true,
    exactEvidenceCommitmentBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    independentExecutionAuthorizerRequired: true,
    signatureRequired: true,
    appendOnlyAuthorizationMemoryRequired: true,
    duplicatePublicationDecisionAuthorizationRejected: true,
    duplicatePackageAuthorizationRejected: true,
    automaticPackageGeneration: false,
    automaticBuild: false,
    automaticPublication: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectAuthorizedPublicationExecutionAuthorizationPolicy(policy, context) {
  try {
    const recreated = createAuthorizedPublicationExecutionAuthorizationPolicy({
      ...context,
      trustedExecutionAuthorizers: policy?.trustedExecutionAuthorizers,
      maxAuthorizationDelaySeconds: policy?.maxAuthorizationDelaySeconds,
      maxAuthorizationValiditySeconds: policy?.maxAuthorizationValiditySeconds,
      minReasonLength: policy?.minReasonLength,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "publication_execution_authorization_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "publication_execution_authorization_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedExecutionAuthorizers: recreated.trustedExecutionAuthorizers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "publication_execution_authorization_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZATION_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedAuthorizations: entries.length,
      executionAuthorizedPackages: entries.filter((entry) => entry.executionAuthorized === true).length,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      publicationExecuted: false,
      buildExecuted: false,
      deployExecuted: false,
      releasePromoted: false,
    },
  };
}

export function createAuthorizedPublicationExecutionAuthorizationMemory({ policy, entries = [] }) {
  if (policy?.schema !== AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZATION_POLICY_SCHEMA) throw new Error("publication_execution_authorization_memory_policy_invalid");
  if (!Array.isArray(entries)) throw new Error("publication_execution_authorization_memory_entries_invalid");
  let previousEntryHash = null;
  const decisionHashes = new Set();
  const packageHashes = new Set();
  const authorizationIds = new Set();
  const nonces = new Set();
  const normalized = entries.map((entry, index) => {
    if (entry?.schema !== AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZATION_MEMORY_ENTRY_SCHEMA) throw new Error("publication_execution_authorization_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("publication_execution_authorization_memory_chain_invalid");
    assertHash(entry.authorizationHash, "publication_execution_authorization_memory_authorization_hash");
    assertHash(entry.publicationDecisionHash, "publication_execution_authorization_memory_publication_decision_hash");
    assertHash(entry.packageSha256, "publication_execution_authorization_memory_package_sha256");
    assertSlug(entry.authorizationId, "publication_execution_authorization_memory_authorization_id");
    assertSlug(entry.nonce, "publication_execution_authorization_memory_nonce");
    if (decisionHashes.has(entry.publicationDecisionHash)) throw new Error("publication_execution_duplicate_decision_authorization");
    if (packageHashes.has(entry.packageSha256)) throw new Error("publication_execution_duplicate_package_authorization");
    if (authorizationIds.has(entry.authorizationId) || nonces.has(entry.nonce)) throw new Error("publication_execution_duplicate_authorization_identity");
    if (entry.authorizationRecorded !== true || entry.publicationDecisionVerified !== true || entry.executionAuthorized !== true) {
      throw new Error("publication_execution_authorization_memory_safety_contract_invalid");
    }
    for (const key of ["publicationExecuted", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`publication_execution_authorization_memory_${key}_must_be_false`);
    }
    const hashPayload = { ...entry };
    delete hashPayload.entryHash;
    if (digest(hashPayload) !== entry.entryHash) throw new Error("publication_execution_authorization_memory_entry_hash_mismatch");
    decisionHashes.add(entry.publicationDecisionHash);
    packageHashes.add(entry.packageSha256);
    authorizationIds.add(entry.authorizationId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
    return { ...entry };
  });
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectAuthorizedPublicationExecutionAuthorizationMemory(memory, { policy }) {
  try {
    const recreated = createAuthorizedPublicationExecutionAuthorizationMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "publication_execution_authorization_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "publication_execution_authorization_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, recordedAuthorizations: recreated.entries.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "publication_execution_authorization_memory_invalid" };
  }
}

function verifyContext({
  authorizationPolicy,
  authorizationMemory,
  publicationPolicy,
  publicationMemory,
  evidencePolicy,
  assemblyPolicy,
  packageAuthorizationPolicy,
}) {
  const policyInspection = inspectAuthorizedPublicationExecutionAuthorizationPolicy(authorizationPolicy, {
    publicationPolicy,
    evidencePolicy,
    assemblyPolicy,
    packageAuthorizationPolicy,
  });
  if (!policyInspection.ok) throw new Error(`publication_execution_authorization_policy_invalid:${policyInspection.reason}`);
  const authorizationMemoryInspection = inspectAuthorizedPublicationExecutionAuthorizationMemory(authorizationMemory, { policy: authorizationPolicy });
  if (!authorizationMemoryInspection.ok) throw new Error(`publication_execution_authorization_memory_invalid:${authorizationMemoryInspection.reason}`);
  const publicationMemoryInspection = inspectAuthorizedPackagePublicationDecisionMemory(publicationMemory, { policy: publicationPolicy });
  if (!publicationMemoryInspection.ok) throw new Error(`publication_execution_publication_memory_invalid:${publicationMemoryInspection.reason}`);
}

function verifyPublicationDecision(publicationDecision, context) {
  const inspection = inspectAuthorizedPackagePublicationDecision(publicationDecision, context);
  if (!inspection.ok) throw new Error(`publication_execution_decision_invalid:${inspection.reason}`);
  if (inspection.outcome !== "approved" || inspection.publicationAuthorized !== true) {
    throw new Error("approved_publication_decision_required");
  }
}

function validateAuthorizationWindow({ publicationDecision, authorizationPolicy, authorizer, authorizedAt, expiresAt }) {
  assertIso(authorizedAt, "publication_execution_authorized_at");
  assertIso(expiresAt, "publication_execution_expires_at");
  const authorized = Date.parse(authorizedAt);
  const decided = Date.parse(publicationDecision.decidedAt);
  const expires = Date.parse(expiresAt);
  if (authorized < decided) throw new Error("publication_execution_authorization_before_publication_decision");
  if (authorized - decided > authorizationPolicy.maxAuthorizationDelaySeconds * 1000) throw new Error("publication_execution_authorization_window_expired");
  if (expires <= authorized || expires - authorized > authorizationPolicy.maxAuthorizationValiditySeconds * 1000) {
    throw new Error("publication_execution_authorization_validity_invalid");
  }
  if (authorizer.status !== "active") throw new Error("publication_execution_authorizer_inactive");
  if (authorizer.role !== authorizationPolicy.authorizerRole) throw new Error("publication_execution_authorizer_role_mismatch");
  if (authorized < Date.parse(authorizer.validFrom) || expires > Date.parse(authorizer.validUntil)) {
    throw new Error("publication_execution_authorizer_key_outside_validity");
  }
}

function normalizeReason(reason, policy) {
  const normalized = typeof reason === "string" ? reason.trim() : "";
  if (normalized.length < policy.minReasonLength || normalized.length > 2000) throw new Error("publication_execution_authorization_reason_invalid");
  return normalized;
}

function signingPayload({
  publicationDecision,
  publicationMemory,
  authorizationPolicy,
  authorizationId,
  authorizer,
  reason,
  authorizedAt,
  expiresAt,
  nonce,
}) {
  const publicationEntry = publicationMemory.entries.find((entry) => entry.decisionHash === publicationDecision.decisionHash);
  if (!publicationEntry) throw new Error("publication_execution_publication_decision_entry_not_found");
  return {
    signingSchema: "atlas.authorized-publication-execution-authorization-signing-payload.v1",
    compositionId: publicationDecision.compositionId,
    compositionDecisionHash: publicationDecision.compositionDecisionHash,
    finalApprovalPolicyHash: publicationDecision.finalApprovalPolicyHash,
    approvedReleaseMemoryHash: publicationDecision.approvedReleaseMemoryHash,
    packageAuthorizationPolicyHash: publicationDecision.packageAuthorizationPolicyHash,
    packageAssemblyPolicyHash: publicationDecision.packageAssemblyPolicyHash,
    packageAssemblyMemoryHash: publicationDecision.packageAssemblyMemoryHash,
    receiptHash: publicationDecision.receiptHash,
    packageAuthorizationHash: publicationDecision.authorizationHash,
    packageEvidencePolicyHash: publicationDecision.evidencePolicyHash,
    packageEvidenceMemoryHash: publicationDecision.evidenceMemoryHash,
    commitmentHash: publicationDecision.commitmentHash,
    packageName: publicationDecision.packageName,
    packageSha256: publicationDecision.packageSha256,
    packageSizeBytes: publicationDecision.packageSizeBytes,
    inventoryHash: publicationDecision.inventoryHash,
    inventoryFileCount: publicationDecision.inventoryFileCount,
    inventoryTotalBytes: publicationDecision.inventoryTotalBytes,
    publicationDecisionPolicyHash: publicationDecision.publicationDecisionPolicyHash,
    publicationDecisionMemoryHash: publicationMemory.memoryHash,
    publicationDecisionMemoryEntryHash: publicationEntry.entryHash,
    publicationDecisionHash: publicationDecision.decisionHash,
    publicationDecisionId: publicationDecision.decisionId,
    publicationDirectorKeyId: publicationDecision.directorKeyId,
    publicationDirectorActorId: publicationDecision.directorActorId,
    publicationDecisionOutcome: publicationDecision.outcome,
    executionAuthorizationPolicyHash: authorizationPolicy.policyHash,
    authorizationId,
    authorizerKeyId: authorizer.keyId,
    authorizerActorId: authorizer.actorId,
    authorizerRole: authorizer.role,
    reason,
    authorizedAt,
    expiresAt,
    nonce,
  };
}

function verifyIndependentAuthorizer(authorizer, context) {
  const forbidden = priorIdentities(context);
  if (forbidden.has(authorizer.keyId) || forbidden.has(authorizer.actorId)) {
    throw new Error("publication_execution_authorizer_must_be_independent");
  }
}

export function authorizeApprovedPackagePublicationExecution({
  publicationDecision,
  publicationPolicy,
  publicationMemory,
  executionAuthorizationPolicy,
  executionAuthorizationMemory,
  evidencePolicy,
  evidenceMemory,
  assemblyPolicy,
  packageAuthorizationPolicy,
  commitment,
  authorizationId,
  keyId,
  reason,
  authorizedAt,
  expiresAt,
  nonce,
  privateKey,
  ...publicationDecisionContext
}) {
  const authorizationPolicy = executionAuthorizationPolicy;
  const authorizationMemory = executionAuthorizationMemory;
  verifyContext({ authorizationPolicy, authorizationMemory, publicationPolicy, publicationMemory, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy });
  verifyPublicationDecision(publicationDecision, {
    publicationPolicy,
    publicationMemory,
    evidencePolicy,
    evidenceMemory,
    assemblyPolicy,
    packageAuthorizationPolicy,
    commitment,
    ...publicationDecisionContext,
  });
  assertSlug(authorizationId, "publication_execution_authorization_id");
  assertSlug(keyId, "publication_execution_authorizer_key_id");
  assertSlug(nonce, "publication_execution_authorization_nonce");
  const authorizer = authorizationPolicy.trustedExecutionAuthorizers.find((item) => item.keyId === keyId);
  if (!authorizer) throw new Error("publication_execution_authorizer_untrusted");
  verifyIndependentAuthorizer(authorizer, { publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy });
  validateAuthorizationWindow({ publicationDecision, authorizationPolicy, authorizer, authorizedAt, expiresAt });
  if (authorizationMemory.entries.some((entry) => entry.publicationDecisionHash === publicationDecision.decisionHash)) {
    throw new Error("publication_execution_duplicate_decision_authorization");
  }
  if (authorizationMemory.entries.some((entry) => entry.packageSha256 === publicationDecision.packageSha256)) {
    throw new Error("publication_execution_duplicate_package_authorization");
  }
  const normalizedReason = normalizeReason(reason, authorizationPolicy);
  const payload = signingPayload({
    publicationDecision,
    publicationMemory,
    authorizationPolicy,
    authorizationId,
    authorizer,
    reason: normalizedReason,
    authorizedAt,
    expiresAt,
    nonce,
  });
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("publication_execution_authorization_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), authorizer.publicKeyPem, Buffer.from(signature, "base64url"))) {
    throw new Error("private_key_does_not_match_publication_execution_authorizer");
  }
  const value = {
    schema: AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZATION_SCHEMA,
    ...payload,
    signatureAlgorithm: AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZATION_SIGNATURE_ALGORITHM,
    authorizationRecorded: true,
    publicationDecisionVerified: true,
    packageGenerated: true,
    executionAuthorized: true,
    publicationExecuted: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const authorization = { ...value, authorizationHash: digest(value) };
  const entryPayload = {
    schema: AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZATION_MEMORY_ENTRY_SCHEMA,
    sequence: authorizationMemory.entries.length + 1,
    previousEntryHash: authorizationMemory.entries.at(-1)?.entryHash ?? null,
    authorizationHash: authorization.authorizationHash,
    authorizationId: authorization.authorizationId,
    nonce: authorization.nonce,
    publicationDecisionHash: authorization.publicationDecisionHash,
    packageSha256: authorization.packageSha256,
    authorizerActorId: authorization.authorizerActorId,
    authorizedAt: authorization.authorizedAt,
    expiresAt: authorization.expiresAt,
    authorizationRecorded: true,
    publicationDecisionVerified: true,
    executionAuthorized: true,
    publicationExecuted: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  const entry = { ...entryPayload, entryHash: digest(entryPayload) };
  return {
    authorization,
    authorizationMemory: createAuthorizedPublicationExecutionAuthorizationMemory({
      policy: authorizationPolicy,
      entries: [...authorizationMemory.entries, entry],
    }),
  };
}

export function inspectAuthorizedPublicationExecutionAuthorization(authorization, {
  publicationDecision,
  publicationPolicy,
  publicationMemory,
  executionAuthorizationPolicy,
  executionAuthorizationMemory,
  evidencePolicy,
  evidenceMemory,
  assemblyPolicy,
  packageAuthorizationPolicy,
  commitment,
  ...publicationDecisionContext
}) {
  try {
    const authorizationPolicy = executionAuthorizationPolicy;
    const authorizationMemory = executionAuthorizationMemory;
    if (authorization?.schema !== AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZATION_SCHEMA) throw new Error("publication_execution_authorization_schema_invalid");
    verifyContext({ authorizationPolicy, authorizationMemory, publicationPolicy, publicationMemory, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy });
    verifyPublicationDecision(publicationDecision, {
      publicationPolicy,
      publicationMemory,
      evidencePolicy,
      evidenceMemory,
      assemblyPolicy,
      packageAuthorizationPolicy,
      commitment,
      ...publicationDecisionContext,
    });
    if (authorization.publicationDecisionHash !== publicationDecision.decisionHash) throw new Error("publication_execution_decision_hash_mismatch");
    assertSlug(authorization.authorizationId, "publication_execution_authorization_id");
    assertSlug(authorization.nonce, "publication_execution_authorization_nonce");
    const authorizer = authorizationPolicy.trustedExecutionAuthorizers.find((item) => item.keyId === authorization.authorizerKeyId);
    if (!authorizer) throw new Error("publication_execution_authorizer_untrusted");
    verifyIndependentAuthorizer(authorizer, { publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy });
    validateAuthorizationWindow({
      publicationDecision,
      authorizationPolicy,
      authorizer,
      authorizedAt: authorization.authorizedAt,
      expiresAt: authorization.expiresAt,
    });
    const normalizedReason = normalizeReason(authorization.reason, authorizationPolicy);
    const payload = signingPayload({
      publicationDecision,
      publicationMemory,
      authorizationPolicy,
      authorizationId: authorization.authorizationId,
      authorizer,
      reason: normalizedReason,
      authorizedAt: authorization.authorizedAt,
      expiresAt: authorization.expiresAt,
      nonce: authorization.nonce,
    });
    for (const [key, expected] of Object.entries(payload)) {
      if (JSON.stringify(authorization[key]) !== JSON.stringify(expected)) throw new Error(`publication_execution_${key}_mismatch`);
    }
    if (authorization.signatureAlgorithm !== AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZATION_SIGNATURE_ALGORITHM || typeof authorization.signature !== "string") {
      throw new Error("publication_execution_authorization_signature_invalid");
    }
    if (!cryptoVerify(null, bytes(payload), authorizer.publicKeyPem, Buffer.from(authorization.signature, "base64url"))) {
      throw new Error("publication_execution_authorization_signature_verification_failed");
    }
    if (authorization.authorizationRecorded !== true || authorization.publicationDecisionVerified !== true || authorization.executionAuthorized !== true) {
      throw new Error("publication_execution_authorization_contract_invalid");
    }
    if (authorization.packageGenerated !== true) throw new Error("publication_execution_package_generated_required");
    for (const key of ["publicationExecuted", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (authorization[key] !== false) throw new Error(`publication_execution_${key}_must_be_false`);
    }
    const hashPayload = { ...authorization };
    delete hashPayload.authorizationHash;
    if (digest(hashPayload) !== authorization.authorizationHash) throw new Error("publication_execution_authorization_hash_mismatch");
    if (!authorizationMemory.entries.some((entry) => entry.authorizationHash === authorization.authorizationHash && entry.publicationDecisionHash === authorization.publicationDecisionHash)) {
      throw new Error("publication_execution_authorization_not_recorded");
    }
    return {
      ok: true,
      authorizationHash: authorization.authorizationHash,
      executionAuthorized: true,
      publicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "publication_execution_authorization_invalid" };
  }
}
