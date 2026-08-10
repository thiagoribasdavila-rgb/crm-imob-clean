import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_SCHEMA,
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization,
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory,
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy,
} from "./controlled-proof-execution-following-subsequent-continuation-observation-review-authorization.mjs";

export const CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_POLICY_SCHEMA =
  "atlas.controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption-policy.v1";
export const CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_RECEIPT_SCHEMA =
  "atlas.controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption-receipt.v1";
export const CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_MEMORY_SCHEMA =
  "atlas.controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption-memory.v1";
export const CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_MEMORY_ENTRY_SCHEMA =
  "atlas.controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption-memory-entry.v1";
export const CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_SIGNATURE_ALGORITHM = "ed25519";
export const CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMER_ROLE =
  "following-subsequent-continuation-observation-review-authorization-consumer";

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

function authorizationPolicyContext(args) {
  const {
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy: _authorizationPolicy,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy: _consumptionPolicy,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: _consumptionMemory,
    trustedReviewAuthorizationConsumers: _consumers,
    ...context
  } = args;
  return context;
}

function normalizeConsumer(consumer) {
  if (!consumer || typeof consumer !== "object" || Array.isArray(consumer)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer_invalid");
  }
  assertSlug(consumer.keyId, "controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer_key_id");
  assertSlug(consumer.actorId, "controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer_actor_id");
  if (consumer.role !== CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMER_ROLE) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer_role_invalid");
  }
  if (!["active", "inactive"].includes(consumer.status)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer_status_invalid");
  }
  assertIso(consumer.validFrom, "controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer_valid_from");
  assertIso(consumer.validUntil, "controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer_valid_until");
  if (Date.parse(consumer.validUntil) <= Date.parse(consumer.validFrom)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer_validity_invalid");
  }
  try {
    const key = createPublicKey(consumer.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer_public_key_invalid");
  }
  return {
    keyId: consumer.keyId,
    actorId: consumer.actorId,
    role: consumer.role,
    publicKeyPem: consumer.publicKeyPem,
    validFrom: consumer.validFrom,
    validUntil: consumer.validUntil,
    status: consumer.status,
  };
}

export function createControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy({
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy: authorizationPolicy,
  trustedReviewAuthorizationConsumers = [],
  ...upstream
}) {
  const authorizationInspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy(
    authorizationPolicy,
    authorizationPolicyContext(upstream),
  );
  if (!authorizationInspection.ok) {
    throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_policy_invalid:${authorizationInspection.reason}`);
  }
  if (!Array.isArray(trustedReviewAuthorizationConsumers)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumers_invalid");
  }
  const consumers = trustedReviewAuthorizationConsumers.map(normalizeConsumer).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(consumers.map((item) => item.keyId)).size !== consumers.length) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer_key_id_duplicate");
  }
  if (new Set(consumers.map((item) => item.actorId)).size !== consumers.length) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer_actor_id_duplicate");
  }
  const payload = {
    schema: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_POLICY_SCHEMA,
    compositionId: authorizationPolicy.compositionId,
    compositionDecisionHash: authorizationPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: authorizationPolicy.publicationDecisionPolicyHash,
    executionStartPolicyHash: authorizationPolicy.executionStartPolicyHash,
    executionObservationPolicyHash: authorizationPolicy.executionObservationPolicyHash,
    continuationAuthorizationPolicyHash: authorizationPolicy.continuationAuthorizationPolicyHash,
    continuationPolicyHash: authorizationPolicy.continuationPolicyHash,
    continuationObservationPolicyHash: authorizationPolicy.continuationObservationPolicyHash,
    reviewPolicyHash: authorizationPolicy.reviewPolicyHash,
    reviewAuthorizationPolicyHash: authorizationPolicy.policyHash,
    requiredReviewAuthorizationSchema: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_SCHEMA,
    requiredMemoryEntrySchema: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_MEMORY_ENTRY_SCHEMA,
    authorizationConsumerRole: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMER_ROLE,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_SIGNATURE_ALGORITHM,
    trustedReviewAuthorizationConsumers: consumers,
    recordedUnexpiredSingleUseAuthorizationRequired: true,
    exactReviewAuthorizationBindingRequired: true,
    exactReviewAuthorizationPolicyBindingRequired: true,
    exactReviewAuthorizationMemoryBindingRequired: true,
    exactReviewBindingRequired: true,
    exactFollowingSubsequentContinuationObservationBindingRequired: true,
    exactFollowingSubsequentContinuationBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    consumerIndependenceRequired: true,
    consumerValidityAtConsumptionRequired: true,
    signedConsumptionReceiptRequired: true,
    appendOnlyConsumptionMemoryRequired: true,
    duplicateAuthorizationConsumptionRejected: true,
    atomicMemoryHeadBindingRequired: true,
    singleUseConsumptionRequired: true,
    maximumUses: 1,
    authorizationConsumptionAllowed: true,
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

export function inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(policy, context) {
  try {
    const recreated = createControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(context);
    if (recreated.policyHash !== policy?.policyHash) {
      return { ok: false, reason: "controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_policy_hash_mismatch" };
    }
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) {
      return { ok: false, reason: "controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_policy_contract_mismatch" };
    }
    return { ok: true, policyHash: recreated.policyHash, trustedConsumers: recreated.trustedReviewAuthorizationConsumers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedConsumptions: entries.length,
      consumedSingleUseAuthorizations: entries.filter((entry) => entry.reviewAuthorizationConsumed === true).length,
      distinctAuthorizations: new Set(entries.map((entry) => entry.reviewAuthorizationHash)).size,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      followingSubsequentContinuationAuthorizationConsumed: entries.length > 0,
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

export function createControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_POLICY_SCHEMA) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_policy_invalid");
  }
  assertHash(policy.policyHash, "controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_policy_hash");
  if (!Array.isArray(entries)) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_entries_invalid");
  let previousEntryHash = null;
  const authorizationHashes = new Set();
  const consumptionIds = new Set();
  const nonces = new Set();
  const normalized = [];
  for (const [index, entry] of entries.entries()) {
    if (entry?.schema !== CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_MEMORY_ENTRY_SCHEMA) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_entry_schema_invalid");
    }
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_chain_invalid");
    }
    for (const field of [
      "consumptionReceiptHash", "consumptionPolicyHash", "consumptionMemoryHashBefore", "reviewAuthorizationHash",
      "reviewAuthorizationPolicyHash", "reviewAuthorizationMemoryHash", "reviewReceiptHash", "reviewPolicyHash",
      "reviewMemoryHash", "followingSubsequentContinuationObservationReceiptHash",
      "followingSubsequentContinuationObservationPolicyHash", "followingSubsequentContinuationObservationMemoryHash",
      "followingSubsequentContinuationReceiptHash", "followingSubsequentContinuationPolicyHash",
      "followingSubsequentContinuationMemoryHash", "packageSha256", "inventoryHash",
    ]) assertHash(entry[field], `controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_${field}`);
    for (const [value, field] of [
      [entry.reviewAuthorizationId, "review_authorization_id"], [entry.consumptionId, "consumption_id"],
      [entry.consumerActorId, "consumer_actor_id"], [entry.nonce, "nonce"],
    ]) assertSlug(value, `controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_${field}`);
    assertIso(entry.consumedAt, "controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_consumed_at");
    if (entry.consumptionPolicyHash !== policy.policyHash) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_policy_binding_mismatch");
    }
    if (entry.consumptionMemoryHashBefore !== memoryHashForEntries(policy, normalized)) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_head_binding_mismatch");
    }
    if (authorizationHashes.has(entry.reviewAuthorizationHash)) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_already_consumed");
    }
    if (consumptionIds.has(entry.consumptionId)) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_duplicate_id");
    }
    if (nonces.has(entry.nonce)) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_duplicate_nonce");
    }
    if (
      entry.authorizationConsumptionVerified !== true || entry.singleUse !== true || entry.maximumUses !== 1 ||
      entry.remainingUses !== 0 || entry.reviewAuthorizationConsumed !== true || entry.consumptionRecorded !== true ||
      entry.followingSubsequentContinuationAllowed !== false
    ) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_single_use_contract_invalid");
    for (const key of ["followingSubsequentContinuationExecuted", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_${key}_must_be_false`);
    }
    const entryPayload = { ...entry };
    delete entryPayload.entryHash;
    if (digest(entryPayload) !== entry.entryHash) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_entry_hash_mismatch");
    }
    normalized.push({ ...entry });
    authorizationHashes.add(entry.reviewAuthorizationHash);
    consumptionIds.add(entry.consumptionId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory(memory, { policy }) {
  try {
    const recreated = createControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) {
      return { ok: false, reason: "controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_hash_mismatch" };
    }
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) {
      return { ok: false, reason: "controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_contract_mismatch" };
    }
    return { ok: true, memoryHash: recreated.memoryHash, ...recreated.summary };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_invalid" };
  }
}

function consumptionPolicyContext(args) {
  return {
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy:
      args.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy,
    trustedReviewAuthorizationConsumers: args.trustedReviewAuthorizationConsumers,
    ...authorizationPolicyContext(args),
  };
}

function verifyContext(args) {
  const policyInspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(
    args.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
    consumptionPolicyContext(args),
  );
  if (!policyInspection.ok) throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_policy_invalid:${policyInspection.reason}`);
  const memoryInspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory(
    args.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
    { policy: args.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy },
  );
  if (!memoryInspection.ok) throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_invalid:${memoryInspection.reason}`);
  const authorizationMemoryInspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory(
    args.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory,
    { policy: args.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy },
  );
  if (!authorizationMemoryInspection.ok) throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_invalid:${authorizationMemoryInspection.reason}`);
}

function authorizationInspectionContext(args) {
  const {
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization: _authorization,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy: _consumptionPolicy,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: _consumptionMemory,
    trustedReviewAuthorizationConsumers: _consumers,
    reviewAuthorizationConsumptionId: _consumptionId,
    reviewAuthorizationConsumerKeyId: _consumerKeyId,
    reviewAuthorizationConsumerPrivateKey: _privateKey,
    consumedAt: _consumedAt,
    consumptionNonce: _nonce,
    ...context
  } = args;
  return context;
}

function collectPriorIdentities(value, identities = new Set(), visited = new Set()) {
  if (!value || typeof value !== "object" || visited.has(value)) return identities;
  visited.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if ((key.endsWith("ActorId") || key.endsWith("KeyId")) && typeof nested === "string") identities.add(nested);
    else if (nested && typeof nested === "object") collectPriorIdentities(nested, identities, visited);
  }
  return identities;
}

function inspectEligibleAuthorization(authorization, args) {
  const inspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization(
    authorization,
    authorizationInspectionContext(args),
  );
  if (!inspection.ok) {
    throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_invalid:${inspection.reason}`);
  }
  if (
    authorization.reviewAuthorizationRecorded !== true || authorization.nextSubsequentContinuationAuthorized !== true ||
    authorization.singleUse !== true || authorization.maximumFollowingSubsequentContinuations !== 1 ||
    authorization.remainingFollowingSubsequentContinuations !== 1 || authorization.nextSubsequentContinuationExecuted !== false
  ) throw new Error("recorded_unexpired_single_use_review_authorization_required_for_consumption");
  return inspection;
}

function validateConsumptionWindow(authorization, consumer, consumedAt) {
  assertIso(consumedAt, "controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumed_at");
  const consumed = Date.parse(consumedAt);
  if (consumed < Date.parse(authorization.authorizedAt)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_before_authorization");
  }
  if (consumed >= Date.parse(authorization.expiresAt)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_after_expiration");
  }
  if (consumer.status !== "active") {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer_inactive");
  }
  if (consumed < Date.parse(consumer.validFrom) || consumed > Date.parse(consumer.validUntil)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer_key_outside_validity");
  }
  const identities = collectPriorIdentities(authorization);
  if (identities.has(consumer.actorId) || identities.has(consumer.keyId)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer_not_independent");
  }
}

function signingPayload({ authorization, authorizationMemory, consumptionPolicy, consumptionMemoryHashBefore, consumptionId, consumer, consumedAt, nonce }) {
  if (!authorizationMemory.entries.some((entry) => entry.reviewAuthorizationHash === authorization.reviewAuthorizationHash && entry.remainingFollowingSubsequentContinuations === 1)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_not_recorded");
  }
  return {
    signingSchema: "atlas.controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption-signing-payload.v1",
    compositionId: authorization.compositionId,
    reviewAuthorizationHash: authorization.reviewAuthorizationHash,
    reviewAuthorizationPolicyHash: authorization.reviewAuthorizationPolicyHash,
    reviewAuthorizationMemoryHash: authorizationMemory.memoryHash,
    reviewReceiptHash: authorization.reviewReceiptHash,
    reviewPolicyHash: authorization.reviewPolicyHash,
    reviewMemoryHash: authorization.reviewMemoryHash,
    followingSubsequentContinuationObservationReceiptHash: authorization.nextSubsequentContinuationObservationReceiptHash,
    followingSubsequentContinuationObservationPolicyHash: authorization.nextSubsequentContinuationObservationPolicyHash,
    followingSubsequentContinuationObservationMemoryHash: authorization.nextSubsequentContinuationObservationMemoryHash,
    followingSubsequentContinuationReceiptHash: authorization.nextSubsequentContinuationReceiptHash,
    followingSubsequentContinuationPolicyHash: authorization.nextSubsequentContinuationPolicyHash,
    followingSubsequentContinuationMemoryHash: authorization.nextSubsequentContinuationMemoryHash,
    packageSha256: authorization.packageSha256,
    inventoryHash: authorization.inventoryHash,
    reviewAuthorizationId: authorization.reviewAuthorizationId,
    reviewId: authorization.reviewId,
    observationId: authorization.observationId,
    followingSubsequentContinuationId: authorization.nextSubsequentContinuationId,
    consumptionPolicyHash: consumptionPolicy.policyHash,
    consumptionMemoryHashBefore,
    consumptionId,
    consumerKeyId: consumer.keyId,
    consumerActorId: consumer.actorId,
    consumedAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  const signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url");
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) {
    throw new Error("private_key_does_not_match_controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer");
  }
  return signature;
}

export function consumeControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization({
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization: authorization,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory: authorizationMemory,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy: consumptionPolicy,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: consumptionMemory,
  reviewAuthorizationConsumptionId: consumptionId,
  reviewAuthorizationConsumerKeyId: consumerKeyId,
  reviewAuthorizationConsumerPrivateKey: consumerPrivateKey,
  consumedAt,
  consumptionNonce: nonce,
  ...upstream
}) {
  const args = {
    ...upstream,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization: authorization,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory: authorizationMemory,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy: consumptionPolicy,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: consumptionMemory,
    trustedReviewAuthorizationConsumers: consumptionPolicy.trustedReviewAuthorizationConsumers,
  };
  verifyContext(args);
  inspectEligibleAuthorization(authorization, args);
  for (const [value, field] of [[consumptionId, "consumption_id"], [consumerKeyId, "consumer_key_id"], [nonce, "nonce"]]) {
    assertSlug(value, `controlled_proof_execution_subsequent_continuation_observation_review_authorization_${field}`);
  }
  const consumer = consumptionPolicy.trustedReviewAuthorizationConsumers.find((item) => item.keyId === consumerKeyId);
  if (!consumer) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer_untrusted");
  validateConsumptionWindow(authorization, consumer, consumedAt);
  if (consumptionMemory.entries.some((entry) => entry.reviewAuthorizationHash === authorization.reviewAuthorizationHash)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_already_consumed");
  }
  if (consumptionMemory.entries.some((entry) => entry.consumptionId === consumptionId)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_duplicate_id");
  }
  if (consumptionMemory.entries.some((entry) => entry.nonce === nonce)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_duplicate_nonce");
  }
  const consumptionMemoryHashBefore = consumptionMemory.memoryHash;
  const payload = signingPayload({ authorization, authorizationMemory, consumptionPolicy, consumptionMemoryHashBefore, consumptionId, consumer, consumedAt, nonce });
  const signature = signPayload(payload, consumerPrivateKey, consumer.publicKeyPem);
  const unsigned = {
    schema: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_RECEIPT_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_SIGNATURE_ALGORITHM,
    consumptionRecorded: true,
    authorizationConsumptionVerified: true,
    singleUse: true,
    maximumUses: 1,
    remainingUses: 0,
    reviewAuthorizationConsumed: true,
    followingSubsequentContinuationAuthorizationConsumed: true,
    followingSubsequentContinuationAllowed: false,
    followingSubsequentContinuationExecuted: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const consumptionReceipt = { ...unsigned, consumptionReceiptHash: digest(unsigned) };
  const entryPayload = {
    schema: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_MEMORY_ENTRY_SCHEMA,
    sequence: consumptionMemory.entries.length + 1,
    previousEntryHash: consumptionMemory.entries.at(-1)?.entryHash ?? null,
    consumptionReceiptHash: consumptionReceipt.consumptionReceiptHash,
    consumptionPolicyHash: consumptionPolicy.policyHash,
    consumptionMemoryHashBefore,
    reviewAuthorizationHash: authorization.reviewAuthorizationHash,
    reviewAuthorizationPolicyHash: authorization.reviewAuthorizationPolicyHash,
    reviewAuthorizationMemoryHash: authorizationMemory.memoryHash,
    reviewReceiptHash: authorization.reviewReceiptHash,
    reviewPolicyHash: authorization.reviewPolicyHash,
    reviewMemoryHash: authorization.reviewMemoryHash,
    followingSubsequentContinuationObservationReceiptHash: authorization.nextSubsequentContinuationObservationReceiptHash,
    followingSubsequentContinuationObservationPolicyHash: authorization.nextSubsequentContinuationObservationPolicyHash,
    followingSubsequentContinuationObservationMemoryHash: authorization.nextSubsequentContinuationObservationMemoryHash,
    followingSubsequentContinuationReceiptHash: authorization.nextSubsequentContinuationReceiptHash,
    followingSubsequentContinuationPolicyHash: authorization.nextSubsequentContinuationPolicyHash,
    followingSubsequentContinuationMemoryHash: authorization.nextSubsequentContinuationMemoryHash,
    packageSha256: authorization.packageSha256,
    inventoryHash: authorization.inventoryHash,
    reviewAuthorizationId: authorization.reviewAuthorizationId,
    consumptionId,
    consumerActorId: consumer.actorId,
    consumedAt,
    nonce,
    authorizationConsumptionVerified: true,
    singleUse: true,
    maximumUses: 1,
    remainingUses: 0,
    reviewAuthorizationConsumed: true,
    consumptionRecorded: true,
    followingSubsequentContinuationAllowed: false,
    followingSubsequentContinuationExecuted: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  const entry = { ...entryPayload, entryHash: digest(entryPayload) };
  return {
    consumptionReceipt,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
      createControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory({
        policy: consumptionPolicy,
        entries: [...consumptionMemory.entries, entry],
      }),
  };
}

export function inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionReceipt(receipt, {
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization: authorization,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory: authorizationMemory,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy: consumptionPolicy,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: consumptionMemory,
  ...upstream
}) {
  try {
    if (receipt?.schema !== CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_RECEIPT_SCHEMA) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_receipt_schema_invalid");
    }
    const args = {
      ...upstream,
      controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization: authorization,
      controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory: authorizationMemory,
      controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy: consumptionPolicy,
      controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: consumptionMemory,
      trustedReviewAuthorizationConsumers: consumptionPolicy.trustedReviewAuthorizationConsumers,
    };
    verifyContext(args);
    inspectEligibleAuthorization(authorization, args);
    const entryIndex = consumptionMemory.entries.findIndex((entry) => entry.consumptionReceiptHash === receipt.consumptionReceiptHash);
    if (entryIndex < 0) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_not_recorded");
    const consumer = consumptionPolicy.trustedReviewAuthorizationConsumers.find((item) => item.keyId === receipt.consumerKeyId);
    if (!consumer) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer_untrusted");
    validateConsumptionWindow(authorization, consumer, receipt.consumedAt);
    const consumptionMemoryHashBefore = memoryHashForEntries(consumptionPolicy, consumptionMemory.entries.slice(0, entryIndex));
    const payload = signingPayload({
      authorization,
      authorizationMemory,
      consumptionPolicy,
      consumptionMemoryHashBefore,
      consumptionId: receipt.consumptionId,
      consumer,
      consumedAt: receipt.consumedAt,
      nonce: receipt.nonce,
    });
    for (const [key, expected] of Object.entries(payload)) {
      if (JSON.stringify(receipt[key]) !== JSON.stringify(expected)) {
        throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_${key}_mismatch`);
      }
    }
    if (receipt.signatureAlgorithm !== CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_SIGNATURE_ALGORITHM || typeof receipt.signature !== "string") {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_signature_invalid");
    }
    if (!cryptoVerify(null, bytes(payload), consumer.publicKeyPem, Buffer.from(receipt.signature, "base64url"))) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_signature_verification_failed");
    }
    if (
      receipt.consumptionRecorded !== true || receipt.authorizationConsumptionVerified !== true || receipt.singleUse !== true ||
      receipt.maximumUses !== 1 || receipt.remainingUses !== 0 || receipt.reviewAuthorizationConsumed !== true ||
      receipt.followingSubsequentContinuationAuthorizationConsumed !== true || receipt.followingSubsequentContinuationAllowed !== false
    ) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_receipt_contract_invalid");
    for (const key of ["followingSubsequentContinuationExecuted", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (receipt[key] !== false) throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_${key}_must_be_false`);
    }
    const hashPayload = { ...receipt };
    delete hashPayload.consumptionReceiptHash;
    if (digest(hashPayload) !== receipt.consumptionReceiptHash) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_receipt_hash_mismatch");
    }
    const entry = consumptionMemory.entries[entryIndex];
    if (
      entry.reviewAuthorizationHash !== authorization.reviewAuthorizationHash ||
      entry.reviewAuthorizationMemoryHash !== authorizationMemory.memoryHash ||
      entry.consumptionMemoryHashBefore !== consumptionMemoryHashBefore ||
      entry.consumerActorId !== consumer.actorId || entry.remainingUses !== 0 || entry.reviewAuthorizationConsumed !== true
    ) throw new Error("controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_entry_mismatch");
    return {
      ok: true,
      consumptionReceiptHash: receipt.consumptionReceiptHash,
      reviewAuthorizationHash: receipt.reviewAuthorizationHash,
      reviewAuthorizationConsumed: true,
      remainingUses: 0,
      followingSubsequentContinuationExecuted: false,
      publicationExecuted: false,
      externalPublicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_receipt_invalid" };
  }
}
