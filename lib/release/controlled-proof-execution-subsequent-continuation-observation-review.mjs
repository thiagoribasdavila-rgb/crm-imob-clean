import {
  createHash,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import {
  CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_RECEIPT_SCHEMA,
  inspectControlledProofExecutionSubsequentContinuationObservationMemory,
  inspectControlledProofExecutionSubsequentContinuationObservationPolicy,
  inspectControlledProofExecutionSubsequentContinuationObservationReceipt,
} from "./controlled-proof-execution-subsequent-continuation-observation.mjs";

export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_POLICY_SCHEMA =
  "atlas.controlled-proof-execution-subsequent-continuation-observation-review-policy.v1";
export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_RECEIPT_SCHEMA =
  "atlas.controlled-proof-execution-subsequent-continuation-observation-review-receipt.v1";
export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_MEMORY_SCHEMA =
  "atlas.controlled-proof-execution-subsequent-continuation-observation-review-memory.v1";
export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_MEMORY_ENTRY_SCHEMA =
  "atlas.controlled-proof-execution-subsequent-continuation-observation-review-memory-entry.v1";
export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_SIGNATURE_ALGORITHM = "ed25519";
export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEWER_ROLE =
  "controlled-proof-execution-subsequent-continuation-observation-reviewer";

const EFFECT_FIELDS = [
  "publicationExecuted",
  "externalPublicationExecuted",
  "packageGenerated",
  "buildExecuted",
  "deployExecuted",
  "releasePromoted",
];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function bytes(value) { return Buffer.from(JSON.stringify(canonical(value))); }
function digest(value) { return createHash("sha256").update(bytes(value)).digest("hex"); }
function assertHash(value, field) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${field}_invalid`);
}
function assertIso(value, field) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${field}_invalid`);
}
function assertSlug(value, field) {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`${field}_invalid`);
}

function normalizeReviewer(reviewer) {
  if (!reviewer || typeof reviewer !== "object" || Array.isArray(reviewer)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_reviewer_invalid");
  }
  assertSlug(reviewer.keyId, "controlled_proof_execution_subsequent_continuation_observation_reviewer_key_id");
  assertSlug(reviewer.actorId, "controlled_proof_execution_subsequent_continuation_observation_reviewer_actor_id");
  if (reviewer.role !== CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEWER_ROLE) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_reviewer_role_invalid");
  }
  if (!["active", "inactive"].includes(reviewer.status)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_reviewer_status_invalid");
  }
  assertIso(reviewer.validFrom, "controlled_proof_execution_subsequent_continuation_observation_reviewer_valid_from");
  assertIso(reviewer.validUntil, "controlled_proof_execution_subsequent_continuation_observation_reviewer_valid_until");
  if (Date.parse(reviewer.validUntil) <= Date.parse(reviewer.validFrom)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_reviewer_validity_invalid");
  }
  try {
    if (createPublicKey(reviewer.publicKeyPem).asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_reviewer_public_key_invalid");
  }
  return {
    keyId: reviewer.keyId,
    actorId: reviewer.actorId,
    role: reviewer.role,
    publicKeyPem: reviewer.publicKeyPem,
    status: reviewer.status,
    validFrom: reviewer.validFrom,
    validUntil: reviewer.validUntil,
  };
}

function collectIdentities(value, identities = new Set(), visited = new Set()) {
  if (!value || typeof value !== "object" || visited.has(value)) return identities;
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectIdentities(item, identities, visited);
    return identities;
  }
  for (const [key, nested] of Object.entries(value)) {
    if ((key.endsWith("KeyId") || key.endsWith("ActorId") || key === "keyId" || key === "actorId") &&
        typeof nested === "string") {
      identities.add(nested);
    } else if (nested && typeof nested === "object") {
      collectIdentities(nested, identities, visited);
    }
  }
  return identities;
}

function verifyObservationPolicy(policy, context) {
  const inspection = inspectControlledProofExecutionSubsequentContinuationObservationPolicy(policy, context);
  if (!inspection.ok) {
    throw new Error(`controlled_proof_execution_subsequent_continuation_observation_policy_invalid:${inspection.reason}`);
  }
}

export function createControlledProofExecutionSubsequentContinuationObservationReviewPolicy({
  controlledProofExecutionSubsequentContinuationObservationPolicy: observationPolicy,
  controlledProofExecutionSubsequentContinuationObservationPolicyContext: observationPolicyContext,
  trustedSubsequentContinuationObservationReviewers = [],
  maximumSubsequentContinuationObservationReviewDelaySeconds = 900,
  minimumSubsequentContinuationObservationReviewReasonLength = 12,
}) {
  verifyObservationPolicy(observationPolicy, observationPolicyContext);
  if (!Array.isArray(trustedSubsequentContinuationObservationReviewers)) {
    throw new Error("trusted_subsequent_continuation_observation_reviewers_invalid");
  }
  const reviewers = trustedSubsequentContinuationObservationReviewers.map(normalizeReviewer)
    .sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(reviewers.map((item) => item.keyId)).size !== reviewers.length) {
    throw new Error("trusted_subsequent_continuation_observation_reviewer_key_id_duplicate");
  }
  if (new Set(reviewers.map((item) => item.actorId)).size !== reviewers.length) {
    throw new Error("trusted_subsequent_continuation_observation_reviewer_actor_id_duplicate");
  }
  const priorIdentities = collectIdentities({ observationPolicy, observationPolicyContext });
  if (reviewers.some((item) => priorIdentities.has(item.keyId) || priorIdentities.has(item.actorId))) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_reviewer_must_be_independent");
  }
  if (!Number.isInteger(maximumSubsequentContinuationObservationReviewDelaySeconds) ||
      maximumSubsequentContinuationObservationReviewDelaySeconds < 1 ||
      maximumSubsequentContinuationObservationReviewDelaySeconds > 86400) {
    throw new Error("maximum_subsequent_continuation_observation_review_delay_seconds_invalid");
  }
  if (!Number.isInteger(minimumSubsequentContinuationObservationReviewReasonLength) ||
      minimumSubsequentContinuationObservationReviewReasonLength < 8 ||
      minimumSubsequentContinuationObservationReviewReasonLength > 500) {
    throw new Error("minimum_subsequent_continuation_observation_review_reason_length_invalid");
  }
  const payload = {
    schema: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_POLICY_SCHEMA,
    compositionId: observationPolicy.compositionId,
    compositionDecisionHash: observationPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: observationPolicy.publicationDecisionPolicyHash,
    executionStartPolicyHash: observationPolicy.executionStartPolicyHash,
    executionObservationPolicyHash: observationPolicy.executionObservationPolicyHash,
    continuationAuthorizationPolicyHash: observationPolicy.continuationAuthorizationPolicyHash,
    continuationPolicyHash: observationPolicy.continuationPolicyHash,
    continuationObservationPolicyHash: observationPolicy.continuationObservationPolicyHash,
    reviewPolicyHash: observationPolicy.reviewPolicyHash,
    reviewAuthorizationPolicyHash: observationPolicy.reviewAuthorizationPolicyHash,
    reviewAuthorizationConsumptionPolicyHash: observationPolicy.reviewAuthorizationConsumptionPolicyHash,
    subsequentContinuationPolicyHash: observationPolicy.subsequentContinuationPolicyHash,
    subsequentContinuationObservationPolicyHash: observationPolicy.policyHash,
    requiredObservationReceiptSchema: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_RECEIPT_SCHEMA,
    requiredMemoryEntrySchema: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_MEMORY_ENTRY_SCHEMA,
    reviewerRole: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEWER_ROLE,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_SIGNATURE_ALGORITHM,
    trustedSubsequentContinuationObservationReviewers: reviewers,
    allowedOutcomes: ["accepted", "rejected"],
    maximumSubsequentContinuationObservationReviewDelaySeconds,
    minimumSubsequentContinuationObservationReviewReasonLength,
    recordedObservationRequired: true,
    exactObservationReceiptBindingRequired: true,
    exactObservationPolicyBindingRequired: true,
    exactObservationMemoryBindingRequired: true,
    exactSubsequentContinuationBindingRequired: true,
    exactUpstreamChainBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    observationSignatureVerificationRequired: true,
    reviewerIndependenceRequired: true,
    reviewerValidityAtReviewRequired: true,
    appendOnlyReviewMemoryRequired: true,
    duplicateObservationReviewRejected: true,
    atomicMemoryHeadBindingRequired: true,
    signedReviewRequired: true,
    singleReviewPerObservationRequired: true,
    maximumReviewsPerObservation: 1,
    subsequentContinuationObservationReviewAllowed: true,
    subsequentContinuationObservationReviewAuthorizationAllowed: false,
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

export function inspectControlledProofExecutionSubsequentContinuationObservationReviewPolicy(policy, context) {
  try {
    const recreated = createControlledProofExecutionSubsequentContinuationObservationReviewPolicy({
      ...context,
      trustedSubsequentContinuationObservationReviewers: policy?.trustedSubsequentContinuationObservationReviewers,
      maximumSubsequentContinuationObservationReviewDelaySeconds:
        policy?.maximumSubsequentContinuationObservationReviewDelaySeconds,
      minimumSubsequentContinuationObservationReviewReasonLength:
        policy?.minimumSubsequentContinuationObservationReviewReasonLength,
    });
    if (recreated.policyHash !== policy?.policyHash) {
      return { ok: false, reason: "controlled_proof_execution_subsequent_continuation_observation_review_policy_hash_mismatch" };
    }
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) {
      return { ok: false, reason: "controlled_proof_execution_subsequent_continuation_observation_review_policy_contract_mismatch" };
    }
    return { ok: true, policyHash: recreated.policyHash, trustedReviewers: recreated.trustedSubsequentContinuationObservationReviewers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_subsequent_continuation_observation_review_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedReviews: entries.length,
      acceptedObservations: entries.filter((entry) => entry.outcome === "accepted").length,
      rejectedObservations: entries.filter((entry) => entry.outcome === "rejected").length,
      reviewedObservations: new Set(entries.map((entry) => entry.subsequentContinuationObservationReceiptHash)).size,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      subsequentContinuationObservationAccepted:
        entries.some((entry) => entry.subsequentContinuationObservationAccepted === true),
      subsequentContinuationObservationReviewAuthorizationAllowed: false,
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

export function createControlledProofExecutionSubsequentContinuationObservationReviewMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_POLICY_SCHEMA) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_memory_policy_invalid");
  }
  assertHash(policy.policyHash, "controlled_proof_execution_subsequent_continuation_observation_review_memory_policy_hash");
  if (!Array.isArray(entries)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_memory_entries_invalid");
  }
  let previousEntryHash = null;
  const receiptHashes = new Set();
  const reviewIds = new Set();
  const nonces = new Set();
  const normalized = [];
  for (const [index, entry] of entries.entries()) {
    if (entry?.schema !== CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_MEMORY_ENTRY_SCHEMA) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_memory_entry_schema_invalid");
    }
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_memory_chain_invalid");
    }
    for (const field of [
      "reviewReceiptHash",
      "reviewPolicyHash",
      "reviewMemoryHashBefore",
      "subsequentContinuationObservationReceiptHash",
      "subsequentContinuationObservationPolicyHash",
      "subsequentContinuationObservationMemoryHash",
      "subsequentContinuationReceiptHash",
      "subsequentContinuationPolicyHash",
      "subsequentContinuationMemoryHash",
      "packageSha256",
      "inventoryHash",
    ]) assertHash(entry[field], `controlled_proof_execution_subsequent_continuation_observation_review_memory_${field}`);
    for (const field of [
      "reviewId",
      "observationId",
      "subsequentContinuationId",
      "executorActorId",
      "observerActorId",
      "reviewerActorId",
      "reasonCode",
      "nonce",
    ]) assertSlug(entry[field], `controlled_proof_execution_subsequent_continuation_observation_review_memory_${field}`);
    assertIso(entry.observedAt, "controlled_proof_execution_subsequent_continuation_observation_review_memory_observed_at");
    assertIso(entry.reviewedAt, "controlled_proof_execution_subsequent_continuation_observation_review_memory_reviewed_at");
    if (entry.reviewPolicyHash !== policy.policyHash) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_memory_policy_binding_mismatch");
    }
    if (entry.reviewMemoryHashBefore !== memoryHashForEntries(policy, normalized)) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_memory_head_binding_mismatch");
    }
    if (!policy.allowedOutcomes.includes(entry.outcome)) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_outcome_invalid");
    }
    if (receiptHashes.has(entry.subsequentContinuationObservationReceiptHash)) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_already_reviewed");
    }
    if (reviewIds.has(entry.reviewId)) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_duplicate_id");
    }
    if (nonces.has(entry.nonce)) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_duplicate_nonce");
    }
    if (entry.reviewRecorded !== true || entry.observationReceiptVerified !== true ||
        entry.subsequentContinuationObserved !== true ||
        entry.subsequentContinuationObservationAccepted !== (entry.outcome === "accepted") ||
        entry.maximumReviewsPerObservation !== 1 || entry.remainingReviews !== 0) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_memory_contract_invalid");
    }
    if (entry.subsequentContinuationObservationReviewAuthorizationAllowed !== false) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_must_be_false");
    }
    for (const field of EFFECT_FIELDS) {
      if (entry[field] !== false) {
        throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_memory_${field}_must_be_false`);
      }
    }
    const entryPayload = { ...entry };
    delete entryPayload.entryHash;
    if (digest(entryPayload) !== entry.entryHash) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_memory_entry_hash_mismatch");
    }
    normalized.push({ ...entry });
    receiptHashes.add(entry.subsequentContinuationObservationReceiptHash);
    reviewIds.add(entry.reviewId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledProofExecutionSubsequentContinuationObservationReviewMemory(memory, { policy }) {
  try {
    const recreated = createControlledProofExecutionSubsequentContinuationObservationReviewMemory({
      policy,
      entries: memory?.entries,
    });
    if (recreated.memoryHash !== memory?.memoryHash) {
      return { ok: false, reason: "controlled_proof_execution_subsequent_continuation_observation_review_memory_hash_mismatch" };
    }
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) {
      return { ok: false, reason: "controlled_proof_execution_subsequent_continuation_observation_review_memory_contract_mismatch" };
    }
    return { ok: true, memoryHash: recreated.memoryHash, ...recreated.summary };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_subsequent_continuation_observation_review_memory_invalid" };
  }
}

function verifyContext(args) {
  const policyInspection = inspectControlledProofExecutionSubsequentContinuationObservationReviewPolicy(
    args.controlledProofExecutionSubsequentContinuationObservationReviewPolicy,
    {
      controlledProofExecutionSubsequentContinuationObservationPolicy:
        args.controlledProofExecutionSubsequentContinuationObservationPolicy,
      controlledProofExecutionSubsequentContinuationObservationPolicyContext:
        args.controlledProofExecutionSubsequentContinuationObservationPolicyContext,
    },
  );
  if (!policyInspection.ok) {
    throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_policy_invalid:${policyInspection.reason}`);
  }
  const observationMemoryInspection = inspectControlledProofExecutionSubsequentContinuationObservationMemory(
    args.controlledProofExecutionSubsequentContinuationObservationMemory,
    { policy: args.controlledProofExecutionSubsequentContinuationObservationPolicy },
  );
  if (!observationMemoryInspection.ok) {
    throw new Error(`controlled_proof_execution_subsequent_continuation_observation_memory_invalid:${observationMemoryInspection.reason}`);
  }
  const reviewMemoryInspection = inspectControlledProofExecutionSubsequentContinuationObservationReviewMemory(
    args.controlledProofExecutionSubsequentContinuationObservationReviewMemory,
    { policy: args.controlledProofExecutionSubsequentContinuationObservationReviewPolicy },
  );
  if (!reviewMemoryInspection.ok) {
    throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_memory_invalid:${reviewMemoryInspection.reason}`);
  }
}

function observationReceiptContext(args) {
  return {
    ...args.controlledProofExecutionSubsequentContinuationObservationReceiptContext,
    controlledProofExecutionSubsequentContinuationObservationPolicy:
      args.controlledProofExecutionSubsequentContinuationObservationPolicy,
    controlledProofExecutionSubsequentContinuationObservationMemory:
      args.controlledProofExecutionSubsequentContinuationObservationMemory,
  };
}

function verifyObservationReceipt(receipt, args) {
  const inspection = inspectControlledProofExecutionSubsequentContinuationObservationReceipt(
    receipt,
    observationReceiptContext(args),
  );
  if (!inspection.ok) {
    throw new Error(`controlled_proof_execution_subsequent_continuation_observation_receipt_invalid:${inspection.reason}`);
  }
}

function validateReviewWindow(receipt, reviewer, policy, reviewedAt, receiptContext) {
  assertIso(reviewedAt, "controlled_proof_execution_subsequent_continuation_observation_reviewed_at");
  const reviewed = Date.parse(reviewedAt);
  const observed = Date.parse(receipt.observedAt);
  if (reviewed < observed) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_before_observation");
  }
  if (reviewed > observed + policy.maximumSubsequentContinuationObservationReviewDelaySeconds * 1000) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_window_expired");
  }
  if (reviewer.status !== "active") {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_reviewer_inactive");
  }
  if (reviewed < Date.parse(reviewer.validFrom) || reviewed > Date.parse(reviewer.validUntil)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_reviewer_key_outside_validity");
  }
  const priorIdentities = collectIdentities({ receipt, receiptContext });
  if (priorIdentities.has(reviewer.keyId) || priorIdentities.has(reviewer.actorId)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_reviewer_not_independent");
  }
}

function validateOutcome(policy, outcome, reasonCode, reason) {
  if (!policy.allowedOutcomes.includes(outcome)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_outcome_invalid");
  }
  const expectedCode = outcome === "accepted"
    ? "subsequent-continuation-observation-confirmed"
    : "subsequent-continuation-observation-rejected";
  if (reasonCode !== expectedCode) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_reason_code_invalid");
  }
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  if (normalizedReason.length < policy.minimumSubsequentContinuationObservationReviewReasonLength ||
      normalizedReason.length > 2000) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_reason_invalid");
  }
  return {
    outcome,
    reasonCode,
    reason: normalizedReason,
    accepted: outcome === "accepted",
  };
}

function observationBinding(receipt) {
  const binding = { ...receipt };
  delete binding.schema;
  delete binding.signature;
  delete binding.subsequentContinuationObservationReceiptHash;
  return binding;
}

function signingPayload({
  observationReceipt,
  observationMemory,
  reviewPolicy,
  reviewMemoryHashBefore,
  reviewId,
  reviewer,
  verdict,
  reviewedAt,
  nonce,
}) {
  if (!observationMemory.entries.some((entry) =>
    entry.subsequentContinuationObservationReceiptHash ===
      observationReceipt.subsequentContinuationObservationReceiptHash &&
    entry.subsequentContinuationObserved === true)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_not_recorded");
  }
  return {
    signingSchema: "atlas.controlled-proof-execution-subsequent-continuation-observation-review-signing-payload.v1",
    observation: observationBinding(observationReceipt),
    subsequentContinuationObservationReceiptHash:
      observationReceipt.subsequentContinuationObservationReceiptHash,
    subsequentContinuationObservationPolicyHash:
      observationReceipt.subsequentContinuationObservationPolicyHash,
    subsequentContinuationObservationMemoryHash: observationMemory.memoryHash,
    reviewPolicyHash: reviewPolicy.policyHash,
    reviewMemoryHashBefore,
    reviewId,
    reviewerKeyId: reviewer.keyId,
    reviewerActorId: reviewer.actorId,
    reviewerRole: reviewer.role,
    outcome: verdict.outcome,
    reasonCode: verdict.reasonCode,
    reason: verdict.reason,
    reviewedAt,
    nonce,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_SIGNATURE_ALGORITHM,
    observationReceiptVerified: true,
    subsequentContinuationObserved: true,
    reviewRecorded: true,
    subsequentContinuationObservationAccepted: verdict.accepted,
    subsequentContinuationObservationReviewAuthorizationAllowed: false,
    maximumReviewsPerObservation: 1,
    remainingReviews: 0,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try {
    signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url");
  } catch {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_signature_creation_failed");
  }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) {
    throw new Error("private_key_does_not_match_controlled_proof_execution_subsequent_continuation_observation_reviewer");
  }
  return signature;
}

export function reviewControlledProofExecutionSubsequentContinuationObservation(args) {
  verifyContext(args);
  verifyObservationReceipt(args.controlledProofExecutionSubsequentContinuationObservationReceipt, args);
  const observationReceipt = args.controlledProofExecutionSubsequentContinuationObservationReceipt;
  const observationMemory = args.controlledProofExecutionSubsequentContinuationObservationMemory;
  const reviewPolicy = args.controlledProofExecutionSubsequentContinuationObservationReviewPolicy;
  const reviewMemory = args.controlledProofExecutionSubsequentContinuationObservationReviewMemory;
  assertSlug(args.reviewId, "controlled_proof_execution_subsequent_continuation_observation_review_id");
  assertSlug(args.reviewerKeyId, "controlled_proof_execution_subsequent_continuation_observation_reviewer_key_id");
  assertSlug(args.reviewNonce, "controlled_proof_execution_subsequent_continuation_observation_review_nonce");
  if (reviewMemory.entries.some((entry) => entry.subsequentContinuationObservationReceiptHash ===
      observationReceipt.subsequentContinuationObservationReceiptHash)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_already_reviewed");
  }
  if (reviewMemory.entries.some((entry) => entry.reviewId === args.reviewId)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_duplicate_id");
  }
  if (reviewMemory.entries.some((entry) => entry.nonce === args.reviewNonce)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_duplicate_nonce");
  }
  const reviewer = reviewPolicy.trustedSubsequentContinuationObservationReviewers
    .find((item) => item.keyId === args.reviewerKeyId);
  if (!reviewer) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_reviewer_untrusted");
  }
  validateReviewWindow(
    observationReceipt,
    reviewer,
    reviewPolicy,
    args.reviewedAt,
    args.controlledProofExecutionSubsequentContinuationObservationReceiptContext,
  );
  const verdict = validateOutcome(reviewPolicy, args.outcome, args.reasonCode, args.reason);
  const reviewMemoryHashBefore = reviewMemory.memoryHash;
  const payload = signingPayload({
    observationReceipt,
    observationMemory,
    reviewPolicy,
    reviewMemoryHashBefore,
    reviewId: args.reviewId,
    reviewer,
    verdict,
    reviewedAt: args.reviewedAt,
    nonce: args.reviewNonce,
  });
  const signature = signPayload(payload, args.reviewerPrivateKey, reviewer.publicKeyPem);
  const unsigned = {
    schema: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_RECEIPT_SCHEMA,
    ...payload,
    signature,
  };
  const reviewReceipt = {
    ...unsigned,
    subsequentContinuationObservationReviewReceiptHash: digest(unsigned),
  };
  const entryPayload = {
    schema: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_MEMORY_ENTRY_SCHEMA,
    sequence: reviewMemory.entries.length + 1,
    previousEntryHash: reviewMemory.entries.at(-1)?.entryHash ?? null,
    reviewReceiptHash: reviewReceipt.subsequentContinuationObservationReviewReceiptHash,
    reviewPolicyHash: reviewPolicy.policyHash,
    reviewMemoryHashBefore,
    subsequentContinuationObservationReceiptHash:
      observationReceipt.subsequentContinuationObservationReceiptHash,
    subsequentContinuationObservationPolicyHash:
      observationReceipt.subsequentContinuationObservationPolicyHash,
    subsequentContinuationObservationMemoryHash: observationMemory.memoryHash,
    subsequentContinuationReceiptHash: observationReceipt.subsequentContinuationReceiptHash,
    subsequentContinuationPolicyHash: observationReceipt.subsequentContinuationPolicyHash,
    subsequentContinuationMemoryHash: observationReceipt.subsequentContinuationMemoryHash,
    packageSha256: observationReceipt.packageSha256,
    inventoryHash: observationReceipt.inventoryHash,
    reviewId: args.reviewId,
    observationId: observationReceipt.observationId,
    subsequentContinuationId: observationReceipt.subsequentContinuationId,
    executorActorId: observationReceipt.executorActorId,
    observerActorId: observationReceipt.observerActorId,
    reviewerActorId: reviewer.actorId,
    outcome: verdict.outcome,
    reasonCode: verdict.reasonCode,
    reason: verdict.reason,
    observedAt: observationReceipt.observedAt,
    reviewedAt: args.reviewedAt,
    nonce: args.reviewNonce,
    observationReceiptVerified: true,
    subsequentContinuationObserved: true,
    reviewRecorded: true,
    subsequentContinuationObservationAccepted: verdict.accepted,
    subsequentContinuationObservationReviewAuthorizationAllowed: false,
    maximumReviewsPerObservation: 1,
    remainingReviews: 0,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  const entry = { ...entryPayload, entryHash: digest(entryPayload) };
  return {
    subsequentContinuationObservationReviewReceipt: reviewReceipt,
    controlledProofExecutionSubsequentContinuationObservationReviewMemory:
      createControlledProofExecutionSubsequentContinuationObservationReviewMemory({
        policy: reviewPolicy,
        entries: [...reviewMemory.entries, entry],
      }),
  };
}

export function inspectControlledProofExecutionSubsequentContinuationObservationReviewReceipt(receipt, args) {
  try {
    verifyContext(args);
    verifyObservationReceipt(args.controlledProofExecutionSubsequentContinuationObservationReceipt, args);
    if (receipt?.schema !== CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_RECEIPT_SCHEMA) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_receipt_schema_invalid");
    }
    const observationReceipt = args.controlledProofExecutionSubsequentContinuationObservationReceipt;
    const observationMemory = args.controlledProofExecutionSubsequentContinuationObservationMemory;
    const reviewPolicy = args.controlledProofExecutionSubsequentContinuationObservationReviewPolicy;
    const reviewMemory = args.controlledProofExecutionSubsequentContinuationObservationReviewMemory;
    const entryIndex = reviewMemory.entries.findIndex((entry) =>
      entry.reviewReceiptHash === receipt.subsequentContinuationObservationReviewReceiptHash);
    if (entryIndex < 0) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_not_recorded");
    }
    const reviewer = reviewPolicy.trustedSubsequentContinuationObservationReviewers
      .find((item) => item.keyId === receipt.reviewerKeyId);
    if (!reviewer) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_reviewer_untrusted");
    }
    validateReviewWindow(
      observationReceipt,
      reviewer,
      reviewPolicy,
      receipt.reviewedAt,
      args.controlledProofExecutionSubsequentContinuationObservationReceiptContext,
    );
    const verdict = validateOutcome(reviewPolicy, receipt.outcome, receipt.reasonCode, receipt.reason);
    const reviewMemoryHashBefore = memoryHashForEntries(reviewPolicy, reviewMemory.entries.slice(0, entryIndex));
    const payload = signingPayload({
      observationReceipt,
      observationMemory,
      reviewPolicy,
      reviewMemoryHashBefore,
      reviewId: receipt.reviewId,
      reviewer,
      verdict,
      reviewedAt: receipt.reviewedAt,
      nonce: receipt.nonce,
    });
    for (const [key, expected] of Object.entries(payload)) {
      if (JSON.stringify(receipt[key]) !== JSON.stringify(expected)) {
        throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_${key}_mismatch`);
      }
    }
    if (typeof receipt.signature !== "string" ||
        !cryptoVerify(null, bytes(payload), reviewer.publicKeyPem, Buffer.from(receipt.signature, "base64url"))) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_signature_verification_failed");
    }
    const hashPayload = { ...receipt };
    delete hashPayload.subsequentContinuationObservationReviewReceiptHash;
    if (digest(hashPayload) !== receipt.subsequentContinuationObservationReviewReceiptHash) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_receipt_hash_mismatch");
    }
    const entry = reviewMemory.entries[entryIndex];
    if (entry.subsequentContinuationObservationReceiptHash !==
          observationReceipt.subsequentContinuationObservationReceiptHash ||
        entry.subsequentContinuationObservationMemoryHash !== observationMemory.memoryHash ||
        entry.reviewMemoryHashBefore !== reviewMemoryHashBefore ||
        entry.reviewerActorId !== reviewer.actorId ||
        entry.outcome !== receipt.outcome) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_memory_entry_mismatch");
    }
    return {
      ok: true,
      subsequentContinuationObservationReviewReceiptHash:
        receipt.subsequentContinuationObservationReviewReceiptHash,
      subsequentContinuationObservationReceiptHash:
        receipt.subsequentContinuationObservationReceiptHash,
      outcome: receipt.outcome,
      subsequentContinuationObservationAccepted: receipt.subsequentContinuationObservationAccepted,
      subsequentContinuationObservationReviewAuthorizationAllowed: false,
      publicationExecuted: false,
      externalPublicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_subsequent_continuation_observation_review_receipt_invalid" };
  }
}
