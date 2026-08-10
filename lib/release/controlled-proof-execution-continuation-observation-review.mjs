import {
  createHash,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import {
  CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_RECEIPT_SCHEMA,
  inspectControlledProofExecutionContinuationObservationMemory,
  inspectControlledProofExecutionContinuationObservationPolicy,
  inspectControlledProofExecutionContinuationObservationReceipt,
} from "./controlled-proof-execution-continuation-observation.mjs";

export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_POLICY_SCHEMA = "atlas.controlled-proof-execution-continuation-observation-review-policy.v1";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_RECEIPT_SCHEMA = "atlas.controlled-proof-execution-continuation-observation-review-receipt.v1";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_MEMORY_SCHEMA = "atlas.controlled-proof-execution-continuation-observation-review-memory.v1";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_MEMORY_ENTRY_SCHEMA = "atlas.controlled-proof-execution-continuation-observation-review-memory-entry.v1";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_SIGNATURE_ALGORITHM = "ed25519";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEWER_ROLE = "continuation-observation-reviewer";

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

function observationPolicyContext(args) {
  return {
    controlledProofExecutionContinuationPolicy: args.controlledProofExecutionContinuationPolicy,
    trustedContinuationObservers: args.trustedContinuationObservers,
    maximumContinuationObservationDelaySeconds: args.maximumContinuationObservationDelaySeconds,
    controlledProofExecutionContinuationAuthorizationPolicy: args.controlledProofExecutionContinuationAuthorizationPolicy,
    controlledProofExecutionStartPolicy: args.controlledProofExecutionStartPolicy,
    controlledProofExecutionObservationPolicy: args.controlledProofExecutionObservationPolicy,
    trustedContinuationAuthorizers: args.trustedContinuationAuthorizers,
    maximumAuthorizationDelaySeconds: args.maximumAuthorizationDelaySeconds,
    maximumAuthorizationTtlSeconds: args.maximumAuthorizationTtlSeconds,
    trustedProofObservers: args.trustedProofObservers,
    maximumObservationDelaySeconds: args.maximumStartObservationDelaySeconds ?? args.maximumObservationDelaySeconds,
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

function verifyObservationPolicy(policy, args) {
  const inspection = inspectControlledProofExecutionContinuationObservationPolicy(policy, observationPolicyContext(args));
  if (!inspection.ok) throw new Error(`controlled_proof_execution_continuation_observation_policy_invalid:${inspection.reason}`);
}

function normalizeReviewer(reviewer) {
  if (!reviewer || typeof reviewer !== "object") throw new Error("controlled_proof_execution_continuation_observation_reviewer_invalid");
  for (const field of ["keyId", "actorId", "role"]) assertSlug(reviewer[field], `controlled_proof_execution_continuation_observation_reviewer_${field}`);
  if (reviewer.role !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEWER_ROLE) throw new Error("controlled_proof_execution_continuation_observation_reviewer_role_invalid");
  if (!new Set(["active", "inactive"]).has(reviewer.status)) throw new Error("controlled_proof_execution_continuation_observation_reviewer_status_invalid");
  assertIso(reviewer.validFrom, "controlled_proof_execution_continuation_observation_reviewer_valid_from");
  assertIso(reviewer.validUntil, "controlled_proof_execution_continuation_observation_reviewer_valid_until");
  if (Date.parse(reviewer.validUntil) <= Date.parse(reviewer.validFrom)) throw new Error("controlled_proof_execution_continuation_observation_reviewer_validity_invalid");
  if (typeof reviewer.publicKeyPem !== "string" || !reviewer.publicKeyPem.includes("BEGIN PUBLIC KEY")) throw new Error("controlled_proof_execution_continuation_observation_reviewer_public_key_invalid");
  try {
    if (createPublicKey(reviewer.publicKeyPem).asymmetricKeyType !== "ed25519") throw new Error();
  } catch {
    throw new Error("controlled_proof_execution_continuation_observation_reviewer_public_key_invalid");
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

export function createControlledProofExecutionContinuationObservationReviewPolicy({
  controlledProofExecutionContinuationObservationPolicy: observationPolicy,
  trustedObservationReviewers = [],
  maximumReviewDelaySeconds = 900,
  minimumReasonLength = 12,
  ...upstream
}) {
  verifyObservationPolicy(observationPolicy, upstream);
  if (!Array.isArray(trustedObservationReviewers)) throw new Error("trusted_continuation_observation_reviewers_invalid");
  const reviewers = trustedObservationReviewers.map(normalizeReviewer).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(reviewers.map((item) => item.keyId)).size !== reviewers.length) throw new Error("trusted_continuation_observation_reviewer_key_id_duplicate");
  if (new Set(reviewers.map((item) => item.actorId)).size !== reviewers.length) throw new Error("trusted_continuation_observation_reviewer_actor_id_duplicate");
  const priorIdentities = collectPriorIdentities({ observationPolicy, upstream });
  if (reviewers.some((item) => priorIdentities.has(item.keyId) || priorIdentities.has(item.actorId))) {
    throw new Error("controlled_proof_execution_continuation_observation_reviewer_must_be_independent");
  }
  if (!Number.isInteger(maximumReviewDelaySeconds) || maximumReviewDelaySeconds < 1 || maximumReviewDelaySeconds > 86400) {
    throw new Error("maximum_continuation_observation_review_delay_seconds_invalid");
  }
  if (!Number.isInteger(minimumReasonLength) || minimumReasonLength < 8 || minimumReasonLength > 500) {
    throw new Error("minimum_continuation_observation_review_reason_length_invalid");
  }
  const payload = {
    schema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_POLICY_SCHEMA,
    compositionId: observationPolicy.compositionId,
    compositionDecisionHash: observationPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: observationPolicy.publicationDecisionPolicyHash,
    executionStartPolicyHash: observationPolicy.executionStartPolicyHash,
    executionObservationPolicyHash: observationPolicy.observationPolicyHash,
    continuationAuthorizationPolicyHash: observationPolicy.continuationAuthorizationPolicyHash,
    continuationPolicyHash: observationPolicy.continuationPolicyHash,
    continuationObservationPolicyHash: observationPolicy.policyHash,
    requiredObservationReceiptSchema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_RECEIPT_SCHEMA,
    requiredMemoryEntrySchema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_MEMORY_ENTRY_SCHEMA,
    reviewerRole: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEWER_ROLE,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_SIGNATURE_ALGORITHM,
    trustedObservationReviewers: reviewers,
    allowedOutcomes: ["accepted", "rejected"],
    maximumReviewDelaySeconds,
    minimumReasonLength,
    recordedObservationRequired: true,
    exactObservationReceiptBindingRequired: true,
    exactObservationPolicyBindingRequired: true,
    exactObservationMemoryBindingRequired: true,
    exactContinuationBindingRequired: true,
    exactContinuationAuthorizationBindingRequired: true,
    exactPriorObservationBindingRequired: true,
    exactExecutionStartBindingRequired: true,
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
    controlledProofExecutionContinuationObservationReviewAllowed: true,
    subsequentContinuationAuthorizationAllowed: false,
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

export function inspectControlledProofExecutionContinuationObservationReviewPolicy(policy, context) {
  try {
    const recreated = createControlledProofExecutionContinuationObservationReviewPolicy({
      ...context,
      trustedObservationReviewers: policy?.trustedObservationReviewers,
      maximumReviewDelaySeconds: policy?.maximumReviewDelaySeconds,
      minimumReasonLength: policy?.minimumReasonLength,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "controlled_proof_execution_continuation_observation_review_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "controlled_proof_execution_continuation_observation_review_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedObservationReviewers: recreated.trustedObservationReviewers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_continuation_observation_review_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedReviews: entries.length,
      acceptedObservations: entries.filter((entry) => entry.outcome === "accepted").length,
      rejectedObservations: entries.filter((entry) => entry.outcome === "rejected").length,
      reviewedObservations: new Set(entries.map((entry) => entry.observationReceiptHash)).size,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      continuationObservationAccepted: entries.some((entry) => entry.continuationObservationAccepted === true),
      subsequentContinuationAuthorized: false,
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

export function createControlledProofExecutionContinuationObservationReviewMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_POLICY_SCHEMA) throw new Error("controlled_proof_execution_continuation_observation_review_memory_policy_invalid");
  assertHash(policy.policyHash, "controlled_proof_execution_continuation_observation_review_memory_policy_hash");
  if (!Array.isArray(entries)) throw new Error("controlled_proof_execution_continuation_observation_review_memory_entries_invalid");
  let previousEntryHash = null;
  const observationHashes = new Set();
  const reviewIds = new Set();
  const nonces = new Set();
  const normalized = [];
  for (const [index, entry] of entries.entries()) {
    if (entry?.schema !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_MEMORY_ENTRY_SCHEMA) throw new Error("controlled_proof_execution_continuation_observation_review_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("controlled_proof_execution_continuation_observation_review_memory_chain_invalid");
    for (const field of [
      "reviewReceiptHash", "reviewPolicyHash", "reviewMemoryHashBefore", "observationReceiptHash",
      "observationPolicyHash", "observationMemoryHash", "continuationReceiptHash", "continuationPolicyHash",
      "continuationMemoryHash", "continuationAuthorizationHash", "continuationAuthorizationPolicyHash",
      "continuationAuthorizationMemoryHash", "priorObservationReceiptHash", "priorObservationPolicyHash",
      "priorObservationMemoryHash", "executionStartReceiptHash", "executionStartPolicyHash",
      "executionStartMemoryHash", "packageSha256", "inventoryHash",
    ]) assertHash(entry[field], `controlled_proof_execution_continuation_observation_review_memory_${field}`);
    for (const field of [
      "reviewId", "observationId", "continuationId", "continuationAuthorizationId", "priorObservationId",
      "executionStartId", "externalExecutorActorId", "continuationAuthorizerActorId", "priorObserverActorId",
      "observerActorId", "reviewerActorId", "reasonCode", "nonce",
    ]) assertSlug(entry[field], `controlled_proof_execution_continuation_observation_review_memory_${field}`);
    assertIso(entry.observedAt, "controlled_proof_execution_continuation_observation_review_memory_observed_at");
    assertIso(entry.reviewedAt, "controlled_proof_execution_continuation_observation_review_memory_reviewed_at");
    if (entry.reviewPolicyHash !== policy.policyHash) throw new Error("controlled_proof_execution_continuation_observation_review_memory_policy_binding_mismatch");
    if (entry.reviewMemoryHashBefore !== memoryHashForEntries(policy, normalized)) throw new Error("controlled_proof_execution_continuation_observation_review_memory_head_binding_mismatch");
    if (!policy.allowedOutcomes.includes(entry.outcome)) throw new Error("controlled_proof_execution_continuation_observation_review_outcome_invalid");
    if (observationHashes.has(entry.observationReceiptHash)) throw new Error("controlled_proof_execution_continuation_observation_already_reviewed");
    if (reviewIds.has(entry.reviewId)) throw new Error("controlled_proof_execution_continuation_observation_review_duplicate_id");
    if (nonces.has(entry.nonce)) throw new Error("controlled_proof_execution_continuation_observation_review_duplicate_nonce");
    if (
      entry.reviewRecorded !== true || entry.observationReceiptVerified !== true ||
      entry.controlledProofExecutionContinuationObserved !== true ||
      entry.continuationObservationAccepted !== (entry.outcome === "accepted")
    ) throw new Error("controlled_proof_execution_continuation_observation_review_memory_contract_invalid");
    for (const key of ["subsequentContinuationAuthorized", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`controlled_proof_execution_continuation_observation_review_memory_${key}_must_be_false`);
    }
    const entryPayload = { ...entry };
    delete entryPayload.entryHash;
    if (digest(entryPayload) !== entry.entryHash) throw new Error("controlled_proof_execution_continuation_observation_review_memory_entry_hash_mismatch");
    normalized.push({ ...entry });
    observationHashes.add(entry.observationReceiptHash);
    reviewIds.add(entry.reviewId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledProofExecutionContinuationObservationReviewMemory(memory, { policy }) {
  try {
    const recreated = createControlledProofExecutionContinuationObservationReviewMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "controlled_proof_execution_continuation_observation_review_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "controlled_proof_execution_continuation_observation_review_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, ...recreated.summary };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_continuation_observation_review_memory_invalid" };
  }
}

function reviewPolicyContext(args) {
  return {
    controlledProofExecutionContinuationObservationPolicy: args.controlledProofExecutionContinuationObservationPolicy,
    ...observationPolicyContext(args),
  };
}

function verifyContext(args) {
  const policyInspection = inspectControlledProofExecutionContinuationObservationReviewPolicy(
    args.controlledProofExecutionContinuationObservationReviewPolicy,
    reviewPolicyContext(args),
  );
  if (!policyInspection.ok) throw new Error(`controlled_proof_execution_continuation_observation_review_policy_invalid:${policyInspection.reason}`);
  const reviewMemoryInspection = inspectControlledProofExecutionContinuationObservationReviewMemory(
    args.controlledProofExecutionContinuationObservationReviewMemory,
    { policy: args.controlledProofExecutionContinuationObservationReviewPolicy },
  );
  if (!reviewMemoryInspection.ok) throw new Error(`controlled_proof_execution_continuation_observation_review_memory_invalid:${reviewMemoryInspection.reason}`);
  const observationMemoryInspection = inspectControlledProofExecutionContinuationObservationMemory(
    args.controlledProofExecutionContinuationObservationMemory,
    { policy: args.controlledProofExecutionContinuationObservationPolicy },
  );
  if (!observationMemoryInspection.ok) throw new Error(`controlled_proof_execution_continuation_observation_memory_invalid:${observationMemoryInspection.reason}`);
}

function validateReviewWindow(observationReceipt, reviewer, policy, reviewedAt) {
  assertIso(reviewedAt, "controlled_proof_execution_continuation_observation_reviewed_at");
  const reviewed = Date.parse(reviewedAt);
  const observed = Date.parse(observationReceipt.observedAt);
  if (reviewed < observed) throw new Error("controlled_proof_execution_continuation_observation_review_before_observation");
  if (reviewed > observed + (policy.maximumReviewDelaySeconds * 1000)) throw new Error("controlled_proof_execution_continuation_observation_review_window_expired");
  if (reviewer.status !== "active") throw new Error("controlled_proof_execution_continuation_observation_reviewer_inactive");
  if (reviewer.role !== policy.reviewerRole) throw new Error("controlled_proof_execution_continuation_observation_reviewer_role_mismatch");
  if (reviewed < Date.parse(reviewer.validFrom) || reviewed > Date.parse(reviewer.validUntil)) throw new Error("controlled_proof_execution_continuation_observation_reviewer_key_outside_validity");
  const forbiddenKeys = new Set([
    observationReceipt.externalExecutorKeyId,
    observationReceipt.continuationAuthorizerKeyId,
    observationReceipt.priorObserverKeyId,
    observationReceipt.observerKeyId,
  ]);
  const forbiddenActors = new Set([
    observationReceipt.externalExecutorActorId,
    observationReceipt.continuationAuthorizerActorId,
    observationReceipt.priorObserverActorId,
    observationReceipt.observerActorId,
  ]);
  if (forbiddenKeys.has(reviewer.keyId) || forbiddenActors.has(reviewer.actorId)) {
    throw new Error("controlled_proof_execution_continuation_observation_reviewer_not_independent");
  }
}

function validateOutcome(policy, outcome, reasonCode, reason) {
  if (!policy.allowedOutcomes.includes(outcome)) throw new Error("controlled_proof_execution_continuation_observation_review_outcome_invalid");
  const expectedCode = outcome === "accepted" ? "continuation-observation-confirmed" : "continuation-observation-rejected";
  if (reasonCode !== expectedCode) throw new Error("controlled_proof_execution_continuation_observation_review_reason_code_invalid");
  if (typeof reason !== "string" || reason.trim().length < policy.minimumReasonLength || reason.trim().length > 2000) {
    throw new Error("controlled_proof_execution_continuation_observation_review_reason_invalid");
  }
  return {
    outcome,
    reasonCode,
    reason: reason.trim(),
    continuationObservationAccepted: outcome === "accepted",
  };
}

function signingPayload({ observationReceipt, observationMemory, reviewPolicy, reviewMemoryHashBefore, reviewId, reviewer, verdict, reviewedAt, nonce }) {
  if (!observationMemory.entries.some((entry) => entry.observationReceiptHash === observationReceipt.observationReceiptHash && entry.controlledProofExecutionContinuationObserved === true)) {
    throw new Error("controlled_proof_execution_continuation_observation_not_recorded");
  }
  return {
    signingSchema: "atlas.controlled-proof-execution-continuation-observation-review-signing-payload.v1",
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
    priorObservationReceiptHash: observationReceipt.priorObservationReceiptHash,
    priorObservationPolicyHash: observationReceipt.priorObservationPolicyHash,
    priorObservationMemoryHash: observationReceipt.priorObservationMemoryHash,
    priorObservationId: observationReceipt.priorObservationId,
    priorObserverKeyId: observationReceipt.priorObserverKeyId,
    priorObserverActorId: observationReceipt.priorObserverActorId,
    continuationAuthorizationHash: observationReceipt.continuationAuthorizationHash,
    continuationAuthorizationPolicyHash: observationReceipt.continuationAuthorizationPolicyHash,
    continuationAuthorizationMemoryHash: observationReceipt.continuationAuthorizationMemoryHash,
    continuationAuthorizationId: observationReceipt.continuationAuthorizationId,
    continuationAuthorizerKeyId: observationReceipt.continuationAuthorizerKeyId,
    continuationAuthorizerActorId: observationReceipt.continuationAuthorizerActorId,
    continuationReceiptHash: observationReceipt.continuationReceiptHash,
    continuationPolicyHash: observationReceipt.continuationPolicyHash,
    continuationMemoryHash: observationReceipt.continuationMemoryHash,
    continuationId: observationReceipt.continuationId,
    externalExecutorKeyId: observationReceipt.externalExecutorKeyId,
    externalExecutorActorId: observationReceipt.externalExecutorActorId,
    observationReceiptHash: observationReceipt.observationReceiptHash,
    observationPolicyHash: observationReceipt.observationPolicyHash,
    observationMemoryHash: observationMemory.memoryHash,
    observationId: observationReceipt.observationId,
    observationKind: observationReceipt.observationKind,
    observerKeyId: observationReceipt.observerKeyId,
    observerActorId: observationReceipt.observerActorId,
    reviewPolicyHash: reviewPolicy.policyHash,
    reviewMemoryHashBefore,
    reviewId,
    reviewerKeyId: reviewer.keyId,
    reviewerActorId: reviewer.actorId,
    reviewerRole: reviewer.role,
    outcome: verdict.outcome,
    reasonCode: verdict.reasonCode,
    reason: verdict.reason,
    observationReceiptVerified: true,
    controlledProofExecutionStarted: true,
    controlledProofExecutionObserved: true,
    controlledProofExecutionContinuationAuthorized: true,
    controlledProofExecutionContinued: true,
    controlledProofExecutionContinuationObserved: true,
    continuationObservationAccepted: verdict.continuationObservationAccepted,
    observedAt: observationReceipt.observedAt,
    reviewedAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("controlled_proof_execution_continuation_observation_review_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) {
    throw new Error("private_key_does_not_match_controlled_proof_execution_continuation_observation_reviewer");
  }
  return signature;
}

export function reviewControlledProofExecutionContinuationObservation({
  controlledProofExecutionContinuationObservationReceipt: observationReceipt,
  controlledProofExecutionContinuationObservationMemory: observationMemory,
  controlledProofExecutionContinuationObservationReviewPolicy: reviewPolicy,
  controlledProofExecutionContinuationObservationReviewMemory: reviewMemory,
  reviewId,
  reviewerKeyId,
  reviewerPrivateKey,
  outcome,
  reasonCode,
  reason,
  reviewedAt,
  nonce,
  ...upstream
}) {
  const context = {
    ...upstream,
    controlledProofExecutionContinuationObservationMemory: observationMemory,
    controlledProofExecutionContinuationObservationReviewPolicy: reviewPolicy,
    controlledProofExecutionContinuationObservationReviewMemory: reviewMemory,
  };
  verifyContext(context);
  const observationInspection = inspectControlledProofExecutionContinuationObservationReceipt(observationReceipt, {
    ...upstream,
    controlledProofExecutionContinuationObservationMemory: observationMemory,
  });
  if (!observationInspection.ok) throw new Error(`controlled_proof_execution_continuation_observation_receipt_invalid:${observationInspection.reason}`);
  assertSlug(reviewId, "controlled_proof_execution_continuation_observation_review_id");
  assertSlug(reviewerKeyId, "controlled_proof_execution_continuation_observation_reviewer_key_id");
  assertSlug(nonce, "controlled_proof_execution_continuation_observation_review_nonce");
  if (reviewMemory.entries.some((entry) => entry.observationReceiptHash === observationReceipt.observationReceiptHash)) throw new Error("controlled_proof_execution_continuation_observation_already_reviewed");
  if (reviewMemory.entries.some((entry) => entry.reviewId === reviewId)) throw new Error("controlled_proof_execution_continuation_observation_review_duplicate_id");
  if (reviewMemory.entries.some((entry) => entry.nonce === nonce)) throw new Error("controlled_proof_execution_continuation_observation_review_duplicate_nonce");
  const reviewer = reviewPolicy.trustedObservationReviewers.find((item) => item.keyId === reviewerKeyId);
  if (!reviewer) throw new Error("controlled_proof_execution_continuation_observation_reviewer_untrusted");
  validateReviewWindow(observationReceipt, reviewer, reviewPolicy, reviewedAt);
  const verdict = validateOutcome(reviewPolicy, outcome, reasonCode, reason);
  const reviewMemoryHashBefore = reviewMemory.memoryHash;
  const payload = signingPayload({ observationReceipt, observationMemory, reviewPolicy, reviewMemoryHashBefore, reviewId, reviewer, verdict, reviewedAt, nonce });
  const signature = signPayload(payload, reviewerPrivateKey, reviewer.publicKeyPem);
  const unsigned = {
    schema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_RECEIPT_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_SIGNATURE_ALGORITHM,
    reviewRecorded: true,
    subsequentContinuationAuthorized: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const reviewReceipt = { ...unsigned, reviewReceiptHash: digest(unsigned) };
  const entryPayload = {
    schema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_MEMORY_ENTRY_SCHEMA,
    sequence: reviewMemory.entries.length + 1,
    previousEntryHash: reviewMemory.entries.at(-1)?.entryHash ?? null,
    reviewReceiptHash: reviewReceipt.reviewReceiptHash,
    reviewPolicyHash: reviewPolicy.policyHash,
    reviewMemoryHashBefore,
    observationReceiptHash: observationReceipt.observationReceiptHash,
    observationPolicyHash: observationReceipt.observationPolicyHash,
    observationMemoryHash: observationMemory.memoryHash,
    continuationReceiptHash: observationReceipt.continuationReceiptHash,
    continuationPolicyHash: observationReceipt.continuationPolicyHash,
    continuationMemoryHash: observationReceipt.continuationMemoryHash,
    continuationAuthorizationHash: observationReceipt.continuationAuthorizationHash,
    continuationAuthorizationPolicyHash: observationReceipt.continuationAuthorizationPolicyHash,
    continuationAuthorizationMemoryHash: observationReceipt.continuationAuthorizationMemoryHash,
    priorObservationReceiptHash: observationReceipt.priorObservationReceiptHash,
    priorObservationPolicyHash: observationReceipt.priorObservationPolicyHash,
    priorObservationMemoryHash: observationReceipt.priorObservationMemoryHash,
    executionStartReceiptHash: observationReceipt.executionStartReceiptHash,
    executionStartPolicyHash: observationReceipt.executionStartPolicyHash,
    executionStartMemoryHash: observationReceipt.executionStartMemoryHash,
    packageSha256: observationReceipt.packageSha256,
    inventoryHash: observationReceipt.inventoryHash,
    reviewId,
    observationId: observationReceipt.observationId,
    continuationId: observationReceipt.continuationId,
    continuationAuthorizationId: observationReceipt.continuationAuthorizationId,
    priorObservationId: observationReceipt.priorObservationId,
    executionStartId: observationReceipt.executionStartId,
    externalExecutorActorId: observationReceipt.externalExecutorActorId,
    continuationAuthorizerActorId: observationReceipt.continuationAuthorizerActorId,
    priorObserverActorId: observationReceipt.priorObserverActorId,
    observerActorId: observationReceipt.observerActorId,
    reviewerActorId: reviewer.actorId,
    outcome: verdict.outcome,
    reasonCode: verdict.reasonCode,
    reason: verdict.reason,
    reviewRecorded: true,
    observationReceiptVerified: true,
    controlledProofExecutionContinuationObserved: true,
    continuationObservationAccepted: verdict.continuationObservationAccepted,
    observedAt: observationReceipt.observedAt,
    reviewedAt,
    nonce,
    subsequentContinuationAuthorized: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  const entry = { ...entryPayload, entryHash: digest(entryPayload) };
  return {
    reviewReceipt,
    controlledProofExecutionContinuationObservationReviewMemory: createControlledProofExecutionContinuationObservationReviewMemory({
      policy: reviewPolicy,
      entries: [...reviewMemory.entries, entry],
    }),
  };
}

export function inspectControlledProofExecutionContinuationObservationReviewReceipt(receipt, {
  controlledProofExecutionContinuationObservationReceipt: observationReceipt,
  controlledProofExecutionContinuationObservationMemory: observationMemory,
  controlledProofExecutionContinuationObservationReviewPolicy: reviewPolicy,
  controlledProofExecutionContinuationObservationReviewMemory: reviewMemory,
  ...upstream
}) {
  try {
    if (receipt?.schema !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_RECEIPT_SCHEMA) throw new Error("controlled_proof_execution_continuation_observation_review_receipt_schema_invalid");
    const context = {
      ...upstream,
      controlledProofExecutionContinuationObservationMemory: observationMemory,
      controlledProofExecutionContinuationObservationReviewPolicy: reviewPolicy,
      controlledProofExecutionContinuationObservationReviewMemory: reviewMemory,
    };
    verifyContext(context);
    const observationInspection = inspectControlledProofExecutionContinuationObservationReceipt(observationReceipt, {
      ...upstream,
      controlledProofExecutionContinuationObservationMemory: observationMemory,
    });
    if (!observationInspection.ok) throw new Error(`controlled_proof_execution_continuation_observation_receipt_invalid:${observationInspection.reason}`);
    const entryIndex = reviewMemory.entries.findIndex((entry) => entry.reviewReceiptHash === receipt.reviewReceiptHash);
    if (entryIndex < 0) throw new Error("controlled_proof_execution_continuation_observation_review_not_recorded");
    const reviewer = reviewPolicy.trustedObservationReviewers.find((item) => item.keyId === receipt.reviewerKeyId);
    if (!reviewer) throw new Error("controlled_proof_execution_continuation_observation_reviewer_untrusted");
    validateReviewWindow(observationReceipt, reviewer, reviewPolicy, receipt.reviewedAt);
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
      if (JSON.stringify(receipt[key]) !== JSON.stringify(expected)) throw new Error(`controlled_proof_execution_continuation_observation_review_${key}_mismatch`);
    }
    if (receipt.signatureAlgorithm !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_SIGNATURE_ALGORITHM || typeof receipt.signature !== "string") {
      throw new Error("controlled_proof_execution_continuation_observation_review_signature_invalid");
    }
    if (!cryptoVerify(null, bytes(payload), reviewer.publicKeyPem, Buffer.from(receipt.signature, "base64url"))) {
      throw new Error("controlled_proof_execution_continuation_observation_review_signature_verification_failed");
    }
    if (
      receipt.reviewRecorded !== true || receipt.observationReceiptVerified !== true ||
      receipt.controlledProofExecutionContinuationObserved !== true ||
      receipt.continuationObservationAccepted !== (receipt.outcome === "accepted")
    ) throw new Error("controlled_proof_execution_continuation_observation_review_receipt_contract_invalid");
    for (const key of ["subsequentContinuationAuthorized", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (receipt[key] !== false) throw new Error(`controlled_proof_execution_continuation_observation_review_${key}_must_be_false`);
    }
    const hashPayload = { ...receipt };
    delete hashPayload.reviewReceiptHash;
    if (digest(hashPayload) !== receipt.reviewReceiptHash) throw new Error("controlled_proof_execution_continuation_observation_review_receipt_hash_mismatch");
    const entry = reviewMemory.entries[entryIndex];
    if (
      entry.observationReceiptHash !== observationReceipt.observationReceiptHash ||
      entry.observationMemoryHash !== observationMemory.memoryHash ||
      entry.reviewMemoryHashBefore !== reviewMemoryHashBefore ||
      entry.reviewerActorId !== reviewer.actorId ||
      entry.outcome !== receipt.outcome
    ) throw new Error("controlled_proof_execution_continuation_observation_review_memory_entry_mismatch");
    return {
      ok: true,
      reviewReceiptHash: receipt.reviewReceiptHash,
      observationReceiptHash: receipt.observationReceiptHash,
      outcome: receipt.outcome,
      continuationObservationAccepted: receipt.continuationObservationAccepted,
      subsequentContinuationAuthorized: false,
      publicationExecuted: false,
      externalPublicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_continuation_observation_review_receipt_invalid" };
  }
}
