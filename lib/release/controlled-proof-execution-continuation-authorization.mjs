import {
  createHash,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import {
  CONTROLLED_PROOF_EXECUTION_OBSERVATION_RECEIPT_SCHEMA,
  inspectControlledProofExecutionObservationMemory,
  inspectControlledProofExecutionObservationPolicy,
  inspectControlledProofExecutionObservationReceipt,
} from "./controlled-proof-execution-observation.mjs";

export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_POLICY_SCHEMA = "atlas.controlled-proof-execution-continuation-authorization-policy.v1";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_SCHEMA = "atlas.controlled-proof-execution-continuation-authorization.v1";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_MEMORY_SCHEMA = "atlas.controlled-proof-execution-continuation-authorization-memory.v1";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_MEMORY_ENTRY_SCHEMA = "atlas.controlled-proof-execution-continuation-authorization-memory-entry.v1";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_SIGNATURE_ALGORITHM = "ed25519";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZER_ROLE = "proof-continuation-authorizer";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function bytes(value) { return Buffer.from(JSON.stringify(canonical(value))); }
function digest(value) { return createHash("sha256").update(bytes(value)).digest("hex"); }
function assertHash(value, field) { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${field}_invalid`); }
function assertIso(value, field) { if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${field}_invalid`); }
function assertSlug(value, field) { if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`${field}_invalid`); }

function observationUpstreamContext(args) {
  return {
    controlledProofExecutionStartAuthorizationPolicy: args.controlledProofExecutionStartAuthorizationPolicy,
    controlledExternalPublicationExecutionPermitConsumptionPolicy: args.controlledExternalPublicationExecutionPermitConsumptionPolicy,
    controlledExternalPublicationExecutionPermitGrantPolicy: args.controlledExternalPublicationExecutionPermitGrantPolicy,
    controlledExternalPublicationExecutionAcceptancePolicy: args.controlledExternalPublicationExecutionAcceptancePolicy,
    controlledExternalPublicationExecutionHandoffPolicy: args.controlledExternalPublicationExecutionHandoffPolicy,
    controlledExternalPublicationAuthorizationConsumptionPolicy: args.controlledExternalPublicationAuthorizationConsumptionPolicy,
    controlledExternalPublicationAuthorizationGrantPolicy: args.controlledExternalPublicationAuthorizationGrantPolicy,
    controlledExternalPublicationReviewPolicy: args.controlledExternalPublicationReviewPolicy,
    publicationEvidenceAdjudicationPolicy: args.publicationEvidenceAdjudicationPolicy,
    executionPolicy: args.authorizedPublicationExecutionPolicy ?? args.executionPolicy,
    executionAuthorizationPolicy: args.executionAuthorizationPolicy,
    publicationPolicy: args.publicationPolicy,
    evidencePolicy: args.evidencePolicy,
    assemblyPolicy: args.assemblyPolicy,
    packageAuthorizationPolicy: args.packageAuthorizationPolicy,
  };
}

function observationPolicyContext(args) {
  return {
    controlledProofExecutionStartPolicy: args.controlledProofExecutionStartPolicy,
    trustedProofObservers: args.trustedProofObservers,
    maximumObservationDelaySeconds: args.maximumObservationDelaySeconds,
    ...observationUpstreamContext(args),
  };
}

function normalizeAuthorizer(authorizer) {
  if (!authorizer || typeof authorizer !== "object" || Array.isArray(authorizer)) throw new Error("controlled_proof_execution_continuation_authorizer_invalid");
  for (const field of ["keyId", "actorId"]) assertSlug(authorizer[field], `controlled_proof_execution_continuation_authorizer_${field}`);
  if (authorizer.role !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZER_ROLE) throw new Error("controlled_proof_execution_continuation_authorizer_role_invalid");
  if (!new Set(["active", "inactive"]).has(authorizer.status)) throw new Error("controlled_proof_execution_continuation_authorizer_status_invalid");
  assertIso(authorizer.validFrom, "controlled_proof_execution_continuation_authorizer_valid_from");
  assertIso(authorizer.validUntil, "controlled_proof_execution_continuation_authorizer_valid_until");
  if (Date.parse(authorizer.validUntil) <= Date.parse(authorizer.validFrom)) throw new Error("controlled_proof_execution_continuation_authorizer_validity_invalid");
  try {
    if (createPublicKey(authorizer.publicKeyPem).asymmetricKeyType !== "ed25519") throw new Error();
  } catch {
    throw new Error("controlled_proof_execution_continuation_authorizer_public_key_invalid");
  }
  return {
    keyId: authorizer.keyId,
    actorId: authorizer.actorId,
    role: authorizer.role,
    publicKeyPem: authorizer.publicKeyPem,
    status: authorizer.status,
    validFrom: authorizer.validFrom,
    validUntil: authorizer.validUntil,
  };
}

export function createControlledProofExecutionContinuationAuthorizationPolicy({
  controlledProofExecutionObservationPolicy: observationPolicy,
  trustedContinuationAuthorizers = [],
  maximumAuthorizationDelaySeconds = 300,
  maximumAuthorizationTtlSeconds = 300,
  ...upstream
}) {
  const observationInspection = inspectControlledProofExecutionObservationPolicy(observationPolicy, observationPolicyContext(upstream));
  if (!observationInspection.ok) throw new Error(`controlled_proof_execution_observation_policy_invalid:${observationInspection.reason}`);
  if (!Array.isArray(trustedContinuationAuthorizers)) throw new Error("trusted_continuation_authorizers_invalid");
  const authorizers = trustedContinuationAuthorizers.map(normalizeAuthorizer).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(authorizers.map((item) => item.keyId)).size !== authorizers.length) throw new Error("trusted_continuation_authorizer_key_id_duplicate");
  if (new Set(authorizers.map((item) => item.actorId)).size !== authorizers.length) throw new Error("trusted_continuation_authorizer_actor_id_duplicate");
  if (!Number.isInteger(maximumAuthorizationDelaySeconds) || maximumAuthorizationDelaySeconds < 1 || maximumAuthorizationDelaySeconds > 3600) {
    throw new Error("maximum_continuation_authorization_delay_seconds_invalid");
  }
  if (!Number.isInteger(maximumAuthorizationTtlSeconds) || maximumAuthorizationTtlSeconds < 1 || maximumAuthorizationTtlSeconds > 300) {
    throw new Error("maximum_continuation_authorization_ttl_seconds_invalid");
  }
  const payload = {
    schema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_POLICY_SCHEMA,
    compositionId: observationPolicy.compositionId,
    compositionDecisionHash: observationPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: observationPolicy.publicationDecisionPolicyHash,
    executionStartPolicyHash: observationPolicy.executionStartPolicyHash,
    observationPolicyHash: observationPolicy.policyHash,
    requiredObservationReceiptSchema: CONTROLLED_PROOF_EXECUTION_OBSERVATION_RECEIPT_SCHEMA,
    requiredMemoryEntrySchema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_MEMORY_ENTRY_SCHEMA,
    continuationAuthorizerRole: CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZER_ROLE,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_SIGNATURE_ALGORITHM,
    trustedContinuationAuthorizers: authorizers,
    maximumAuthorizationDelaySeconds,
    maximumAuthorizationTtlSeconds,
    recordedObservationRequired: true,
    exactObservationBindingRequired: true,
    exactObservationMemoryBindingRequired: true,
    exactExecutionStartBindingRequired: true,
    exactTargetExecutorBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    observationSignatureVerificationRequired: true,
    authorizerIndependenceRequired: true,
    authorizerValidityAcrossAuthorizationRequired: true,
    appendOnlyAuthorizationMemoryRequired: true,
    duplicateObservationAuthorizationRejected: true,
    atomicMemoryHeadBindingRequired: true,
    signedAuthorizationRequired: true,
    shortLivedAuthorizationRequired: true,
    singleUseAuthorizationRequired: true,
    maximumContinuations: 1,
    controlledProofExecutionContinuationAuthorizationAllowed: true,
    controlledProofExecutionContinuationAllowed: false,
    publicationExecutionAllowed: false,
    networkAccessAllowed: false,
    databaseMutationAllowed: false,
    externalPublicationAllowed: false,
    automaticPackageGeneration: false,
    automaticBuild: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

function continuationPolicyContext(args) {
  return {
    controlledProofExecutionObservationPolicy: args.controlledProofExecutionObservationPolicy,
    trustedContinuationAuthorizers: args.trustedContinuationAuthorizers,
    maximumAuthorizationDelaySeconds: args.maximumAuthorizationDelaySeconds,
    maximumAuthorizationTtlSeconds: args.maximumAuthorizationTtlSeconds,
    controlledProofExecutionStartPolicy: args.controlledProofExecutionStartPolicy,
    trustedProofObservers: args.trustedProofObservers,
    maximumObservationDelaySeconds: args.maximumObservationDelaySeconds,
    ...observationUpstreamContext(args),
  };
}

export function inspectControlledProofExecutionContinuationAuthorizationPolicy(policy, context) {
  try {
    const recreated = createControlledProofExecutionContinuationAuthorizationPolicy(context);
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "controlled_proof_execution_continuation_authorization_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "controlled_proof_execution_continuation_authorization_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedContinuationAuthorizers: recreated.trustedContinuationAuthorizers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_continuation_authorization_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedContinuationAuthorizations: entries.length,
      authorizedObservations: new Set(entries.map((entry) => entry.observationReceiptHash)).size,
      distinctAuthorizations: new Set(entries.map((entry) => entry.continuationAuthorizationHash)).size,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      controlledProofExecutionStarted: entries.length > 0,
      controlledProofExecutionObserved: entries.length > 0,
      controlledProofExecutionContinuationAuthorized: entries.length > 0,
      controlledProofExecutionContinued: false,
      publicationExecuted: false,
      externalPublicationExecuted: false,
      packageGenerated: false,
      buildExecuted: false,
      deployExecuted: false,
      releasePromoted: false,
    },
  };
}

function memoryHashForEntries(policy, entries) { return digest(memoryPayload({ policy, entries })); }

export function createControlledProofExecutionContinuationAuthorizationMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_POLICY_SCHEMA) throw new Error("controlled_proof_execution_continuation_authorization_memory_policy_invalid");
  assertHash(policy.policyHash, "controlled_proof_execution_continuation_authorization_memory_policy_hash");
  if (!Array.isArray(entries)) throw new Error("controlled_proof_execution_continuation_authorization_memory_entries_invalid");
  let previousEntryHash = null;
  const observationHashes = new Set();
  const authorizationIds = new Set();
  const nonces = new Set();
  const normalized = [];
  for (const [index, entry] of entries.entries()) {
    if (entry?.schema !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_MEMORY_ENTRY_SCHEMA) throw new Error("controlled_proof_execution_continuation_authorization_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("controlled_proof_execution_continuation_authorization_memory_chain_invalid");
    for (const field of [
      "continuationAuthorizationHash", "continuationAuthorizationPolicyHash", "continuationAuthorizationMemoryHashBefore",
      "observationReceiptHash", "observationPolicyHash", "observationMemoryHash", "executionStartReceiptHash",
      "executionStartPolicyHash", "executionStartMemoryHash", "packageSha256", "inventoryHash",
    ]) assertHash(entry[field], `controlled_proof_execution_continuation_authorization_memory_${field}`);
    for (const field of [
      "continuationAuthorizationId", "observationId", "executionStartId", "externalExecutorActorId",
      "observerActorId", "continuationAuthorizerActorId", "reasonCode", "nonce",
    ]) assertSlug(entry[field], `controlled_proof_execution_continuation_authorization_memory_${field}`);
    assertIso(entry.observedAt, "controlled_proof_execution_continuation_authorization_memory_observed_at");
    assertIso(entry.authorizedAt, "controlled_proof_execution_continuation_authorization_memory_authorized_at");
    assertIso(entry.expiresAt, "controlled_proof_execution_continuation_authorization_memory_expires_at");
    if (entry.continuationAuthorizationPolicyHash !== policy.policyHash) throw new Error("controlled_proof_execution_continuation_authorization_memory_policy_binding_mismatch");
    if (entry.continuationAuthorizationMemoryHashBefore !== memoryHashForEntries(policy, normalized)) throw new Error("controlled_proof_execution_continuation_authorization_memory_head_binding_mismatch");
    if (observationHashes.has(entry.observationReceiptHash)) throw new Error("controlled_proof_execution_observation_already_authorized_for_continuation");
    if (authorizationIds.has(entry.continuationAuthorizationId)) throw new Error("controlled_proof_execution_continuation_authorization_duplicate_id");
    if (nonces.has(entry.nonce)) throw new Error("controlled_proof_execution_continuation_authorization_duplicate_nonce");
    if (
      entry.observationVerified !== true || entry.observationRecorded !== true || entry.controlledProofExecutionStarted !== true ||
      entry.controlledProofExecutionObserved !== true || entry.controlledProofExecutionContinuationAuthorized !== true ||
      entry.singleUse !== true || entry.maximumContinuations !== 1 || entry.remainingContinuations !== 1
    ) throw new Error("controlled_proof_execution_continuation_authorization_memory_contract_invalid");
    for (const key of ["controlledProofExecutionContinued", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`controlled_proof_execution_continuation_authorization_memory_${key}_must_be_false`);
    }
    const entryPayload = { ...entry };
    delete entryPayload.entryHash;
    if (digest(entryPayload) !== entry.entryHash) throw new Error("controlled_proof_execution_continuation_authorization_memory_entry_hash_mismatch");
    normalized.push({ ...entry });
    observationHashes.add(entry.observationReceiptHash);
    authorizationIds.add(entry.continuationAuthorizationId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledProofExecutionContinuationAuthorizationMemory(memory, { policy }) {
  try {
    const recreated = createControlledProofExecutionContinuationAuthorizationMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "controlled_proof_execution_continuation_authorization_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "controlled_proof_execution_continuation_authorization_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, ...recreated.summary };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_continuation_authorization_memory_invalid" };
  }
}

function verifyContext(args) {
  const policyInspection = inspectControlledProofExecutionContinuationAuthorizationPolicy(
    args.controlledProofExecutionContinuationAuthorizationPolicy,
    continuationPolicyContext(args),
  );
  if (!policyInspection.ok) throw new Error(`controlled_proof_execution_continuation_authorization_policy_invalid:${policyInspection.reason}`);
  const memoryInspection = inspectControlledProofExecutionContinuationAuthorizationMemory(
    args.controlledProofExecutionContinuationAuthorizationMemory,
    { policy: args.controlledProofExecutionContinuationAuthorizationPolicy },
  );
  if (!memoryInspection.ok) throw new Error(`controlled_proof_execution_continuation_authorization_memory_invalid:${memoryInspection.reason}`);
  const observationMemoryInspection = inspectControlledProofExecutionObservationMemory(
    args.controlledProofExecutionObservationMemory,
    { policy: args.controlledProofExecutionObservationPolicy },
  );
  if (!observationMemoryInspection.ok) throw new Error(`controlled_proof_execution_observation_memory_invalid:${observationMemoryInspection.reason}`);
}

function validateWindow(observationReceipt, authorizer, authorizedAt, expiresAt, policy) {
  assertIso(authorizedAt, "controlled_proof_execution_continuation_authorized_at");
  assertIso(expiresAt, "controlled_proof_execution_continuation_expires_at");
  const authorized = Date.parse(authorizedAt);
  const expires = Date.parse(expiresAt);
  const observed = Date.parse(observationReceipt.observedAt);
  if (authorized < observed) throw new Error("controlled_proof_execution_continuation_authorization_before_observation");
  if (authorized > observed + (policy.maximumAuthorizationDelaySeconds * 1000)) throw new Error("controlled_proof_execution_continuation_authorization_window_expired");
  if (expires <= authorized || expires - authorized > policy.maximumAuthorizationTtlSeconds * 1000) throw new Error("controlled_proof_execution_continuation_authorization_ttl_invalid");
  if (authorizer.status !== "active") throw new Error("controlled_proof_execution_continuation_authorizer_inactive");
  if (authorized < Date.parse(authorizer.validFrom) || expires > Date.parse(authorizer.validUntil)) throw new Error("controlled_proof_execution_continuation_authorizer_key_outside_validity");
  if (
    authorizer.actorId === observationReceipt.observerActorId || authorizer.keyId === observationReceipt.observerKeyId ||
    authorizer.actorId === observationReceipt.externalExecutorActorId || authorizer.keyId === observationReceipt.externalExecutorKeyId
  ) throw new Error("controlled_proof_execution_continuation_authorizer_not_independent");
}

function signingPayload({ observationReceipt, observationMemory, policy, memoryHashBefore, authorizationId, authorizer, reasonCode, authorizedAt, expiresAt, nonce }) {
  if (!observationMemory.entries.some((entry) => entry.observationReceiptHash === observationReceipt.observationReceiptHash && entry.controlledProofExecutionObserved === true)) {
    throw new Error("controlled_proof_execution_observation_not_recorded");
  }
  return {
    signingSchema: "atlas.controlled-proof-execution-continuation-authorization-signing-payload.v1",
    compositionId: observationReceipt.compositionId,
    compositionDecisionHash: observationReceipt.compositionDecisionHash,
    publicationDecisionHash: observationReceipt.publicationDecisionHash,
    evidenceDecisionHash: observationReceipt.evidenceDecisionHash,
    packageSha256: observationReceipt.packageSha256,
    inventoryHash: observationReceipt.inventoryHash,
    executionStartReceiptHash: observationReceipt.executionStartReceiptHash,
    executionStartPolicyHash: observationReceipt.executionStartPolicyHash,
    executionStartMemoryHash: observationReceipt.executionStartMemoryHash,
    executionStartId: observationReceipt.executionStartId,
    externalExecutorKeyId: observationReceipt.externalExecutorKeyId,
    externalExecutorActorId: observationReceipt.externalExecutorActorId,
    observationReceiptHash: observationReceipt.observationReceiptHash,
    observationPolicyHash: observationReceipt.observationPolicyHash,
    observationMemoryHash: observationMemory.memoryHash,
    observationId: observationReceipt.observationId,
    observationKind: observationReceipt.observationKind,
    observerKeyId: observationReceipt.observerKeyId,
    observerActorId: observationReceipt.observerActorId,
    continuationAuthorizationPolicyHash: policy.policyHash,
    continuationAuthorizationMemoryHashBefore: memoryHashBefore,
    continuationAuthorizationId: authorizationId,
    continuationAuthorizerKeyId: authorizer.keyId,
    continuationAuthorizerActorId: authorizer.actorId,
    continuationAuthorizerRole: authorizer.role,
    reasonCode,
    observationVerified: true,
    observationRecorded: true,
    controlledProofExecutionStarted: true,
    controlledProofExecutionObserved: true,
    controlledProofExecutionContinuationAuthorized: true,
    observedAt: observationReceipt.observedAt,
    authorizedAt,
    expiresAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("controlled_proof_execution_continuation_authorization_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) {
    throw new Error("private_key_does_not_match_controlled_proof_execution_continuation_authorizer");
  }
  return signature;
}

export function authorizeControlledProofExecutionContinuation({
  controlledProofExecutionObservationReceipt: observationReceipt,
  controlledProofExecutionObservationMemory: observationMemory,
  controlledProofExecutionContinuationAuthorizationPolicy: policy,
  controlledProofExecutionContinuationAuthorizationMemory: memory,
  continuationAuthorizationId: authorizationId,
  continuationAuthorizerKeyId,
  continuationAuthorizerPrivateKey,
  reasonCode,
  authorizedAt,
  expiresAt,
  nonce,
  ...upstream
}) {
  const context = {
    ...upstream,
    controlledProofExecutionObservationMemory: observationMemory,
    controlledProofExecutionContinuationAuthorizationPolicy: policy,
    controlledProofExecutionContinuationAuthorizationMemory: memory,
  };
  verifyContext(context);
  if (observationReceipt?.schema !== CONTROLLED_PROOF_EXECUTION_OBSERVATION_RECEIPT_SCHEMA) throw new Error("controlled_proof_execution_observation_receipt_schema_invalid");
  const observationInspection = inspectControlledProofExecutionObservationReceipt(observationReceipt, {
    ...upstream,
    controlledProofExecutionObservationMemory: observationMemory,
  });
  if (!observationInspection.ok) throw new Error(`controlled_proof_execution_observation_receipt_invalid:${observationInspection.reason}`);
  assertSlug(authorizationId, "controlled_proof_execution_continuation_authorization_id");
  assertSlug(reasonCode, "controlled_proof_execution_continuation_authorization_reason_code");
  assertSlug(nonce, "controlled_proof_execution_continuation_authorization_nonce");
  const authorizer = policy.trustedContinuationAuthorizers.find((item) => item.keyId === continuationAuthorizerKeyId);
  if (!authorizer) throw new Error("controlled_proof_execution_continuation_authorizer_untrusted");
  validateWindow(observationReceipt, authorizer, authorizedAt, expiresAt, policy);
  if (memory.entries.some((entry) => entry.observationReceiptHash === observationReceipt.observationReceiptHash)) throw new Error("controlled_proof_execution_observation_already_authorized_for_continuation");
  if (memory.entries.some((entry) => entry.continuationAuthorizationId === authorizationId)) throw new Error("controlled_proof_execution_continuation_authorization_duplicate_id");
  if (memory.entries.some((entry) => entry.nonce === nonce)) throw new Error("controlled_proof_execution_continuation_authorization_duplicate_nonce");
  const memoryHashBefore = memory.memoryHash;
  const payload = signingPayload({ observationReceipt, observationMemory, policy, memoryHashBefore, authorizationId, authorizer, reasonCode, authorizedAt, expiresAt, nonce });
  const signature = signPayload(payload, continuationAuthorizerPrivateKey, authorizer.publicKeyPem);
  const unsigned = {
    schema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_SIGNATURE_ALGORITHM,
    continuationAuthorizationRecorded: true,
    singleUse: true,
    maximumContinuations: 1,
    remainingContinuations: 1,
    controlledProofExecutionContinued: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const continuationAuthorization = { ...unsigned, continuationAuthorizationHash: digest(unsigned) };
  const entryPayload = {
    schema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_MEMORY_ENTRY_SCHEMA,
    sequence: memory.entries.length + 1,
    previousEntryHash: memory.entries.at(-1)?.entryHash ?? null,
    continuationAuthorizationHash: continuationAuthorization.continuationAuthorizationHash,
    continuationAuthorizationPolicyHash: policy.policyHash,
    continuationAuthorizationMemoryHashBefore: memoryHashBefore,
    observationReceiptHash: observationReceipt.observationReceiptHash,
    observationPolicyHash: observationReceipt.observationPolicyHash,
    observationMemoryHash: observationMemory.memoryHash,
    executionStartReceiptHash: observationReceipt.executionStartReceiptHash,
    executionStartPolicyHash: observationReceipt.executionStartPolicyHash,
    executionStartMemoryHash: observationReceipt.executionStartMemoryHash,
    packageSha256: observationReceipt.packageSha256,
    inventoryHash: observationReceipt.inventoryHash,
    continuationAuthorizationId: authorizationId,
    observationId: observationReceipt.observationId,
    executionStartId: observationReceipt.executionStartId,
    externalExecutorActorId: observationReceipt.externalExecutorActorId,
    observerActorId: observationReceipt.observerActorId,
    continuationAuthorizerActorId: authorizer.actorId,
    reasonCode,
    observationVerified: true,
    observationRecorded: true,
    controlledProofExecutionStarted: true,
    controlledProofExecutionObserved: true,
    controlledProofExecutionContinuationAuthorized: true,
    singleUse: true,
    maximumContinuations: 1,
    remainingContinuations: 1,
    controlledProofExecutionContinued: false,
    observedAt: observationReceipt.observedAt,
    authorizedAt,
    expiresAt,
    nonce,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  const entry = { ...entryPayload, entryHash: digest(entryPayload) };
  return {
    continuationAuthorization,
    controlledProofExecutionContinuationAuthorizationMemory: createControlledProofExecutionContinuationAuthorizationMemory({
      policy,
      entries: [...memory.entries, entry],
    }),
  };
}

export function inspectControlledProofExecutionContinuationAuthorization(authorization, {
  controlledProofExecutionObservationReceipt: observationReceipt,
  controlledProofExecutionObservationMemory: observationMemory,
  controlledProofExecutionContinuationAuthorizationPolicy: policy,
  controlledProofExecutionContinuationAuthorizationMemory: memory,
  ...upstream
}) {
  try {
    if (authorization?.schema !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_SCHEMA) throw new Error("controlled_proof_execution_continuation_authorization_schema_invalid");
    const context = {
      ...upstream,
      controlledProofExecutionObservationMemory: observationMemory,
      controlledProofExecutionContinuationAuthorizationPolicy: policy,
      controlledProofExecutionContinuationAuthorizationMemory: memory,
    };
    verifyContext(context);
    const observationInspection = inspectControlledProofExecutionObservationReceipt(observationReceipt, {
      ...upstream,
      controlledProofExecutionObservationMemory: observationMemory,
    });
    if (!observationInspection.ok) throw new Error(`controlled_proof_execution_observation_receipt_invalid:${observationInspection.reason}`);
    const entryIndex = memory.entries.findIndex((entry) => entry.continuationAuthorizationHash === authorization.continuationAuthorizationHash);
    if (entryIndex < 0) throw new Error("controlled_proof_execution_continuation_authorization_not_recorded");
    const authorizer = policy.trustedContinuationAuthorizers.find((item) => item.keyId === authorization.continuationAuthorizerKeyId);
    if (!authorizer) throw new Error("controlled_proof_execution_continuation_authorizer_untrusted");
    validateWindow(observationReceipt, authorizer, authorization.authorizedAt, authorization.expiresAt, policy);
    const memoryHashBefore = memoryHashForEntries(policy, memory.entries.slice(0, entryIndex));
    const payload = signingPayload({
      observationReceipt,
      observationMemory,
      policy,
      memoryHashBefore,
      authorizationId: authorization.continuationAuthorizationId,
      authorizer,
      reasonCode: authorization.reasonCode,
      authorizedAt: authorization.authorizedAt,
      expiresAt: authorization.expiresAt,
      nonce: authorization.nonce,
    });
    for (const [key, expected] of Object.entries(payload)) {
      if (JSON.stringify(authorization[key]) !== JSON.stringify(expected)) throw new Error(`controlled_proof_execution_continuation_authorization_${key}_mismatch`);
    }
    if (authorization.signatureAlgorithm !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_SIGNATURE_ALGORITHM || typeof authorization.signature !== "string") {
      throw new Error("controlled_proof_execution_continuation_authorization_signature_invalid");
    }
    if (!cryptoVerify(null, bytes(payload), authorizer.publicKeyPem, Buffer.from(authorization.signature, "base64url"))) {
      throw new Error("controlled_proof_execution_continuation_authorization_signature_verification_failed");
    }
    if (
      authorization.observationVerified !== true || authorization.observationRecorded !== true || authorization.controlledProofExecutionStarted !== true ||
      authorization.controlledProofExecutionObserved !== true || authorization.controlledProofExecutionContinuationAuthorized !== true ||
      authorization.continuationAuthorizationRecorded !== true || authorization.singleUse !== true ||
      authorization.maximumContinuations !== 1 || authorization.remainingContinuations !== 1
    ) throw new Error("controlled_proof_execution_continuation_authorization_contract_invalid");
    for (const key of ["controlledProofExecutionContinued", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (authorization[key] !== false) throw new Error(`controlled_proof_execution_continuation_authorization_${key}_must_be_false`);
    }
    const hashPayload = { ...authorization };
    delete hashPayload.continuationAuthorizationHash;
    if (digest(hashPayload) !== authorization.continuationAuthorizationHash) throw new Error("controlled_proof_execution_continuation_authorization_hash_mismatch");
    const entry = memory.entries[entryIndex];
    if (
      entry.observationReceiptHash !== observationReceipt.observationReceiptHash ||
      entry.continuationAuthorizationMemoryHashBefore !== memoryHashBefore ||
      entry.continuationAuthorizerActorId !== authorizer.actorId
    ) throw new Error("controlled_proof_execution_continuation_authorization_memory_entry_mismatch");
    return {
      ok: true,
      continuationAuthorizationHash: authorization.continuationAuthorizationHash,
      observationReceiptHash: authorization.observationReceiptHash,
      controlledProofExecutionStarted: true,
      controlledProofExecutionObserved: true,
      controlledProofExecutionContinuationAuthorized: true,
      controlledProofExecutionContinued: false,
      publicationExecuted: false,
      externalPublicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_continuation_authorization_invalid" };
  }
}
