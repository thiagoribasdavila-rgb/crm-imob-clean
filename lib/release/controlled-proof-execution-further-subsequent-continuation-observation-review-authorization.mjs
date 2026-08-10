import {
  createHash,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import {
  CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_RECEIPT_SCHEMA,
  inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory,
  inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy,
  inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewReceipt,
} from "./controlled-proof-execution-further-subsequent-continuation-observation-review.mjs";

export const CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_POLICY_SCHEMA = "atlas.controlled-proof-execution-further-subsequent-continuation-observation-review-authorization-policy.v1";
export const CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_SCHEMA = "atlas.controlled-proof-execution-further-subsequent-continuation-observation-review-authorization.v1";
export const CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_MEMORY_SCHEMA = "atlas.controlled-proof-execution-further-subsequent-continuation-observation-review-authorization-memory.v1";
export const CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_MEMORY_ENTRY_SCHEMA = "atlas.controlled-proof-execution-further-subsequent-continuation-observation-review-authorization-memory-entry.v1";
export const CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_SIGNATURE_ALGORITHM = "ed25519";
export const CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZER_ROLE = "further-subsequent-continuation-observation-review-authorizer";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function bytes(value) { return Buffer.from(JSON.stringify(canonical(value))); }
function digest(value) { return createHash("sha256").update(bytes(value)).digest("hex"); }
function assertHash(value, field) { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${field}_invalid`); }
function assertIso(value, field) { if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${field}_invalid`); }
function assertSlug(value, field) { if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`${field}_invalid`); }

function collectPriorIdentities(value, identities = new Set(), visited = new Set()) {
  if (!value || typeof value !== "object" || visited.has(value)) return identities;
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectPriorIdentities(item, identities, visited);
    return identities;
  }
  for (const [key, item] of Object.entries(value)) {
    if ((key === "keyId" || key === "actorId") && typeof item === "string") identities.add(item);
    else collectPriorIdentities(item, identities, visited);
  }
  return identities;
}

function normalizeAuthorizer(authorizer) {
  if (!authorizer || typeof authorizer !== "object" || Array.isArray(authorizer)) {
    throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorizer_invalid");
  }
  for (const field of ["keyId", "actorId", "role"]) {
    assertSlug(authorizer[field], `controlled_proof_execution_following_subsequent_continuation_observation_review_authorizer_${field}`);
  }
  if (authorizer.role !== CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZER_ROLE) {
    throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorizer_role_invalid");
  }
  if (!new Set(["active", "inactive"]).has(authorizer.status)) {
    throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorizer_status_invalid");
  }
  assertIso(authorizer.validFrom, "controlled_proof_execution_following_subsequent_continuation_observation_review_authorizer_valid_from");
  assertIso(authorizer.validUntil, "controlled_proof_execution_following_subsequent_continuation_observation_review_authorizer_valid_until");
  if (Date.parse(authorizer.validUntil) <= Date.parse(authorizer.validFrom)) {
    throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorizer_validity_invalid");
  }
  try {
    if (createPublicKey(authorizer.publicKeyPem).asymmetricKeyType !== "ed25519") throw new Error();
  } catch {
    throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorizer_public_key_invalid");
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

export function createControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy({
  controlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy: reviewPolicy,
  trustedReviewAuthorizers = [],
  maximumReviewAuthorizationDelaySeconds = 300,
  maximumReviewAuthorizationTtlSeconds = 300,
  ...upstream
}) {
  const reviewInspection = inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy(reviewPolicy, upstream);
  if (!reviewInspection.ok) {
    throw new Error(`controlled_proof_execution_following_subsequent_continuation_observation_review_policy_invalid:${reviewInspection.reason}`);
  }
  if (!Array.isArray(trustedReviewAuthorizers)) throw new Error("trusted_continuation_observation_review_authorizers_invalid");
  const authorizers = trustedReviewAuthorizers.map(normalizeAuthorizer).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(authorizers.map((item) => item.keyId)).size !== authorizers.length) {
    throw new Error("trusted_continuation_observation_review_authorizer_key_id_duplicate");
  }
  if (new Set(authorizers.map((item) => item.actorId)).size !== authorizers.length) {
    throw new Error("trusted_continuation_observation_review_authorizer_actor_id_duplicate");
  }
  const priorIdentities = collectPriorIdentities({ reviewPolicy, upstream });
  const collidingAuthorizer = authorizers.find(
    (item) => priorIdentities.has(item.keyId) || priorIdentities.has(item.actorId),
  );
  if (collidingAuthorizer) {
    const collisionKind = priorIdentities.has(collidingAuthorizer.keyId) ? "key" : "actor";
    throw new Error(
      `controlled_proof_execution_following_subsequent_continuation_observation_review_authorizer_must_be_independent:${collisionKind}`,
    );
  }
  if (!Number.isInteger(maximumReviewAuthorizationDelaySeconds) || maximumReviewAuthorizationDelaySeconds < 1 || maximumReviewAuthorizationDelaySeconds > 3600) {
    throw new Error("maximum_continuation_observation_review_authorization_delay_seconds_invalid");
  }
  if (!Number.isInteger(maximumReviewAuthorizationTtlSeconds) || maximumReviewAuthorizationTtlSeconds < 1 || maximumReviewAuthorizationTtlSeconds > 300) {
    throw new Error("maximum_continuation_observation_review_authorization_ttl_seconds_invalid");
  }
  const payload = {
    schema: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_POLICY_SCHEMA,
    compositionId: reviewPolicy.compositionId,
    compositionDecisionHash: reviewPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: reviewPolicy.publicationDecisionPolicyHash,
    executionStartPolicyHash: reviewPolicy.executionStartPolicyHash,
    executionObservationPolicyHash: reviewPolicy.executionObservationPolicyHash,
    continuationAuthorizationPolicyHash: reviewPolicy.continuationAuthorizationPolicyHash,
    continuationPolicyHash: reviewPolicy.continuationPolicyHash,
    continuationObservationPolicyHash: reviewPolicy.continuationObservationPolicyHash,
    reviewPolicyHash: reviewPolicy.policyHash,
    requiredReviewReceiptSchema: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_RECEIPT_SCHEMA,
    requiredMemoryEntrySchema: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_MEMORY_ENTRY_SCHEMA,
    reviewAuthorizerRole: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZER_ROLE,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_SIGNATURE_ALGORITHM,
    trustedReviewAuthorizers: authorizers,
    maximumReviewAuthorizationDelaySeconds,
    maximumReviewAuthorizationTtlSeconds,
    acceptedSignedRecordedReviewRequired: true,
    exactReviewReceiptBindingRequired: true,
    exactReviewPolicyBindingRequired: true,
    exactReviewMemoryBindingRequired: true,
    exactContinuationObservationBindingRequired: true,
    exactContinuationBindingRequired: true,
    exactPriorAuthorizationBindingRequired: true,
    exactPriorObservationBindingRequired: true,
    exactExecutionStartBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    reviewSignatureVerificationRequired: true,
    authorizerIndependenceRequired: true,
    authorizerValidityAcrossAuthorizationRequired: true,
    appendOnlyAuthorizationMemoryRequired: true,
    duplicateReviewAuthorizationRejected: true,
    atomicMemoryHeadBindingRequired: true,
    signedAuthorizationRequired: true,
    shortLivedAuthorizationRequired: true,
    singleUseAuthorizationRequired: true,
    maximumFurtherSubsequentContinuations: 1,
    followingSubsequentContinuationAuthorizationAllowed: true,
    followingSubsequentContinuationAllowed: false,
    publicationExecutionAllowed: false,
    networkAccessAllowed: false,
    databaseMutationAllowed: false,
    externalPublicationAllowed: false,
    automaticPublicationExecution: false,
    automaticPackageGeneration: false,
    automaticBuild: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy(policy, context) {
  try {
    const recreated = createControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy({
      ...context,
      trustedReviewAuthorizers: policy?.trustedReviewAuthorizers,
      maximumReviewAuthorizationDelaySeconds: policy?.maximumReviewAuthorizationDelaySeconds,
      maximumReviewAuthorizationTtlSeconds: policy?.maximumReviewAuthorizationTtlSeconds,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedReviewAuthorizers: recreated.trustedReviewAuthorizers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedReviewAuthorizations: entries.length,
      authorizedReviews: new Set(entries.map((entry) => entry.reviewReceiptHash)).size,
      distinctAuthorizations: new Set(entries.map((entry) => entry.reviewAuthorizationHash)).size,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      acceptedReviewsAuthorized: entries.filter((entry) => entry.reviewAccepted === true).length,
      followingSubsequentContinuationAuthorized: entries.length > 0,
      followingSubsequentContinuationExecuted: false,
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

export function createControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_POLICY_SCHEMA) {
    throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_memory_policy_invalid");
  }
  assertHash(policy.policyHash, "controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_memory_policy_hash");
  if (!Array.isArray(entries)) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_memory_entries_invalid");
  let previousEntryHash = null;
  const reviewHashes = new Set();
  const authorizationIds = new Set();
  const nonces = new Set();
  const normalized = [];
  for (const [index, entry] of entries.entries()) {
    if (entry?.schema !== CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_MEMORY_ENTRY_SCHEMA) {
      throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_memory_entry_schema_invalid");
    }
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) {
      throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_memory_chain_invalid");
    }
    for (const field of [
      "reviewAuthorizationHash", "reviewAuthorizationPolicyHash", "reviewAuthorizationMemoryHashBefore",
      "reviewReceiptHash", "reviewPolicyHash", "reviewMemoryHash",
      "followingSubsequentContinuationObservationReceiptHash", "followingSubsequentContinuationObservationPolicyHash",
      "followingSubsequentContinuationObservationMemoryHash", "followingSubsequentContinuationReceiptHash",
      "followingSubsequentContinuationPolicyHash", "followingSubsequentContinuationMemoryHash", "packageSha256", "inventoryHash",
    ]) assertHash(entry[field], `controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_memory_${field}`);
    for (const field of [
      "reviewAuthorizationId", "reviewId", "observationId", "followingSubsequentContinuationId",
      "executorActorId", "observerActorId", "reviewerActorId", "reviewAuthorizerActorId", "reasonCode", "nonce",
    ]) assertSlug(entry[field], `controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_memory_${field}`);
    for (const field of ["observedAt", "reviewedAt", "authorizedAt", "expiresAt"]) {
      assertIso(entry[field], `controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_memory_${field}`);
    }
    if (entry.reviewAuthorizationPolicyHash !== policy.policyHash) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_memory_policy_binding_mismatch");
    if (entry.reviewAuthorizationMemoryHashBefore !== memoryHashForEntries(policy, normalized)) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_memory_head_binding_mismatch");
    if (reviewHashes.has(entry.reviewReceiptHash)) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_already_authorized");
    if (authorizationIds.has(entry.reviewAuthorizationId)) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_duplicate_id");
    if (nonces.has(entry.nonce)) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_duplicate_nonce");
    if (
      entry.reviewReceiptVerified !== true || entry.reviewRecorded !== true || entry.reviewAccepted !== true ||
      entry.followingSubsequentContinuationObservationAccepted !== true || entry.followingSubsequentContinuationAuthorized !== true ||
      entry.singleUse !== true || entry.maximumFurtherSubsequentContinuations !== 1 || entry.remainingFurtherSubsequentContinuations !== 1
    ) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_memory_contract_invalid");
    for (const key of ["followingSubsequentContinuationExecuted", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_memory_${key}_must_be_false`);
    }
    const entryPayload = { ...entry };
    delete entryPayload.entryHash;
    if (digest(entryPayload) !== entry.entryHash) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_memory_entry_hash_mismatch");
    normalized.push({ ...entry });
    reviewHashes.add(entry.reviewReceiptHash);
    authorizationIds.add(entry.reviewAuthorizationId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory(memory, { policy }) {
  try {
    const recreated = createControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, ...recreated.summary };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_memory_invalid" };
  }
}

function policyContext(args) {
  const {
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy,
    trustedReviewAuthorizers,
    maximumReviewAuthorizationDelaySeconds,
    maximumReviewAuthorizationTtlSeconds,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory: _reviewMemory,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy: _authorizationPolicy,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory: _authorizationMemory,
    ...upstream
  } = args;
  return {
    ...upstream,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy,
    trustedReviewAuthorizers,
    maximumReviewAuthorizationDelaySeconds,
    maximumReviewAuthorizationTtlSeconds,
  };
}

function reviewContext(args) {
  const {
    trustedReviewAuthorizers: _trustedReviewAuthorizers,
    maximumReviewAuthorizationDelaySeconds: _maximumReviewAuthorizationDelaySeconds,
    maximumReviewAuthorizationTtlSeconds: _maximumReviewAuthorizationTtlSeconds,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy: _authorizationPolicy,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory: _authorizationMemory,
    ...reviewUpstream
  } = args;
  return reviewUpstream;
}

function verifyContext(args) {
  const policyInspection = inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy(
    args.controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy,
    policyContext(args),
  );
  if (!policyInspection.ok) throw new Error(`controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_policy_invalid:${policyInspection.reason}`);
  const authorizationMemoryInspection = inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory(
    args.controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory,
    { policy: args.controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy },
  );
  if (!authorizationMemoryInspection.ok) throw new Error(`controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_memory_invalid:${authorizationMemoryInspection.reason}`);
  const reviewMemoryInspection = inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory(
    args.controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory,
    { policy: args.controlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy },
  );
  if (!reviewMemoryInspection.ok) throw new Error(`controlled_proof_execution_following_subsequent_continuation_observation_review_memory_invalid:${reviewMemoryInspection.reason}`);
}

function validateWindow(reviewReceipt, authorizer, authorizedAt, expiresAt, policy) {
  assertIso(authorizedAt, "controlled_proof_execution_following_subsequent_continuation_observation_review_authorized_at");
  assertIso(expiresAt, "controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_expires_at");
  const authorized = Date.parse(authorizedAt);
  const expires = Date.parse(expiresAt);
  const reviewed = Date.parse(reviewReceipt.reviewedAt);
  if (authorized < reviewed) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_before_review");
  if (authorized > reviewed + (policy.maximumReviewAuthorizationDelaySeconds * 1000)) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_window_expired");
  if (expires <= authorized || expires - authorized > policy.maximumReviewAuthorizationTtlSeconds * 1000) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_ttl_invalid");
  if (authorizer.status !== "active") throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorizer_inactive");
  if (authorizer.role !== policy.reviewAuthorizerRole) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorizer_role_mismatch");
  if (authorized < Date.parse(authorizer.validFrom) || expires > Date.parse(authorizer.validUntil)) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorizer_key_outside_validity");
  const priorIdentities = collectPriorIdentities(reviewReceipt);
  if (priorIdentities.has(authorizer.keyId) || priorIdentities.has(authorizer.actorId)) {
    throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorizer_not_independent");
  }
}

function signingPayload({ reviewReceipt, reviewMemory, policy, memoryHashBefore, authorizationId, authorizer, reasonCode, authorizedAt, expiresAt, nonce }) {
  const reviewReceiptHash = reviewReceipt.followingSubsequentContinuationObservationReviewReceiptHash;
  const observation = reviewReceipt.observation;
  if (!reviewMemory.entries.some((entry) => entry.reviewReceiptHash === reviewReceiptHash && entry.reviewRecorded === true && entry.followingSubsequentContinuationObservationAccepted === true)) {
    throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_not_recorded_as_accepted");
  }
  if (reviewReceipt.outcome !== "accepted" || reviewReceipt.followingSubsequentContinuationObservationAccepted !== true || reviewReceipt.reviewRecorded !== true) {
    throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_not_accepted");
  }
  return {
    signingSchema: "atlas.controlled-proof-execution-further-subsequent-continuation-observation-review-authorization-signing-payload.v1",
    compositionId: observation.compositionId,
    packageSha256: observation.packageSha256,
    inventoryHash: observation.inventoryHash,
    followingSubsequentContinuationReceiptHash: observation.followingSubsequentContinuationReceiptHash,
    followingSubsequentContinuationPolicyHash: observation.followingSubsequentContinuationPolicyHash,
    followingSubsequentContinuationMemoryHash: observation.followingSubsequentContinuationMemoryHash,
    followingSubsequentContinuationId: observation.followingSubsequentContinuationId,
    executorKeyId: observation.executorKeyId,
    executorActorId: observation.executorActorId,
    followingSubsequentContinuationObservationReceiptHash: reviewReceipt.followingSubsequentContinuationObservationReceiptHash,
    followingSubsequentContinuationObservationPolicyHash: reviewReceipt.followingSubsequentContinuationObservationPolicyHash,
    followingSubsequentContinuationObservationMemoryHash: reviewReceipt.followingSubsequentContinuationObservationMemoryHash,
    observationId: observation.observationId,
    observationKind: observation.observationKind,
    observerKeyId: observation.observerKeyId,
    observerActorId: observation.observerActorId,
    reviewReceiptHash,
    reviewPolicyHash: reviewReceipt.reviewPolicyHash,
    reviewMemoryHash: reviewMemory.memoryHash,
    reviewId: reviewReceipt.reviewId,
    reviewerKeyId: reviewReceipt.reviewerKeyId,
    reviewerActorId: reviewReceipt.reviewerActorId,
    reviewOutcome: reviewReceipt.outcome,
    reviewAuthorizationPolicyHash: policy.policyHash,
    reviewAuthorizationMemoryHashBefore: memoryHashBefore,
    reviewAuthorizationId: authorizationId,
    reviewAuthorizerKeyId: authorizer.keyId,
    reviewAuthorizerActorId: authorizer.actorId,
    reviewAuthorizerRole: authorizer.role,
    reasonCode,
    reviewReceiptVerified: true,
    reviewRecorded: true,
    reviewAccepted: true,
    followingSubsequentContinuationObserved: true,
    followingSubsequentContinuationObservationAccepted: true,
    followingSubsequentContinuationAuthorized: true,
    reviewedAt: reviewReceipt.reviewedAt,
    authorizedAt,
    expiresAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) {
    throw new Error("private_key_does_not_match_controlled_proof_execution_following_subsequent_continuation_observation_review_authorizer");
  }
  return signature;
}

export function authorizeControlledProofExecutionFurtherSubsequentContinuationObservationReview({
  controlledProofExecutionFurtherSubsequentContinuationObservationReviewReceipt: reviewReceipt,
  controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory: reviewMemory,
  controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy: policy,
  controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory: memory,
  reviewAuthorizationId: authorizationId,
  reviewAuthorizerKeyId,
  reviewAuthorizerPrivateKey,
  reasonCode,
  authorizedAt,
  expiresAt,
  nonce,
  ...upstream
}) {
  const context = {
    ...upstream,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory: reviewMemory,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy: policy,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory: memory,
  };
  verifyContext(context);
  if (reviewReceipt?.schema !== CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_RECEIPT_SCHEMA) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_receipt_schema_invalid");
  const reviewInspection = inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewReceipt(reviewReceipt, reviewContext({
    ...upstream,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory: reviewMemory,
  }));
  if (!reviewInspection.ok) throw new Error(`controlled_proof_execution_following_subsequent_continuation_observation_review_receipt_invalid:${reviewInspection.reason}`);
  if (reviewInspection.outcome !== "accepted" || reviewInspection.followingSubsequentContinuationObservationAccepted !== true) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_not_accepted");
  for (const [value, field] of [[authorizationId, "id"], [reviewAuthorizerKeyId, "authorizer_key_id"], [reasonCode, "reason_code"], [nonce, "nonce"]]) {
    assertSlug(value, `controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_${field}`);
  }
  const authorizer = policy.trustedReviewAuthorizers.find((item) => item.keyId === reviewAuthorizerKeyId);
  if (!authorizer) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorizer_untrusted");
  validateWindow(reviewReceipt, authorizer, authorizedAt, expiresAt, policy);
  if (memory.entries.some((entry) => entry.reviewReceiptHash === reviewReceipt.followingSubsequentContinuationObservationReviewReceiptHash)) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_already_authorized");
  if (memory.entries.some((entry) => entry.reviewAuthorizationId === authorizationId)) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_duplicate_id");
  if (memory.entries.some((entry) => entry.nonce === nonce)) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_duplicate_nonce");
  const memoryHashBefore = memory.memoryHash;
  const payload = signingPayload({ reviewReceipt, reviewMemory, policy, memoryHashBefore, authorizationId, authorizer, reasonCode, authorizedAt, expiresAt, nonce });
  const signature = signPayload(payload, reviewAuthorizerPrivateKey, authorizer.publicKeyPem);
  const unsigned = {
    schema: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_SIGNATURE_ALGORITHM,
    reviewAuthorizationRecorded: true,
    singleUse: true,
    maximumFurtherSubsequentContinuations: 1,
    remainingFurtherSubsequentContinuations: 1,
    followingSubsequentContinuationExecuted: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const reviewAuthorization = { ...unsigned, reviewAuthorizationHash: digest(unsigned) };
  const entryPayload = {
    schema: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_MEMORY_ENTRY_SCHEMA,
    sequence: memory.entries.length + 1,
    previousEntryHash: memory.entries.at(-1)?.entryHash ?? null,
    reviewAuthorizationHash: reviewAuthorization.reviewAuthorizationHash,
    reviewAuthorizationPolicyHash: policy.policyHash,
    reviewAuthorizationMemoryHashBefore: memoryHashBefore,
    reviewReceiptHash: reviewReceipt.followingSubsequentContinuationObservationReviewReceiptHash,
    reviewPolicyHash: reviewReceipt.reviewPolicyHash,
    reviewMemoryHash: reviewMemory.memoryHash,
    followingSubsequentContinuationObservationReceiptHash: reviewReceipt.followingSubsequentContinuationObservationReceiptHash,
    followingSubsequentContinuationObservationPolicyHash: reviewReceipt.followingSubsequentContinuationObservationPolicyHash,
    followingSubsequentContinuationObservationMemoryHash: reviewReceipt.followingSubsequentContinuationObservationMemoryHash,
    followingSubsequentContinuationReceiptHash: reviewReceipt.observation.followingSubsequentContinuationReceiptHash,
    followingSubsequentContinuationPolicyHash: reviewReceipt.observation.followingSubsequentContinuationPolicyHash,
    followingSubsequentContinuationMemoryHash: reviewReceipt.observation.followingSubsequentContinuationMemoryHash,
    packageSha256: reviewReceipt.observation.packageSha256,
    inventoryHash: reviewReceipt.observation.inventoryHash,
    reviewAuthorizationId: authorizationId,
    reviewId: reviewReceipt.reviewId,
    observationId: reviewReceipt.observation.observationId,
    followingSubsequentContinuationId: reviewReceipt.observation.followingSubsequentContinuationId,
    executorActorId: reviewReceipt.observation.executorActorId,
    observerActorId: reviewReceipt.observation.observerActorId,
    reviewerActorId: reviewReceipt.reviewerActorId,
    reviewAuthorizerActorId: authorizer.actorId,
    reasonCode,
    reviewReceiptVerified: true,
    reviewRecorded: true,
    reviewAccepted: true,
    followingSubsequentContinuationObserved: true,
    followingSubsequentContinuationObservationAccepted: true,
    followingSubsequentContinuationAuthorized: true,
    singleUse: true,
    maximumFurtherSubsequentContinuations: 1,
    remainingFurtherSubsequentContinuations: 1,
    followingSubsequentContinuationExecuted: false,
    observedAt: reviewReceipt.observation.observedAt,
    reviewedAt: reviewReceipt.reviewedAt,
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
    reviewAuthorization,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory:
      createControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory({
        policy,
        entries: [...memory.entries, entry],
      }),
  };
}

export function inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorization(authorization, {
  controlledProofExecutionFurtherSubsequentContinuationObservationReviewReceipt: reviewReceipt,
  controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory: reviewMemory,
  controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy: policy,
  controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory: memory,
  ...upstream
}) {
  try {
    if (authorization?.schema !== CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_SCHEMA) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_schema_invalid");
    const context = {
      ...upstream,
      controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory: reviewMemory,
      controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy: policy,
      controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory: memory,
    };
    verifyContext(context);
    const reviewInspection = inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewReceipt(reviewReceipt, reviewContext({
      ...upstream,
      controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory: reviewMemory,
    }));
    if (!reviewInspection.ok) throw new Error(`controlled_proof_execution_following_subsequent_continuation_observation_review_receipt_invalid:${reviewInspection.reason}`);
    if (reviewInspection.outcome !== "accepted" || reviewInspection.followingSubsequentContinuationObservationAccepted !== true) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_not_accepted");
    const entryIndex = memory.entries.findIndex((entry) => entry.reviewAuthorizationHash === authorization.reviewAuthorizationHash);
    if (entryIndex < 0) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_not_recorded");
    const authorizer = policy.trustedReviewAuthorizers.find((item) => item.keyId === authorization.reviewAuthorizerKeyId);
    if (!authorizer) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorizer_untrusted");
    validateWindow(reviewReceipt, authorizer, authorization.authorizedAt, authorization.expiresAt, policy);
    const memoryHashBefore = memoryHashForEntries(policy, memory.entries.slice(0, entryIndex));
    const payload = signingPayload({
      reviewReceipt,
      reviewMemory,
      policy,
      memoryHashBefore,
      authorizationId: authorization.reviewAuthorizationId,
      authorizer,
      reasonCode: authorization.reasonCode,
      authorizedAt: authorization.authorizedAt,
      expiresAt: authorization.expiresAt,
      nonce: authorization.nonce,
    });
    for (const [key, expected] of Object.entries(payload)) {
      if (JSON.stringify(authorization[key]) !== JSON.stringify(expected)) throw new Error(`controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_${key}_mismatch`);
    }
    if (authorization.signatureAlgorithm !== CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_SIGNATURE_ALGORITHM || typeof authorization.signature !== "string") {
      throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_signature_invalid");
    }
    if (!cryptoVerify(null, bytes(payload), authorizer.publicKeyPem, Buffer.from(authorization.signature, "base64url"))) {
      throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_signature_verification_failed");
    }
    if (
      authorization.reviewReceiptVerified !== true || authorization.reviewRecorded !== true || authorization.reviewAccepted !== true ||
      authorization.followingSubsequentContinuationObservationAccepted !== true || authorization.followingSubsequentContinuationAuthorized !== true ||
      authorization.reviewAuthorizationRecorded !== true || authorization.singleUse !== true ||
      authorization.maximumFurtherSubsequentContinuations !== 1 || authorization.remainingFurtherSubsequentContinuations !== 1
    ) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_contract_invalid");
    for (const key of ["followingSubsequentContinuationExecuted", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (authorization[key] !== false) throw new Error(`controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_${key}_must_be_false`);
    }
    const hashPayload = { ...authorization };
    delete hashPayload.reviewAuthorizationHash;
    if (digest(hashPayload) !== authorization.reviewAuthorizationHash) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_hash_mismatch");
    const entry = memory.entries[entryIndex];
    if (
      entry.reviewReceiptHash !== reviewReceipt.followingSubsequentContinuationObservationReviewReceiptHash ||
      entry.reviewMemoryHash !== reviewMemory.memoryHash ||
      entry.reviewAuthorizationMemoryHashBefore !== memoryHashBefore ||
      entry.reviewAuthorizerActorId !== authorizer.actorId ||
      entry.reviewAccepted !== true
    ) throw new Error("controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_memory_entry_mismatch");
    return {
      ok: true,
      reviewAuthorizationHash: authorization.reviewAuthorizationHash,
      reviewReceiptHash: authorization.reviewReceiptHash,
      reviewAccepted: true,
      followingSubsequentContinuationAuthorized: true,
      followingSubsequentContinuationExecuted: false,
      publicationExecuted: false,
      externalPublicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_following_subsequent_continuation_observation_review_authorization_invalid" };
  }
}
