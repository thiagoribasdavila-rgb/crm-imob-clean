import {
  createHash,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import {
  CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_RECEIPT_SCHEMA,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewMemory,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewPolicy,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewReceipt,
} from "./controlled-proof-execution-subsequent-continuation-observation-review.mjs";

export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_POLICY_SCHEMA = "atlas.controlled-proof-execution-subsequent-continuation-observation-review-authorization-policy.v1";
export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_SCHEMA = "atlas.controlled-proof-execution-subsequent-continuation-observation-review-authorization.v1";
export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_MEMORY_SCHEMA = "atlas.controlled-proof-execution-subsequent-continuation-observation-review-authorization-memory.v1";
export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_MEMORY_ENTRY_SCHEMA = "atlas.controlled-proof-execution-subsequent-continuation-observation-review-authorization-memory-entry.v1";
export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_SIGNATURE_ALGORITHM = "ed25519";
export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZER_ROLE = "subsequent-continuation-observation-review-authorizer";

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
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorizer_invalid");
  }
  for (const field of ["keyId", "actorId", "role"]) {
    assertSlug(authorizer[field], `controlled_proof_execution_subsequent_continuation_observation_review_authorizer_${field}`);
  }
  if (authorizer.role !== CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZER_ROLE) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorizer_role_invalid");
  }
  if (!new Set(["active", "inactive"]).has(authorizer.status)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorizer_status_invalid");
  }
  assertIso(authorizer.validFrom, "controlled_proof_execution_subsequent_continuation_observation_review_authorizer_valid_from");
  assertIso(authorizer.validUntil, "controlled_proof_execution_subsequent_continuation_observation_review_authorizer_valid_until");
  if (Date.parse(authorizer.validUntil) <= Date.parse(authorizer.validFrom)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorizer_validity_invalid");
  }
  try {
    if (createPublicKey(authorizer.publicKeyPem).asymmetricKeyType !== "ed25519") throw new Error();
  } catch {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorizer_public_key_invalid");
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

export function createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy({
  controlledProofExecutionSubsequentContinuationObservationReviewPolicy: reviewPolicy,
  trustedReviewAuthorizers = [],
  maximumReviewAuthorizationDelaySeconds = 300,
  maximumReviewAuthorizationTtlSeconds = 300,
  ...upstream
}) {
  const reviewInspection = inspectControlledProofExecutionSubsequentContinuationObservationReviewPolicy(reviewPolicy, upstream);
  if (!reviewInspection.ok) {
    throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_policy_invalid:${reviewInspection.reason}`);
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
      `controlled_proof_execution_subsequent_continuation_observation_review_authorizer_must_be_independent:${collisionKind}`,
    );
  }
  if (!Number.isInteger(maximumReviewAuthorizationDelaySeconds) || maximumReviewAuthorizationDelaySeconds < 1 || maximumReviewAuthorizationDelaySeconds > 3600) {
    throw new Error("maximum_continuation_observation_review_authorization_delay_seconds_invalid");
  }
  if (!Number.isInteger(maximumReviewAuthorizationTtlSeconds) || maximumReviewAuthorizationTtlSeconds < 1 || maximumReviewAuthorizationTtlSeconds > 300) {
    throw new Error("maximum_continuation_observation_review_authorization_ttl_seconds_invalid");
  }
  const payload = {
    schema: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_POLICY_SCHEMA,
    compositionId: reviewPolicy.compositionId,
    compositionDecisionHash: reviewPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: reviewPolicy.publicationDecisionPolicyHash,
    executionStartPolicyHash: reviewPolicy.executionStartPolicyHash,
    executionObservationPolicyHash: reviewPolicy.executionObservationPolicyHash,
    continuationAuthorizationPolicyHash: reviewPolicy.continuationAuthorizationPolicyHash,
    continuationPolicyHash: reviewPolicy.continuationPolicyHash,
    continuationObservationPolicyHash: reviewPolicy.continuationObservationPolicyHash,
    reviewPolicyHash: reviewPolicy.policyHash,
    requiredReviewReceiptSchema: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_RECEIPT_SCHEMA,
    requiredMemoryEntrySchema: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_MEMORY_ENTRY_SCHEMA,
    reviewAuthorizerRole: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZER_ROLE,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_SIGNATURE_ALGORITHM,
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
    maximumSubsequentContinuations: 1,
    subsequentContinuationAuthorizationAllowed: true,
    subsequentContinuationAllowed: false,
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

export function inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy(policy, context) {
  try {
    const recreated = createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy({
      ...context,
      trustedReviewAuthorizers: policy?.trustedReviewAuthorizers,
      maximumReviewAuthorizationDelaySeconds: policy?.maximumReviewAuthorizationDelaySeconds,
      maximumReviewAuthorizationTtlSeconds: policy?.maximumReviewAuthorizationTtlSeconds,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "controlled_proof_execution_subsequent_continuation_observation_review_authorization_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "controlled_proof_execution_subsequent_continuation_observation_review_authorization_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedReviewAuthorizers: recreated.trustedReviewAuthorizers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_subsequent_continuation_observation_review_authorization_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedReviewAuthorizations: entries.length,
      authorizedReviews: new Set(entries.map((entry) => entry.reviewReceiptHash)).size,
      distinctAuthorizations: new Set(entries.map((entry) => entry.reviewAuthorizationHash)).size,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      acceptedReviewsAuthorized: entries.filter((entry) => entry.reviewAccepted === true).length,
      subsequentContinuationAuthorized: entries.length > 0,
      subsequentContinuationExecuted: false,
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

export function createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_POLICY_SCHEMA) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_policy_invalid");
  }
  assertHash(policy.policyHash, "controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_policy_hash");
  if (!Array.isArray(entries)) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_entries_invalid");
  let previousEntryHash = null;
  const reviewHashes = new Set();
  const authorizationIds = new Set();
  const nonces = new Set();
  const normalized = [];
  for (const [index, entry] of entries.entries()) {
    if (entry?.schema !== CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_MEMORY_ENTRY_SCHEMA) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_entry_schema_invalid");
    }
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_chain_invalid");
    }
    for (const field of [
      "reviewAuthorizationHash", "reviewAuthorizationPolicyHash", "reviewAuthorizationMemoryHashBefore",
      "reviewReceiptHash", "reviewPolicyHash", "reviewMemoryHash",
      "subsequentContinuationObservationReceiptHash", "subsequentContinuationObservationPolicyHash",
      "subsequentContinuationObservationMemoryHash", "subsequentContinuationReceiptHash",
      "subsequentContinuationPolicyHash", "subsequentContinuationMemoryHash", "packageSha256", "inventoryHash",
    ]) assertHash(entry[field], `controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_${field}`);
    for (const field of [
      "reviewAuthorizationId", "reviewId", "observationId", "subsequentContinuationId",
      "executorActorId", "observerActorId", "reviewerActorId", "reviewAuthorizerActorId", "reasonCode", "nonce",
    ]) assertSlug(entry[field], `controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_${field}`);
    for (const field of ["observedAt", "reviewedAt", "authorizedAt", "expiresAt"]) {
      assertIso(entry[field], `controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_${field}`);
    }
    if (entry.reviewAuthorizationPolicyHash !== policy.policyHash) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_policy_binding_mismatch");
    if (entry.reviewAuthorizationMemoryHashBefore !== memoryHashForEntries(policy, normalized)) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_head_binding_mismatch");
    if (reviewHashes.has(entry.reviewReceiptHash)) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_already_authorized");
    if (authorizationIds.has(entry.reviewAuthorizationId)) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_duplicate_id");
    if (nonces.has(entry.nonce)) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_duplicate_nonce");
    if (
      entry.reviewReceiptVerified !== true || entry.reviewRecorded !== true || entry.reviewAccepted !== true ||
      entry.subsequentContinuationObservationAccepted !== true || entry.subsequentContinuationAuthorized !== true ||
      entry.singleUse !== true || entry.maximumSubsequentContinuations !== 1 || entry.remainingSubsequentContinuations !== 1
    ) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_contract_invalid");
    for (const key of ["subsequentContinuationExecuted", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_${key}_must_be_false`);
    }
    const entryPayload = { ...entry };
    delete entryPayload.entryHash;
    if (digest(entryPayload) !== entry.entryHash) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_entry_hash_mismatch");
    normalized.push({ ...entry });
    reviewHashes.add(entry.reviewReceiptHash);
    authorizationIds.add(entry.reviewAuthorizationId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory(memory, { policy }) {
  try {
    const recreated = createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, ...recreated.summary };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_invalid" };
  }
}

function policyContext(args) {
  const {
    controlledProofExecutionSubsequentContinuationObservationReviewPolicy,
    trustedReviewAuthorizers,
    maximumReviewAuthorizationDelaySeconds,
    maximumReviewAuthorizationTtlSeconds,
    controlledProofExecutionSubsequentContinuationObservationReviewMemory: _reviewMemory,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy: _authorizationPolicy,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory: _authorizationMemory,
    ...upstream
  } = args;
  return {
    ...upstream,
    controlledProofExecutionSubsequentContinuationObservationReviewPolicy,
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
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy: _authorizationPolicy,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory: _authorizationMemory,
    ...reviewUpstream
  } = args;
  return reviewUpstream;
}

function verifyContext(args) {
  const policyInspection = inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy(
    args.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy,
    policyContext(args),
  );
  if (!policyInspection.ok) throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_policy_invalid:${policyInspection.reason}`);
  const authorizationMemoryInspection = inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory(
    args.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory,
    { policy: args.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy },
  );
  if (!authorizationMemoryInspection.ok) throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_invalid:${authorizationMemoryInspection.reason}`);
  const reviewMemoryInspection = inspectControlledProofExecutionSubsequentContinuationObservationReviewMemory(
    args.controlledProofExecutionSubsequentContinuationObservationReviewMemory,
    { policy: args.controlledProofExecutionSubsequentContinuationObservationReviewPolicy },
  );
  if (!reviewMemoryInspection.ok) throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_memory_invalid:${reviewMemoryInspection.reason}`);
}

function validateWindow(reviewReceipt, authorizer, authorizedAt, expiresAt, policy) {
  assertIso(authorizedAt, "controlled_proof_execution_subsequent_continuation_observation_review_authorized_at");
  assertIso(expiresAt, "controlled_proof_execution_subsequent_continuation_observation_review_authorization_expires_at");
  const authorized = Date.parse(authorizedAt);
  const expires = Date.parse(expiresAt);
  const reviewed = Date.parse(reviewReceipt.reviewedAt);
  if (authorized < reviewed) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_before_review");
  if (authorized > reviewed + (policy.maximumReviewAuthorizationDelaySeconds * 1000)) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_window_expired");
  if (expires <= authorized || expires - authorized > policy.maximumReviewAuthorizationTtlSeconds * 1000) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_ttl_invalid");
  if (authorizer.status !== "active") throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorizer_inactive");
  if (authorizer.role !== policy.reviewAuthorizerRole) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorizer_role_mismatch");
  if (authorized < Date.parse(authorizer.validFrom) || expires > Date.parse(authorizer.validUntil)) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorizer_key_outside_validity");
  const priorIdentities = collectPriorIdentities(reviewReceipt);
  if (priorIdentities.has(authorizer.keyId) || priorIdentities.has(authorizer.actorId)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorizer_not_independent");
  }
}

function signingPayload({ reviewReceipt, reviewMemory, policy, memoryHashBefore, authorizationId, authorizer, reasonCode, authorizedAt, expiresAt, nonce }) {
  const reviewReceiptHash = reviewReceipt.subsequentContinuationObservationReviewReceiptHash;
  const observation = reviewReceipt.observation;
  if (!reviewMemory.entries.some((entry) => entry.reviewReceiptHash === reviewReceiptHash && entry.reviewRecorded === true && entry.subsequentContinuationObservationAccepted === true)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_not_recorded_as_accepted");
  }
  if (reviewReceipt.outcome !== "accepted" || reviewReceipt.subsequentContinuationObservationAccepted !== true || reviewReceipt.reviewRecorded !== true) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_not_accepted");
  }
  return {
    signingSchema: "atlas.controlled-proof-execution-subsequent-continuation-observation-review-authorization-signing-payload.v1",
    compositionId: observation.compositionId,
    packageSha256: observation.packageSha256,
    inventoryHash: observation.inventoryHash,
    subsequentContinuationReceiptHash: observation.subsequentContinuationReceiptHash,
    subsequentContinuationPolicyHash: observation.subsequentContinuationPolicyHash,
    subsequentContinuationMemoryHash: observation.subsequentContinuationMemoryHash,
    subsequentContinuationId: observation.subsequentContinuationId,
    executorKeyId: observation.executorKeyId,
    executorActorId: observation.executorActorId,
    subsequentContinuationObservationReceiptHash: reviewReceipt.subsequentContinuationObservationReceiptHash,
    subsequentContinuationObservationPolicyHash: reviewReceipt.subsequentContinuationObservationPolicyHash,
    subsequentContinuationObservationMemoryHash: reviewReceipt.subsequentContinuationObservationMemoryHash,
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
    subsequentContinuationObserved: true,
    subsequentContinuationObservationAccepted: true,
    subsequentContinuationAuthorized: true,
    reviewedAt: reviewReceipt.reviewedAt,
    authorizedAt,
    expiresAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) {
    throw new Error("private_key_does_not_match_controlled_proof_execution_subsequent_continuation_observation_review_authorizer");
  }
  return signature;
}

export function authorizeControlledProofExecutionSubsequentContinuationObservationReview({
  controlledProofExecutionSubsequentContinuationObservationReviewReceipt: reviewReceipt,
  controlledProofExecutionSubsequentContinuationObservationReviewMemory: reviewMemory,
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy: policy,
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory: memory,
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
    controlledProofExecutionSubsequentContinuationObservationReviewMemory: reviewMemory,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy: policy,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory: memory,
  };
  verifyContext(context);
  if (reviewReceipt?.schema !== CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_RECEIPT_SCHEMA) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_receipt_schema_invalid");
  const reviewInspection = inspectControlledProofExecutionSubsequentContinuationObservationReviewReceipt(reviewReceipt, reviewContext({
    ...upstream,
    controlledProofExecutionSubsequentContinuationObservationReviewMemory: reviewMemory,
  }));
  if (!reviewInspection.ok) throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_receipt_invalid:${reviewInspection.reason}`);
  if (reviewInspection.outcome !== "accepted" || reviewInspection.subsequentContinuationObservationAccepted !== true) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_not_accepted");
  for (const [value, field] of [[authorizationId, "id"], [reviewAuthorizerKeyId, "authorizer_key_id"], [reasonCode, "reason_code"], [nonce, "nonce"]]) {
    assertSlug(value, `controlled_proof_execution_subsequent_continuation_observation_review_authorization_${field}`);
  }
  const authorizer = policy.trustedReviewAuthorizers.find((item) => item.keyId === reviewAuthorizerKeyId);
  if (!authorizer) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorizer_untrusted");
  validateWindow(reviewReceipt, authorizer, authorizedAt, expiresAt, policy);
  if (memory.entries.some((entry) => entry.reviewReceiptHash === reviewReceipt.subsequentContinuationObservationReviewReceiptHash)) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_already_authorized");
  if (memory.entries.some((entry) => entry.reviewAuthorizationId === authorizationId)) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_duplicate_id");
  if (memory.entries.some((entry) => entry.nonce === nonce)) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_duplicate_nonce");
  const memoryHashBefore = memory.memoryHash;
  const payload = signingPayload({ reviewReceipt, reviewMemory, policy, memoryHashBefore, authorizationId, authorizer, reasonCode, authorizedAt, expiresAt, nonce });
  const signature = signPayload(payload, reviewAuthorizerPrivateKey, authorizer.publicKeyPem);
  const unsigned = {
    schema: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_SIGNATURE_ALGORITHM,
    reviewAuthorizationRecorded: true,
    singleUse: true,
    maximumSubsequentContinuations: 1,
    remainingSubsequentContinuations: 1,
    subsequentContinuationExecuted: false,
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
    schema: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_MEMORY_ENTRY_SCHEMA,
    sequence: memory.entries.length + 1,
    previousEntryHash: memory.entries.at(-1)?.entryHash ?? null,
    reviewAuthorizationHash: reviewAuthorization.reviewAuthorizationHash,
    reviewAuthorizationPolicyHash: policy.policyHash,
    reviewAuthorizationMemoryHashBefore: memoryHashBefore,
    reviewReceiptHash: reviewReceipt.subsequentContinuationObservationReviewReceiptHash,
    reviewPolicyHash: reviewReceipt.reviewPolicyHash,
    reviewMemoryHash: reviewMemory.memoryHash,
    subsequentContinuationObservationReceiptHash: reviewReceipt.subsequentContinuationObservationReceiptHash,
    subsequentContinuationObservationPolicyHash: reviewReceipt.subsequentContinuationObservationPolicyHash,
    subsequentContinuationObservationMemoryHash: reviewReceipt.subsequentContinuationObservationMemoryHash,
    subsequentContinuationReceiptHash: reviewReceipt.observation.subsequentContinuationReceiptHash,
    subsequentContinuationPolicyHash: reviewReceipt.observation.subsequentContinuationPolicyHash,
    subsequentContinuationMemoryHash: reviewReceipt.observation.subsequentContinuationMemoryHash,
    packageSha256: reviewReceipt.observation.packageSha256,
    inventoryHash: reviewReceipt.observation.inventoryHash,
    reviewAuthorizationId: authorizationId,
    reviewId: reviewReceipt.reviewId,
    observationId: reviewReceipt.observation.observationId,
    subsequentContinuationId: reviewReceipt.observation.subsequentContinuationId,
    executorActorId: reviewReceipt.observation.executorActorId,
    observerActorId: reviewReceipt.observation.observerActorId,
    reviewerActorId: reviewReceipt.reviewerActorId,
    reviewAuthorizerActorId: authorizer.actorId,
    reasonCode,
    reviewReceiptVerified: true,
    reviewRecorded: true,
    reviewAccepted: true,
    subsequentContinuationObserved: true,
    subsequentContinuationObservationAccepted: true,
    subsequentContinuationAuthorized: true,
    singleUse: true,
    maximumSubsequentContinuations: 1,
    remainingSubsequentContinuations: 1,
    subsequentContinuationExecuted: false,
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
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory:
      createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory({
        policy,
        entries: [...memory.entries, entry],
      }),
  };
}

export function inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorization(authorization, {
  controlledProofExecutionSubsequentContinuationObservationReviewReceipt: reviewReceipt,
  controlledProofExecutionSubsequentContinuationObservationReviewMemory: reviewMemory,
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy: policy,
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory: memory,
  ...upstream
}) {
  try {
    if (authorization?.schema !== CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_SCHEMA) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_schema_invalid");
    const context = {
      ...upstream,
      controlledProofExecutionSubsequentContinuationObservationReviewMemory: reviewMemory,
      controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy: policy,
      controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory: memory,
    };
    verifyContext(context);
    const reviewInspection = inspectControlledProofExecutionSubsequentContinuationObservationReviewReceipt(reviewReceipt, reviewContext({
      ...upstream,
      controlledProofExecutionSubsequentContinuationObservationReviewMemory: reviewMemory,
    }));
    if (!reviewInspection.ok) throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_receipt_invalid:${reviewInspection.reason}`);
    if (reviewInspection.outcome !== "accepted" || reviewInspection.subsequentContinuationObservationAccepted !== true) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_not_accepted");
    const entryIndex = memory.entries.findIndex((entry) => entry.reviewAuthorizationHash === authorization.reviewAuthorizationHash);
    if (entryIndex < 0) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_not_recorded");
    const authorizer = policy.trustedReviewAuthorizers.find((item) => item.keyId === authorization.reviewAuthorizerKeyId);
    if (!authorizer) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorizer_untrusted");
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
      if (JSON.stringify(authorization[key]) !== JSON.stringify(expected)) throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_${key}_mismatch`);
    }
    if (authorization.signatureAlgorithm !== CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_SIGNATURE_ALGORITHM || typeof authorization.signature !== "string") {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_signature_invalid");
    }
    if (!cryptoVerify(null, bytes(payload), authorizer.publicKeyPem, Buffer.from(authorization.signature, "base64url"))) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_signature_verification_failed");
    }
    if (
      authorization.reviewReceiptVerified !== true || authorization.reviewRecorded !== true || authorization.reviewAccepted !== true ||
      authorization.subsequentContinuationObservationAccepted !== true || authorization.subsequentContinuationAuthorized !== true ||
      authorization.reviewAuthorizationRecorded !== true || authorization.singleUse !== true ||
      authorization.maximumSubsequentContinuations !== 1 || authorization.remainingSubsequentContinuations !== 1
    ) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_contract_invalid");
    for (const key of ["subsequentContinuationExecuted", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (authorization[key] !== false) throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_${key}_must_be_false`);
    }
    const hashPayload = { ...authorization };
    delete hashPayload.reviewAuthorizationHash;
    if (digest(hashPayload) !== authorization.reviewAuthorizationHash) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_hash_mismatch");
    const entry = memory.entries[entryIndex];
    if (
      entry.reviewReceiptHash !== reviewReceipt.subsequentContinuationObservationReviewReceiptHash ||
      entry.reviewMemoryHash !== reviewMemory.memoryHash ||
      entry.reviewAuthorizationMemoryHashBefore !== memoryHashBefore ||
      entry.reviewAuthorizerActorId !== authorizer.actorId ||
      entry.reviewAccepted !== true
    ) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_entry_mismatch");
    return {
      ok: true,
      reviewAuthorizationHash: authorization.reviewAuthorizationHash,
      reviewReceiptHash: authorization.reviewReceiptHash,
      reviewAccepted: true,
      subsequentContinuationAuthorized: true,
      subsequentContinuationExecuted: false,
      publicationExecuted: false,
      externalPublicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_subsequent_continuation_observation_review_authorization_invalid" };
  }
}
