import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW_SCHEMA,
  inspectControlledExternalPublicationAuthorizationReview,
  inspectControlledExternalPublicationAuthorizationReviewMemory,
  inspectControlledExternalPublicationAuthorizationReviewPolicy,
} from "./controlled-external-publication-authorization-review.mjs";

export const CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT_POLICY_SCHEMA = "atlas.controlled-external-publication-authorization-grant-policy.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT_SCHEMA = "atlas.controlled-external-publication-authorization-grant.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT_MEMORY_SCHEMA = "atlas.controlled-external-publication-authorization-grant-memory.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT_MEMORY_ENTRY_SCHEMA = "atlas.controlled-external-publication-authorization-grant-memory-entry.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANTOR_ROLE = "release-external-publication-authorization-grantor";
export const CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT_SIGNATURE_ALGORITHM = "ed25519";

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

function normalizeGrantor(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("external_publication_authorization_grantor_invalid");
  assertSlug(value.keyId, "external_publication_authorization_grantor_key_id");
  assertSlug(value.actorId, "external_publication_authorization_grantor_actor_id");
  if (value.role !== CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANTOR_ROLE) throw new Error("external_publication_authorization_grantor_role_invalid");
  if (!["active", "inactive"].includes(value.status)) throw new Error("external_publication_authorization_grantor_status_invalid");
  assertIso(value.validFrom, "external_publication_authorization_grantor_valid_from");
  assertIso(value.validUntil, "external_publication_authorization_grantor_valid_until");
  if (Date.parse(value.validUntil) <= Date.parse(value.validFrom)) throw new Error("external_publication_authorization_grantor_validity_invalid");
  try {
    const key = createPublicKey(value.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch {
    throw new Error("external_publication_authorization_grantor_public_key_invalid");
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

function priorIdentities({ controlledExternalPublicationReviewPolicy, publicationEvidenceAdjudicationPolicy, executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy }) {
  return new Set([
    ...(controlledExternalPublicationReviewPolicy.trustedReviewers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(publicationEvidenceAdjudicationPolicy.trustedAdjudicators ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(executionPolicy.trustedExecutors ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(executionAuthorizationPolicy.trustedExecutionAuthorizers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(publicationPolicy.trustedPublicationDirectors ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(evidencePolicy.trustedEvidenceCustodians ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(assemblyPolicy.trustedPackageAssemblers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(packageAuthorizationPolicy.trustedPackageAuthorizers ?? []).flatMap((item) => [item.keyId, item.actorId]),
  ]);
}

function reviewPolicyContext(context) {
  return {
    publicationEvidenceAdjudicationPolicy: context.publicationEvidenceAdjudicationPolicy,
    executionPolicy: context.executionPolicy,
    executionAuthorizationPolicy: context.executionAuthorizationPolicy,
    publicationPolicy: context.publicationPolicy,
    evidencePolicy: context.evidencePolicy,
    assemblyPolicy: context.assemblyPolicy,
    packageAuthorizationPolicy: context.packageAuthorizationPolicy,
  };
}

function verifyReviewPolicy(controlledExternalPublicationReviewPolicy, context) {
  const inspection = inspectControlledExternalPublicationAuthorizationReviewPolicy(controlledExternalPublicationReviewPolicy, reviewPolicyContext(context));
  if (!inspection.ok) throw new Error(`external_publication_authorization_review_policy_invalid:${inspection.reason}`);
}

export function createControlledExternalPublicationAuthorizationGrantPolicy({
  controlledExternalPublicationReviewPolicy,
  publicationEvidenceAdjudicationPolicy,
  executionPolicy,
  executionAuthorizationPolicy,
  publicationPolicy,
  evidencePolicy,
  assemblyPolicy,
  packageAuthorizationPolicy,
  trustedGrantors = [],
  maxGrantDelaySeconds = 600,
  maxGrantValiditySeconds = 300,
  minReasonLength = 12,
}) {
  const context = { publicationEvidenceAdjudicationPolicy, executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy };
  verifyReviewPolicy(controlledExternalPublicationReviewPolicy, context);
  if (!Array.isArray(trustedGrantors)) throw new Error("trusted_external_publication_authorization_grantors_invalid");
  const grantors = trustedGrantors.map(normalizeGrantor).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(grantors.map((item) => item.keyId)).size !== grantors.length) throw new Error("duplicate_external_publication_authorization_grantor_key_id");
  if (new Set(grantors.map((item) => item.actorId)).size !== grantors.length) throw new Error("duplicate_external_publication_authorization_grantor_actor_id");
  const forbidden = priorIdentities({ controlledExternalPublicationReviewPolicy, ...context });
  if (grantors.some((item) => forbidden.has(item.keyId) || forbidden.has(item.actorId))) throw new Error("external_publication_authorization_grantor_must_be_independent");
  if (!Number.isInteger(maxGrantDelaySeconds) || maxGrantDelaySeconds < 1 || maxGrantDelaySeconds > 86400) throw new Error("external_publication_authorization_max_grant_delay_invalid");
  if (!Number.isInteger(maxGrantValiditySeconds) || maxGrantValiditySeconds < 1 || maxGrantValiditySeconds > 3600) throw new Error("external_publication_authorization_max_grant_validity_invalid");
  if (!Number.isInteger(minReasonLength) || minReasonLength < 8 || minReasonLength > 500) throw new Error("external_publication_authorization_grant_min_reason_length_invalid");
  const payload = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT_POLICY_SCHEMA,
    compositionId: controlledExternalPublicationReviewPolicy.compositionId,
    compositionDecisionHash: controlledExternalPublicationReviewPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: controlledExternalPublicationReviewPolicy.publicationDecisionPolicyHash,
    executionAuthorizationPolicyHash: controlledExternalPublicationReviewPolicy.executionAuthorizationPolicyHash,
    executionPolicyHash: controlledExternalPublicationReviewPolicy.executionPolicyHash,
    evidenceAdjudicationPolicyHash: controlledExternalPublicationReviewPolicy.evidenceAdjudicationPolicyHash,
    authorizationReviewPolicyHash: controlledExternalPublicationReviewPolicy.policyHash,
    requiredReviewSchema: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW_SCHEMA,
    requiredReviewMemoryEntrySchema: "atlas.controlled-external-publication-authorization-review-memory-entry.v1",
    requiredMemoryEntrySchema: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT_MEMORY_ENTRY_SCHEMA,
    grantorRole: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANTOR_ROLE,
    signatureAlgorithm: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT_SIGNATURE_ALGORITHM,
    trustedGrantors: grantors,
    allowedOutcomes: ["granted", "denied"],
    maxGrantDelaySeconds,
    maxGrantValiditySeconds,
    minReasonLength,
    eligibleRecordedReviewRequiredForGrant: true,
    exactReviewBindingRequired: true,
    exactReviewMemoryBindingRequired: true,
    exactEvidenceDecisionBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    independentAuthorizationGrantorRequired: true,
    signedGrantRequired: true,
    appendOnlyGrantMemoryRequired: true,
    duplicateReviewGrantRejected: true,
    shortLivedGrantRequired: true,
    singleUseGrantRequired: true,
    maximumUses: 1,
    externalPublicationAuthorizationGrantAllowed: true,
    networkAccessAllowed: false,
    databaseMutationAllowed: false,
    externalPublicationAllowed: false,
    automaticAuthorizationConsumption: false,
    automaticPackageGeneration: false,
    automaticBuild: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectControlledExternalPublicationAuthorizationGrantPolicy(policy, context) {
  try {
    const recreated = createControlledExternalPublicationAuthorizationGrantPolicy({
      ...context,
      trustedGrantors: policy?.trustedGrantors,
      maxGrantDelaySeconds: policy?.maxGrantDelaySeconds,
      maxGrantValiditySeconds: policy?.maxGrantValiditySeconds,
      minReasonLength: policy?.minReasonLength,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "external_publication_authorization_grant_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "external_publication_authorization_grant_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedGrantors: recreated.trustedGrantors.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_authorization_grant_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedGrants: entries.length,
      authorizedGrants: entries.filter((entry) => entry.outcome === "granted").length,
      deniedGrants: entries.filter((entry) => entry.outcome === "denied").length,
      unconsumedSingleUseGrants: entries.filter((entry) => entry.externalPublicationAuthorized && !entry.authorizationConsumed).length,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      externalPublicationAuthorized: entries.some((entry) => entry.externalPublicationAuthorized && !entry.authorizationConsumed),
      authorizationConsumed: false,
      publicationExecuted: false,
      externalPublicationExecuted: false,
      packageGenerated: false,
      buildExecuted: false,
      deployExecuted: false,
      releasePromoted: false,
    },
  };
}

export function createControlledExternalPublicationAuthorizationGrantMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT_POLICY_SCHEMA) throw new Error("external_publication_authorization_grant_memory_policy_invalid");
  if (!Array.isArray(entries)) throw new Error("external_publication_authorization_grant_memory_entries_invalid");
  let previousEntryHash = null;
  const reviewHashes = new Set();
  const grantIds = new Set();
  const nonces = new Set();
  const normalized = entries.map((entry, index) => {
    if (entry?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT_MEMORY_ENTRY_SCHEMA) throw new Error("external_publication_authorization_grant_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("external_publication_authorization_grant_memory_chain_invalid");
    for (const field of ["grantHash", "reviewHash", "reviewPolicyHash", "reviewMemoryHash", "evidenceDecisionHash", "receiptHash", "packageSha256", "inventoryHash"]) assertHash(entry[field], `external_publication_authorization_grant_memory_${field}`);
    assertSlug(entry.grantId, "external_publication_authorization_grant_memory_grant_id");
    assertSlug(entry.reviewId, "external_publication_authorization_grant_memory_review_id");
    assertSlug(entry.nonce, "external_publication_authorization_grant_memory_nonce");
    assertIso(entry.grantedAt, "external_publication_authorization_grant_memory_granted_at");
    assertIso(entry.expiresAt, "external_publication_authorization_grant_memory_expires_at");
    if (!policy.allowedOutcomes.includes(entry.outcome)) throw new Error("external_publication_authorization_grant_memory_outcome_invalid");
    if (reviewHashes.has(entry.reviewHash)) throw new Error("external_publication_authorization_review_already_granted");
    if (grantIds.has(entry.grantId)) throw new Error("external_publication_authorization_grant_duplicate_grant_id");
    if (nonces.has(entry.nonce)) throw new Error("external_publication_authorization_grant_duplicate_nonce");
    const authorized = entry.outcome === "granted";
    if (
      entry.grantRecorded !== true
      || typeof entry.eligibleReviewVerified !== "boolean"
      || (authorized && entry.eligibleReviewVerified !== true)
      || entry.externalPublicationAuthorized !== authorized
    ) throw new Error("external_publication_authorization_grant_memory_safety_contract_invalid");
    if (entry.singleUse !== true || entry.maximumUses !== 1 || entry.remainingUses !== (authorized ? 1 : 0) || entry.authorizationConsumed !== false) throw new Error("external_publication_authorization_grant_memory_single_use_contract_invalid");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`external_publication_authorization_grant_memory_${key}_must_be_false`);
    }
    const hashPayload = { ...entry };
    delete hashPayload.entryHash;
    if (digest(hashPayload) !== entry.entryHash) throw new Error("external_publication_authorization_grant_memory_entry_hash_mismatch");
    reviewHashes.add(entry.reviewHash);
    grantIds.add(entry.grantId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
    return { ...entry };
  });
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledExternalPublicationAuthorizationGrantMemory(memory, { policy }) {
  try {
    const recreated = createControlledExternalPublicationAuthorizationGrantMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "external_publication_authorization_grant_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "external_publication_authorization_grant_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, recordedGrants: recreated.entries.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_authorization_grant_memory_invalid" };
  }
}

function verifyGrantContext({ grantPolicy, grantMemory, reviewPolicy, reviewMemory, publicationEvidenceAdjudicationPolicy, context }) {
  const policyInspection = inspectControlledExternalPublicationAuthorizationGrantPolicy(grantPolicy, {
    controlledExternalPublicationReviewPolicy: reviewPolicy,
    publicationEvidenceAdjudicationPolicy,
    ...context,
  });
  if (!policyInspection.ok) throw new Error(`external_publication_authorization_grant_policy_invalid:${policyInspection.reason}`);
  const memoryInspection = inspectControlledExternalPublicationAuthorizationGrantMemory(grantMemory, { policy: grantPolicy });
  if (!memoryInspection.ok) throw new Error(`external_publication_authorization_grant_memory_invalid:${memoryInspection.reason}`);
  const reviewMemoryInspection = inspectControlledExternalPublicationAuthorizationReviewMemory(reviewMemory, { policy: reviewPolicy });
  if (!reviewMemoryInspection.ok) throw new Error(`external_publication_authorization_review_memory_invalid:${reviewMemoryInspection.reason}`);
}

function validateGrantWindow(review, grantor, policy, grantedAt, expiresAt) {
  assertIso(grantedAt, "external_publication_authorization_granted_at");
  assertIso(expiresAt, "external_publication_authorization_expires_at");
  const granted = Date.parse(grantedAt);
  const expires = Date.parse(expiresAt);
  const reviewed = Date.parse(review.reviewedAt);
  if (granted < reviewed) throw new Error("external_publication_authorization_grant_before_review");
  if (granted - reviewed > policy.maxGrantDelaySeconds * 1000) throw new Error("external_publication_authorization_grant_delay_exceeded");
  if (expires <= granted || expires - granted > policy.maxGrantValiditySeconds * 1000) throw new Error("external_publication_authorization_grant_validity_exceeded");
  if (grantor.status !== "active") throw new Error("external_publication_authorization_grantor_inactive");
  if (grantor.role !== policy.grantorRole) throw new Error("external_publication_authorization_grantor_role_mismatch");
  if (granted < Date.parse(grantor.validFrom) || expires > Date.parse(grantor.validUntil)) throw new Error("external_publication_authorization_grantor_key_outside_validity");
}

function validateOutcome(review, policy, outcome, reasonCode, reason) {
  if (!policy.allowedOutcomes.includes(outcome)) throw new Error("external_publication_authorization_grant_outcome_invalid");
  if (outcome === "granted" && review.eligibleForAuthorizationGrant !== true) throw new Error("eligible_recorded_review_required_for_external_publication_authorization_grant");
  const expectedCodes = outcome === "granted"
    ? ["eligible-review-authorized-once"]
    : (review.eligibleForAuthorizationGrant ? ["eligible-review-not-authorized"] : ["ineligible-review-denied"]);
  if (!expectedCodes.includes(reasonCode)) throw new Error("external_publication_authorization_grant_reason_code_invalid");
  if (typeof reason !== "string" || reason.trim().length < policy.minReasonLength || reason.trim().length > 2000) throw new Error("external_publication_authorization_grant_reason_invalid");
  return {
    outcome,
    reasonCode,
    reason: reason.trim(),
    eligibleReviewVerified: review.eligibleForAuthorizationGrant === true,
    externalPublicationAuthorized: outcome === "granted",
  };
}

function grantSigningPayload({ review, reviewMemory, grantPolicy, grantId, grantor, verdict, grantedAt, expiresAt, nonce }) {
  if (!reviewMemory.entries.some((entry) => entry.reviewHash === review.reviewHash)) throw new Error("external_publication_authorization_review_not_recorded");
  return {
    signingSchema: "atlas.controlled-external-publication-authorization-grant-signing-payload.v1",
    compositionId: review.compositionId,
    compositionDecisionHash: review.compositionDecisionHash,
    publicationDecisionHash: review.publicationDecisionHash,
    evidenceAdjudicationPolicyHash: review.evidenceAdjudicationPolicyHash,
    evidenceAdjudicationMemoryHash: review.evidenceAdjudicationMemoryHash,
    evidenceDecisionHash: review.evidenceDecisionHash,
    decisionId: review.decisionId,
    receiptHash: review.receiptHash,
    executionId: review.executionId,
    packageSha256: review.packageSha256,
    inventoryHash: review.inventoryHash,
    reviewPolicyHash: review.reviewPolicyHash,
    reviewMemoryHash: reviewMemory.memoryHash,
    reviewHash: review.reviewHash,
    reviewId: review.reviewId,
    grantPolicyHash: grantPolicy.policyHash,
    grantId,
    grantorKeyId: grantor.keyId,
    grantorActorId: grantor.actorId,
    grantorRole: grantor.role,
    outcome: verdict.outcome,
    reasonCode: verdict.reasonCode,
    reason: verdict.reason,
    eligibleReviewVerified: verdict.eligibleReviewVerified,
    externalPublicationAuthorized: verdict.externalPublicationAuthorized,
    singleUse: true,
    maximumUses: 1,
    grantedAt,
    expiresAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("external_publication_authorization_grant_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_external_publication_authorization_grantor");
  return signature;
}

function inspectReview(review, { reviewPolicy, reviewMemory, publicationEvidenceAdjudicationDecision, publicationEvidenceAdjudicationPolicy, publicationEvidenceAdjudicationMemory, decisionContext }) {
  const inspection = inspectControlledExternalPublicationAuthorizationReview(review, {
    publicationEvidenceAdjudicationDecision,
    publicationEvidenceAdjudicationPolicy,
    publicationEvidenceAdjudicationMemory,
    controlledExternalPublicationReviewPolicy: reviewPolicy,
    controlledExternalPublicationReviewMemory: reviewMemory,
    ...decisionContext,
  });
  if (!inspection.ok) throw new Error(`external_publication_authorization_review_invalid:${inspection.reason}`);
  return inspection;
}

export function grantControlledExternalPublicationAuthorization({
  controlledExternalPublicationAuthorizationReview: review,
  controlledExternalPublicationReviewPolicy: reviewPolicy,
  controlledExternalPublicationReviewMemory: reviewMemory,
  publicationEvidenceAdjudicationDecision,
  publicationEvidenceAdjudicationPolicy,
  publicationEvidenceAdjudicationMemory,
  controlledExternalPublicationAuthorizationGrantPolicy: grantPolicy,
  controlledExternalPublicationAuthorizationGrantMemory: grantMemory,
  grantId,
  grantorKeyId,
  grantorPrivateKey,
  outcome,
  reasonCode,
  reason,
  grantedAt,
  expiresAt,
  nonce,
  ...decisionContext
}) {
  const { authorizedPublicationExecutionPolicy: executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy } = decisionContext;
  const context = { executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy };
  verifyGrantContext({ grantPolicy, grantMemory, reviewPolicy, reviewMemory, publicationEvidenceAdjudicationPolicy, context });
  inspectReview(review, { reviewPolicy, reviewMemory, publicationEvidenceAdjudicationDecision, publicationEvidenceAdjudicationPolicy, publicationEvidenceAdjudicationMemory, decisionContext });
  assertSlug(grantId, "external_publication_authorization_grant_id");
  assertSlug(grantorKeyId, "external_publication_authorization_grantor_key_id");
  assertSlug(nonce, "external_publication_authorization_grant_nonce");
  if (grantMemory.entries.some((entry) => entry.reviewHash === review.reviewHash)) throw new Error("external_publication_authorization_review_already_granted");
  if (grantMemory.entries.some((entry) => entry.grantId === grantId)) throw new Error("external_publication_authorization_grant_duplicate_grant_id");
  if (grantMemory.entries.some((entry) => entry.nonce === nonce)) throw new Error("external_publication_authorization_grant_duplicate_nonce");
  const grantor = grantPolicy.trustedGrantors.find((item) => item.keyId === grantorKeyId);
  if (!grantor) throw new Error("external_publication_authorization_grantor_untrusted");
  if (grantor.keyId === review.reviewerKeyId || grantor.actorId === review.reviewerActorId) throw new Error("authorization_reviewer_cannot_grant_own_review");
  validateGrantWindow(review, grantor, grantPolicy, grantedAt, expiresAt);
  const verdict = validateOutcome(review, grantPolicy, outcome, reasonCode, reason);
  const payload = grantSigningPayload({ review, reviewMemory, grantPolicy, grantId, grantor, verdict, grantedAt, expiresAt, nonce });
  const signature = signPayload(payload, grantorPrivateKey, grantor.publicKeyPem);
  const grantValue = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT_SIGNATURE_ALGORITHM,
    grantRecorded: true,
    authorizationConsumed: false,
    remainingUses: verdict.externalPublicationAuthorized ? 1 : 0,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const grant = { ...grantValue, grantHash: digest(grantValue) };
  const entryPayload = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT_MEMORY_ENTRY_SCHEMA,
    sequence: grantMemory.entries.length + 1,
    previousEntryHash: grantMemory.entries.at(-1)?.entryHash ?? null,
    grantHash: grant.grantHash,
    grantId,
    nonce,
    reviewHash: review.reviewHash,
    reviewId: review.reviewId,
    reviewPolicyHash: reviewPolicy.policyHash,
    reviewMemoryHash: reviewMemory.memoryHash,
    evidenceDecisionHash: review.evidenceDecisionHash,
    receiptHash: review.receiptHash,
    packageSha256: review.packageSha256,
    inventoryHash: review.inventoryHash,
    grantorActorId: grantor.actorId,
    outcome: verdict.outcome,
    reasonCode: verdict.reasonCode,
    eligibleReviewVerified: verdict.eligibleReviewVerified,
    externalPublicationAuthorized: verdict.externalPublicationAuthorized,
    singleUse: true,
    maximumUses: 1,
    remainingUses: verdict.externalPublicationAuthorized ? 1 : 0,
    grantedAt,
    expiresAt,
    grantRecorded: true,
    authorizationConsumed: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  const entry = { ...entryPayload, entryHash: digest(entryPayload) };
  return {
    grant,
    controlledExternalPublicationAuthorizationGrantMemory: createControlledExternalPublicationAuthorizationGrantMemory({ policy: grantPolicy, entries: [...grantMemory.entries, entry] }),
  };
}

export function inspectControlledExternalPublicationAuthorizationGrant(grant, {
  controlledExternalPublicationAuthorizationReview: review,
  controlledExternalPublicationReviewPolicy: reviewPolicy,
  controlledExternalPublicationReviewMemory: reviewMemory,
  publicationEvidenceAdjudicationDecision,
  publicationEvidenceAdjudicationPolicy,
  publicationEvidenceAdjudicationMemory,
  controlledExternalPublicationAuthorizationGrantPolicy: grantPolicy,
  controlledExternalPublicationAuthorizationGrantMemory: grantMemory,
  ...decisionContext
}) {
  try {
    if (grant?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT_SCHEMA) throw new Error("external_publication_authorization_grant_schema_invalid");
    const { authorizedPublicationExecutionPolicy: executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy } = decisionContext;
    const context = { executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy };
    verifyGrantContext({ grantPolicy, grantMemory, reviewPolicy, reviewMemory, publicationEvidenceAdjudicationPolicy, context });
    inspectReview(review, { reviewPolicy, reviewMemory, publicationEvidenceAdjudicationDecision, publicationEvidenceAdjudicationPolicy, publicationEvidenceAdjudicationMemory, decisionContext });
    const grantor = grantPolicy.trustedGrantors.find((item) => item.keyId === grant.grantorKeyId);
    if (!grantor) throw new Error("external_publication_authorization_grantor_untrusted");
    if (grantor.keyId === review.reviewerKeyId || grantor.actorId === review.reviewerActorId) throw new Error("authorization_reviewer_cannot_grant_own_review");
    validateGrantWindow(review, grantor, grantPolicy, grant.grantedAt, grant.expiresAt);
    const verdict = validateOutcome(review, grantPolicy, grant.outcome, grant.reasonCode, grant.reason);
    const payload = grantSigningPayload({ review, reviewMemory, grantPolicy, grantId: grant.grantId, grantor, verdict, grantedAt: grant.grantedAt, expiresAt: grant.expiresAt, nonce: grant.nonce });
    for (const [key, expected] of Object.entries(payload)) if (JSON.stringify(grant[key]) !== JSON.stringify(expected)) throw new Error(`external_publication_authorization_grant_${key}_mismatch`);
    if (grant.signatureAlgorithm !== CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT_SIGNATURE_ALGORITHM || typeof grant.signature !== "string") throw new Error("external_publication_authorization_grant_signature_invalid");
    if (!cryptoVerify(null, bytes(payload), grantor.publicKeyPem, Buffer.from(grant.signature, "base64url"))) throw new Error("external_publication_authorization_grant_signature_verification_failed");
    if (grant.grantRecorded !== true || grant.eligibleReviewVerified !== verdict.eligibleReviewVerified || grant.externalPublicationAuthorized !== verdict.externalPublicationAuthorized) throw new Error("external_publication_authorization_grant_contract_invalid");
    if (grant.singleUse !== true || grant.maximumUses !== 1 || grant.remainingUses !== (verdict.externalPublicationAuthorized ? 1 : 0) || grant.authorizationConsumed !== false) throw new Error("external_publication_authorization_grant_single_use_contract_invalid");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (grant[key] !== false) throw new Error(`external_publication_authorization_grant_${key}_must_be_false`);
    }
    const hashPayload = { ...grant };
    delete hashPayload.grantHash;
    if (digest(hashPayload) !== grant.grantHash) throw new Error("external_publication_authorization_grant_hash_mismatch");
    if (!grantMemory.entries.some((entry) => entry.grantHash === grant.grantHash && entry.reviewHash === review.reviewHash)) throw new Error("external_publication_authorization_grant_not_recorded");
    return {
      ok: true,
      grantHash: grant.grantHash,
      outcome: grant.outcome,
      externalPublicationAuthorized: verdict.externalPublicationAuthorized,
      authorizationConsumed: false,
      remainingUses: grant.remainingUses,
      expiresAt: grant.expiresAt,
      publicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_authorization_grant_invalid" };
  }
}
