import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  inspectPublicationExecutionEvidenceAdjudicationDecision,
  inspectPublicationExecutionEvidenceAdjudicationMemory,
  inspectPublicationExecutionEvidenceAdjudicationPolicy,
} from "./publication-execution-evidence-adjudication.mjs";

export const CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW_POLICY_SCHEMA = "atlas.controlled-external-publication-authorization-review-policy.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW_SCHEMA = "atlas.controlled-external-publication-authorization-review.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW_MEMORY_SCHEMA = "atlas.controlled-external-publication-authorization-review-memory.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW_MEMORY_ENTRY_SCHEMA = "atlas.controlled-external-publication-authorization-review-memory-entry.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEWER_ROLE = "release-external-publication-authorization-reviewer";
export const CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW_SIGNATURE_ALGORITHM = "ed25519";

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

function normalizeReviewer(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("external_publication_authorization_reviewer_invalid");
  assertSlug(value.keyId, "external_publication_authorization_reviewer_key_id");
  assertSlug(value.actorId, "external_publication_authorization_reviewer_actor_id");
  if (value.role !== CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEWER_ROLE) throw new Error("external_publication_authorization_reviewer_role_invalid");
  if (!["active", "inactive"].includes(value.status)) throw new Error("external_publication_authorization_reviewer_status_invalid");
  assertIso(value.validFrom, "external_publication_authorization_reviewer_valid_from");
  assertIso(value.validUntil, "external_publication_authorization_reviewer_valid_until");
  if (Date.parse(value.validUntil) <= Date.parse(value.validFrom)) throw new Error("external_publication_authorization_reviewer_validity_invalid");
  try {
    const key = createPublicKey(value.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch {
    throw new Error("external_publication_authorization_reviewer_public_key_invalid");
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

function priorIdentities({ publicationEvidenceAdjudicationPolicy, executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy }) {
  return new Set([
    ...(publicationEvidenceAdjudicationPolicy.trustedAdjudicators ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(executionPolicy.trustedExecutors ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(executionAuthorizationPolicy.trustedExecutionAuthorizers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(publicationPolicy.trustedPublicationDirectors ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(evidencePolicy.trustedEvidenceCustodians ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(assemblyPolicy.trustedPackageAssemblers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(packageAuthorizationPolicy.trustedPackageAuthorizers ?? []).flatMap((item) => [item.keyId, item.actorId]),
  ]);
}

function verifyAdjudicationPolicy(publicationEvidenceAdjudicationPolicy, context) {
  const inspection = inspectPublicationExecutionEvidenceAdjudicationPolicy(publicationEvidenceAdjudicationPolicy, context);
  if (!inspection.ok) throw new Error(`publication_evidence_adjudication_policy_invalid:${inspection.reason}`);
}

export function createControlledExternalPublicationAuthorizationReviewPolicy({
  publicationEvidenceAdjudicationPolicy,
  executionPolicy,
  executionAuthorizationPolicy,
  publicationPolicy,
  evidencePolicy,
  assemblyPolicy,
  packageAuthorizationPolicy,
  trustedReviewers = [],
  maxReviewDelaySeconds = 900,
  minReasonLength = 12,
}) {
  const adjudicationContext = { executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy };
  verifyAdjudicationPolicy(publicationEvidenceAdjudicationPolicy, adjudicationContext);
  if (!Array.isArray(trustedReviewers)) throw new Error("trusted_external_publication_authorization_reviewers_invalid");
  const reviewers = trustedReviewers.map(normalizeReviewer).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(reviewers.map((item) => item.keyId)).size !== reviewers.length) throw new Error("duplicate_external_publication_authorization_reviewer_key_id");
  if (new Set(reviewers.map((item) => item.actorId)).size !== reviewers.length) throw new Error("duplicate_external_publication_authorization_reviewer_actor_id");
  const forbidden = priorIdentities({ publicationEvidenceAdjudicationPolicy, ...adjudicationContext });
  if (reviewers.some((item) => forbidden.has(item.keyId) || forbidden.has(item.actorId))) throw new Error("external_publication_authorization_reviewer_must_be_independent");
  if (!Number.isInteger(maxReviewDelaySeconds) || maxReviewDelaySeconds < 1 || maxReviewDelaySeconds > 86400) throw new Error("external_publication_authorization_max_review_delay_invalid");
  if (!Number.isInteger(minReasonLength) || minReasonLength < 8 || minReasonLength > 500) throw new Error("external_publication_authorization_min_reason_length_invalid");
  const payload = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW_POLICY_SCHEMA,
    compositionId: publicationEvidenceAdjudicationPolicy.compositionId,
    compositionDecisionHash: publicationEvidenceAdjudicationPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: publicationEvidenceAdjudicationPolicy.publicationDecisionPolicyHash,
    executionAuthorizationPolicyHash: publicationEvidenceAdjudicationPolicy.executionAuthorizationPolicyHash,
    executionPolicyHash: publicationEvidenceAdjudicationPolicy.executionPolicyHash,
    evidenceAdjudicationPolicyHash: publicationEvidenceAdjudicationPolicy.policyHash,
    requiredEvidenceDecisionSchema: "atlas.publication-execution-evidence-adjudication-decision.v1",
    requiredEvidenceMemoryEntrySchema: "atlas.publication-execution-evidence-adjudication-memory-entry.v1",
    requiredMemoryEntrySchema: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW_MEMORY_ENTRY_SCHEMA,
    reviewerRole: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEWER_ROLE,
    signatureAlgorithm: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW_SIGNATURE_ALGORITHM,
    trustedReviewers: reviewers,
    allowedOutcomes: ["eligible", "ineligible"],
    maxReviewDelaySeconds,
    minReasonLength,
    acceptedRecordedEvidenceRequiredForEligibility: true,
    exactEvidenceDecisionBindingRequired: true,
    exactAdjudicationMemoryBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    independentAuthorizationReviewerRequired: true,
    signedReviewRequired: true,
    appendOnlyReviewMemoryRequired: true,
    duplicateEvidenceDecisionReviewRejected: true,
    externalPublicationAuthorizationAllowed: false,
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

export function inspectControlledExternalPublicationAuthorizationReviewPolicy(policy, context) {
  try {
    const recreated = createControlledExternalPublicationAuthorizationReviewPolicy({
      ...context,
      trustedReviewers: policy?.trustedReviewers,
      maxReviewDelaySeconds: policy?.maxReviewDelaySeconds,
      minReasonLength: policy?.minReasonLength,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "external_publication_authorization_review_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "external_publication_authorization_review_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedReviewers: recreated.trustedReviewers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_authorization_review_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedReviews: entries.length,
      eligibleProofs: entries.filter((entry) => entry.outcome === "eligible").length,
      ineligibleProofs: entries.filter((entry) => entry.outcome === "ineligible").length,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      eligibleForAuthorizationGrant: entries.some((entry) => entry.eligibleForAuthorizationGrant),
      externalPublicationAuthorized: false,
      publicationExecuted: false,
      externalPublicationExecuted: false,
      packageGenerated: false,
      buildExecuted: false,
      deployExecuted: false,
      releasePromoted: false,
    },
  };
}

export function createControlledExternalPublicationAuthorizationReviewMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW_POLICY_SCHEMA) throw new Error("external_publication_authorization_review_memory_policy_invalid");
  if (!Array.isArray(entries)) throw new Error("external_publication_authorization_review_memory_entries_invalid");
  let previousEntryHash = null;
  const evidenceDecisionHashes = new Set();
  const reviewIds = new Set();
  const nonces = new Set();
  const normalized = entries.map((entry, index) => {
    if (entry?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW_MEMORY_ENTRY_SCHEMA) throw new Error("external_publication_authorization_review_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("external_publication_authorization_review_memory_chain_invalid");
    for (const field of ["reviewHash", "evidenceDecisionHash", "evidenceAdjudicationPolicyHash", "evidenceAdjudicationMemoryHash", "receiptHash", "packageSha256", "inventoryHash"]) assertHash(entry[field], `external_publication_authorization_review_memory_${field}`);
    assertSlug(entry.reviewId, "external_publication_authorization_review_memory_review_id");
    assertSlug(entry.decisionId, "external_publication_authorization_review_memory_decision_id");
    assertSlug(entry.nonce, "external_publication_authorization_review_memory_nonce");
    if (!policy.allowedOutcomes.includes(entry.outcome)) throw new Error("external_publication_authorization_review_memory_outcome_invalid");
    if (evidenceDecisionHashes.has(entry.evidenceDecisionHash)) throw new Error("publication_evidence_decision_already_reviewed");
    if (reviewIds.has(entry.reviewId)) throw new Error("external_publication_authorization_review_duplicate_review_id");
    if (nonces.has(entry.nonce)) throw new Error("external_publication_authorization_review_duplicate_nonce");
    if (entry.reviewRecorded !== true || entry.evidenceDecisionVerified !== true || entry.eligibleForAuthorizationGrant !== (entry.outcome === "eligible")) throw new Error("external_publication_authorization_review_memory_safety_contract_invalid");
    for (const key of ["externalPublicationAuthorized", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`external_publication_authorization_review_memory_${key}_must_be_false`);
    }
    const hashPayload = { ...entry };
    delete hashPayload.entryHash;
    if (digest(hashPayload) !== entry.entryHash) throw new Error("external_publication_authorization_review_memory_entry_hash_mismatch");
    evidenceDecisionHashes.add(entry.evidenceDecisionHash);
    reviewIds.add(entry.reviewId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
    return { ...entry };
  });
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledExternalPublicationAuthorizationReviewMemory(memory, { policy }) {
  try {
    const recreated = createControlledExternalPublicationAuthorizationReviewMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "external_publication_authorization_review_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "external_publication_authorization_review_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, recordedReviews: recreated.entries.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_authorization_review_memory_invalid" };
  }
}

function verifyReviewContext({ reviewPolicy, reviewMemory, publicationEvidenceAdjudicationPolicy, publicationEvidenceAdjudicationMemory, adjudicationContext }) {
  const policyInspection = inspectControlledExternalPublicationAuthorizationReviewPolicy(reviewPolicy, { publicationEvidenceAdjudicationPolicy, ...adjudicationContext });
  if (!policyInspection.ok) throw new Error(`external_publication_authorization_review_policy_invalid:${policyInspection.reason}`);
  const reviewMemoryInspection = inspectControlledExternalPublicationAuthorizationReviewMemory(reviewMemory, { policy: reviewPolicy });
  if (!reviewMemoryInspection.ok) throw new Error(`external_publication_authorization_review_memory_invalid:${reviewMemoryInspection.reason}`);
  const evidenceMemoryInspection = inspectPublicationExecutionEvidenceAdjudicationMemory(publicationEvidenceAdjudicationMemory, { policy: publicationEvidenceAdjudicationPolicy });
  if (!evidenceMemoryInspection.ok) throw new Error(`publication_evidence_adjudication_memory_invalid:${evidenceMemoryInspection.reason}`);
}

function validateReviewWindow(evidenceDecision, reviewer, policy, reviewedAt) {
  assertIso(reviewedAt, "external_publication_authorization_reviewed_at");
  const reviewed = Date.parse(reviewedAt);
  const decided = Date.parse(evidenceDecision.decidedAt);
  if (reviewed < decided) throw new Error("external_publication_authorization_review_before_evidence_decision");
  if (reviewed - decided > policy.maxReviewDelaySeconds * 1000) throw new Error("external_publication_authorization_review_delay_exceeded");
  if (reviewer.status !== "active") throw new Error("external_publication_authorization_reviewer_inactive");
  if (reviewer.role !== policy.reviewerRole) throw new Error("external_publication_authorization_reviewer_role_mismatch");
  if (reviewed < Date.parse(reviewer.validFrom) || reviewed > Date.parse(reviewer.validUntil)) throw new Error("external_publication_authorization_reviewer_key_outside_validity");
}

function validateOutcome(evidenceDecision, policy, outcome, reasonCode, reason) {
  if (!policy.allowedOutcomes.includes(outcome)) throw new Error("external_publication_authorization_review_outcome_invalid");
  if (outcome === "eligible" && (evidenceDecision.outcome !== "accepted" || evidenceDecision.evidenceAccepted !== true)) throw new Error("accepted_recorded_evidence_required_for_authorization_eligibility");
  const expectedCodes = outcome === "eligible"
    ? ["accepted-proof-eligible"]
    : (evidenceDecision.outcome === "accepted" ? ["accepted-proof-not-eligible"] : ["rejected-proof-not-eligible"]);
  if (!expectedCodes.includes(reasonCode)) throw new Error("external_publication_authorization_review_reason_code_invalid");
  if (typeof reason !== "string" || reason.trim().length < policy.minReasonLength || reason.trim().length > 2000) throw new Error("external_publication_authorization_review_reason_invalid");
  return {
    outcome,
    reasonCode,
    reason: reason.trim(),
    evidenceAccepted: evidenceDecision.evidenceAccepted === true,
    eligibleForAuthorizationGrant: outcome === "eligible",
  };
}

function reviewSigningPayload({ evidenceDecision, evidenceMemory, reviewPolicy, reviewId, reviewer, verdict, reviewedAt, nonce }) {
  if (!evidenceMemory.entries.some((entry) => entry.decisionHash === evidenceDecision.decisionHash)) throw new Error("publication_evidence_adjudication_decision_not_recorded");
  return {
    signingSchema: "atlas.controlled-external-publication-authorization-review-signing-payload.v1",
    compositionId: evidenceDecision.compositionId,
    compositionDecisionHash: evidenceDecision.compositionDecisionHash,
    publicationDecisionHash: evidenceDecision.publicationDecisionHash,
    evidenceAdjudicationPolicyHash: evidenceDecision.adjudicationPolicyHash,
    evidenceAdjudicationMemoryHash: evidenceMemory.memoryHash,
    evidenceDecisionHash: evidenceDecision.decisionHash,
    decisionId: evidenceDecision.decisionId,
    receiptHash: evidenceDecision.receiptHash,
    executionId: evidenceDecision.executionId,
    packageSha256: evidenceDecision.packageSha256,
    inventoryHash: evidenceDecision.inventoryHash,
    reviewPolicyHash: reviewPolicy.policyHash,
    reviewId,
    reviewerKeyId: reviewer.keyId,
    reviewerActorId: reviewer.actorId,
    reviewerRole: reviewer.role,
    outcome: verdict.outcome,
    reasonCode: verdict.reasonCode,
    reason: verdict.reason,
    evidenceAccepted: verdict.evidenceAccepted,
    eligibleForAuthorizationGrant: verdict.eligibleForAuthorizationGrant,
    reviewedAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("external_publication_authorization_review_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_external_publication_authorization_reviewer");
  return signature;
}

function inspectEvidenceDecision(evidenceDecision, context) {
  const inspection = inspectPublicationExecutionEvidenceAdjudicationDecision(evidenceDecision, context);
  if (!inspection.ok) throw new Error(`publication_evidence_adjudication_decision_invalid:${inspection.reason}`);
  return inspection;
}

export function reviewControlledExternalPublicationAuthorization({
  publicationEvidenceAdjudicationDecision: evidenceDecision,
  publicationEvidenceAdjudicationPolicy,
  publicationEvidenceAdjudicationMemory,
  controlledExternalPublicationReviewPolicy: reviewPolicy,
  controlledExternalPublicationReviewMemory: reviewMemory,
  reviewId,
  reviewerKeyId,
  reviewerPrivateKey,
  outcome,
  reasonCode,
  reason,
  reviewedAt,
  nonce,
  ...decisionContext
}) {
  const { authorizedPublicationExecutionPolicy: executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy } = decisionContext;
  const adjudicationContext = { executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy };
  verifyReviewContext({ reviewPolicy, reviewMemory, publicationEvidenceAdjudicationPolicy, publicationEvidenceAdjudicationMemory, adjudicationContext });
  inspectEvidenceDecision(evidenceDecision, { ...decisionContext, publicationEvidenceAdjudicationPolicy, publicationEvidenceAdjudicationMemory });
  assertSlug(reviewId, "external_publication_authorization_review_id");
  assertSlug(reviewerKeyId, "external_publication_authorization_reviewer_key_id");
  assertSlug(nonce, "external_publication_authorization_review_nonce");
  if (reviewMemory.entries.some((entry) => entry.evidenceDecisionHash === evidenceDecision.decisionHash)) throw new Error("publication_evidence_decision_already_reviewed");
  if (reviewMemory.entries.some((entry) => entry.reviewId === reviewId)) throw new Error("external_publication_authorization_review_duplicate_review_id");
  if (reviewMemory.entries.some((entry) => entry.nonce === nonce)) throw new Error("external_publication_authorization_review_duplicate_nonce");
  const reviewer = reviewPolicy.trustedReviewers.find((item) => item.keyId === reviewerKeyId);
  if (!reviewer) throw new Error("external_publication_authorization_reviewer_untrusted");
  if (reviewer.keyId === evidenceDecision.adjudicatorKeyId || reviewer.actorId === evidenceDecision.adjudicatorActorId) throw new Error("evidence_adjudicator_cannot_review_own_authorization_eligibility");
  validateReviewWindow(evidenceDecision, reviewer, reviewPolicy, reviewedAt);
  const verdict = validateOutcome(evidenceDecision, reviewPolicy, outcome, reasonCode, reason);
  const payload = reviewSigningPayload({ evidenceDecision, evidenceMemory: publicationEvidenceAdjudicationMemory, reviewPolicy, reviewId, reviewer, verdict, reviewedAt, nonce });
  const signature = signPayload(payload, reviewerPrivateKey, reviewer.publicKeyPem);
  const reviewValue = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW_SIGNATURE_ALGORITHM,
    reviewRecorded: true,
    evidenceDecisionVerified: true,
    externalPublicationAuthorized: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const review = { ...reviewValue, reviewHash: digest(reviewValue) };
  const entryPayload = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW_MEMORY_ENTRY_SCHEMA,
    sequence: reviewMemory.entries.length + 1,
    previousEntryHash: reviewMemory.entries.at(-1)?.entryHash ?? null,
    reviewHash: review.reviewHash,
    reviewId,
    nonce,
    evidenceDecisionHash: evidenceDecision.decisionHash,
    decisionId: evidenceDecision.decisionId,
    evidenceAdjudicationPolicyHash: publicationEvidenceAdjudicationPolicy.policyHash,
    evidenceAdjudicationMemoryHash: publicationEvidenceAdjudicationMemory.memoryHash,
    receiptHash: evidenceDecision.receiptHash,
    packageSha256: evidenceDecision.packageSha256,
    inventoryHash: evidenceDecision.inventoryHash,
    reviewerActorId: reviewer.actorId,
    outcome: verdict.outcome,
    reasonCode: verdict.reasonCode,
    evidenceAccepted: verdict.evidenceAccepted,
    eligibleForAuthorizationGrant: verdict.eligibleForAuthorizationGrant,
    reviewedAt,
    reviewRecorded: true,
    evidenceDecisionVerified: true,
    externalPublicationAuthorized: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  const entry = { ...entryPayload, entryHash: digest(entryPayload) };
  return {
    review,
    controlledExternalPublicationReviewMemory: createControlledExternalPublicationAuthorizationReviewMemory({ policy: reviewPolicy, entries: [...reviewMemory.entries, entry] }),
  };
}

export function inspectControlledExternalPublicationAuthorizationReview(review, {
  publicationEvidenceAdjudicationDecision: evidenceDecision,
  publicationEvidenceAdjudicationPolicy,
  publicationEvidenceAdjudicationMemory,
  controlledExternalPublicationReviewPolicy: reviewPolicy,
  controlledExternalPublicationReviewMemory: reviewMemory,
  ...decisionContext
}) {
  try {
    if (review?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW_SCHEMA) throw new Error("external_publication_authorization_review_schema_invalid");
    const { authorizedPublicationExecutionPolicy: executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy } = decisionContext;
    const adjudicationContext = { executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy };
    verifyReviewContext({ reviewPolicy, reviewMemory, publicationEvidenceAdjudicationPolicy, publicationEvidenceAdjudicationMemory, adjudicationContext });
    inspectEvidenceDecision(evidenceDecision, { ...decisionContext, publicationEvidenceAdjudicationPolicy, publicationEvidenceAdjudicationMemory });
    const reviewer = reviewPolicy.trustedReviewers.find((item) => item.keyId === review.reviewerKeyId);
    if (!reviewer) throw new Error("external_publication_authorization_reviewer_untrusted");
    if (reviewer.keyId === evidenceDecision.adjudicatorKeyId || reviewer.actorId === evidenceDecision.adjudicatorActorId) throw new Error("evidence_adjudicator_cannot_review_own_authorization_eligibility");
    validateReviewWindow(evidenceDecision, reviewer, reviewPolicy, review.reviewedAt);
    const verdict = validateOutcome(evidenceDecision, reviewPolicy, review.outcome, review.reasonCode, review.reason);
    const payload = reviewSigningPayload({ evidenceDecision, evidenceMemory: publicationEvidenceAdjudicationMemory, reviewPolicy, reviewId: review.reviewId, reviewer, verdict, reviewedAt: review.reviewedAt, nonce: review.nonce });
    for (const [key, expected] of Object.entries(payload)) if (JSON.stringify(review[key]) !== JSON.stringify(expected)) throw new Error(`external_publication_authorization_review_${key}_mismatch`);
    if (review.signatureAlgorithm !== CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW_SIGNATURE_ALGORITHM || typeof review.signature !== "string") throw new Error("external_publication_authorization_review_signature_invalid");
    if (!cryptoVerify(null, bytes(payload), reviewer.publicKeyPem, Buffer.from(review.signature, "base64url"))) throw new Error("external_publication_authorization_review_signature_verification_failed");
    if (review.reviewRecorded !== true || review.evidenceDecisionVerified !== true || review.eligibleForAuthorizationGrant !== verdict.eligibleForAuthorizationGrant) throw new Error("external_publication_authorization_review_contract_invalid");
    for (const key of ["externalPublicationAuthorized", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (review[key] !== false) throw new Error(`external_publication_authorization_review_${key}_must_be_false`);
    }
    const hashPayload = { ...review };
    delete hashPayload.reviewHash;
    if (digest(hashPayload) !== review.reviewHash) throw new Error("external_publication_authorization_review_hash_mismatch");
    if (!reviewMemory.entries.some((entry) => entry.reviewHash === review.reviewHash && entry.evidenceDecisionHash === evidenceDecision.decisionHash)) throw new Error("external_publication_authorization_review_not_recorded");
    return { ok: true, reviewHash: review.reviewHash, outcome: review.outcome, eligibleForAuthorizationGrant: verdict.eligibleForAuthorizationGrant, externalPublicationAuthorized: false };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_authorization_review_invalid" };
  }
}
