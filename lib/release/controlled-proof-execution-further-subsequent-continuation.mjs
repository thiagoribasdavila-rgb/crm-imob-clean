import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_RECEIPT_SCHEMA,
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionReceipt,
} from "./controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption.mjs";

export const CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_POLICY_SCHEMA =
  "atlas.controlled-proof-execution-further-subsequent-continuation-policy.v1";
export const CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_RECEIPT_SCHEMA =
  "atlas.controlled-proof-execution-further-subsequent-continuation-receipt.v1";
export const CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_MEMORY_SCHEMA =
  "atlas.controlled-proof-execution-further-subsequent-continuation-memory.v1";
export const CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_MEMORY_ENTRY_SCHEMA =
  "atlas.controlled-proof-execution-further-subsequent-continuation-memory-entry.v1";
export const CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_SIGNATURE_ALGORITHM = "ed25519";
export const CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_EXECUTOR_ROLE =
  "controlled-proof-execution-further-subsequent-continuation-executor";

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

function normalizeExecutor(executor) {
  if (!executor || typeof executor !== "object" || Array.isArray(executor)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_executor_invalid");
  }
  assertSlug(executor.keyId, "controlled_proof_execution_next_subsequent_continuation_executor_key_id");
  assertSlug(executor.actorId, "controlled_proof_execution_next_subsequent_continuation_executor_actor_id");
  if (executor.role !== CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_EXECUTOR_ROLE) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_executor_role_invalid");
  }
  if (!["active", "inactive"].includes(executor.status)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_executor_status_invalid");
  }
  assertIso(executor.validFrom, "controlled_proof_execution_next_subsequent_continuation_executor_valid_from");
  assertIso(executor.validUntil, "controlled_proof_execution_next_subsequent_continuation_executor_valid_until");
  if (Date.parse(executor.validUntil) <= Date.parse(executor.validFrom)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_executor_validity_invalid");
  }
  try {
    const key = createPublicKey(executor.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_executor_public_key_invalid");
  }
  return {
    keyId: executor.keyId,
    actorId: executor.actorId,
    role: executor.role,
    publicKeyPem: executor.publicKeyPem,
    validFrom: executor.validFrom,
    validUntil: executor.validUntil,
    status: executor.status,
  };
}

function stripFurtherSubsequentContinuationFields(args) {
  const {
    controlledProofExecutionFurtherSubsequentContinuation: _receipt,
    controlledProofExecutionFurtherSubsequentContinuationPolicy: _policy,
    controlledProofExecutionFurtherSubsequentContinuationMemory: _memory,
    trustedFurtherSubsequentContinuationExecutors: _executors,
    furtherSubsequentContinuationId: _continuationId,
    furtherSubsequentContinuationExecutorKeyId: _executorKeyId,
    furtherSubsequentContinuationExecutorPrivateKey: _privateKey,
    subsequentContinuedAt: _continuedAt,
    furtherSubsequentContinuationNonce: _nonce,
    ...context
  } = args;
  return context;
}

function consumptionPolicyContext(args) {
  const context = stripFurtherSubsequentContinuationFields(args);
  const consumptionPolicy = args.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy;
  delete context.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumption;
  delete context.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory;
  delete context.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy;
  return {
    ...context,
    trustedReviewAuthorizationConsumers: consumptionPolicy.trustedReviewAuthorizationConsumers,
  };
}

export function createControlledProofExecutionFurtherSubsequentContinuationPolicy({
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy: consumptionPolicy,
  trustedFurtherSubsequentContinuationExecutors = [],
  ...upstream
}) {
  const consumptionInspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(
    consumptionPolicy,
    consumptionPolicyContext({
      ...upstream,
      controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy: consumptionPolicy,
    }),
  );
  if (!consumptionInspection.ok) {
    throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_policy_invalid:${consumptionInspection.reason}`);
  }
  if (!Array.isArray(trustedFurtherSubsequentContinuationExecutors)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_executors_invalid");
  }
  const executors = trustedFurtherSubsequentContinuationExecutors.map(normalizeExecutor).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(executors.map((item) => item.keyId)).size !== executors.length) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_executor_key_id_duplicate");
  }
  if (new Set(executors.map((item) => item.actorId)).size !== executors.length) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_executor_actor_id_duplicate");
  }
  const payload = {
    schema: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_POLICY_SCHEMA,
    compositionId: consumptionPolicy.compositionId,
    compositionDecisionHash: consumptionPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: consumptionPolicy.publicationDecisionPolicyHash,
    executionStartPolicyHash: consumptionPolicy.executionStartPolicyHash,
    executionObservationPolicyHash: consumptionPolicy.executionObservationPolicyHash,
    continuationAuthorizationPolicyHash: consumptionPolicy.continuationAuthorizationPolicyHash,
    continuationPolicyHash: consumptionPolicy.continuationPolicyHash,
    continuationObservationPolicyHash: consumptionPolicy.continuationObservationPolicyHash,
    reviewPolicyHash: consumptionPolicy.reviewPolicyHash,
    reviewAuthorizationPolicyHash: consumptionPolicy.reviewAuthorizationPolicyHash,
    reviewAuthorizationConsumptionPolicyHash: consumptionPolicy.policyHash,
    requiredConsumptionReceiptSchema:
      CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_RECEIPT_SCHEMA,
    requiredMemoryEntrySchema: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_MEMORY_ENTRY_SCHEMA,
    furtherSubsequentContinuationExecutorRole: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_EXECUTOR_ROLE,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_SIGNATURE_ALGORITHM,
    trustedFurtherSubsequentContinuationExecutors: executors,
    recordedSignedAuthorizationConsumptionRequired: true,
    exactConsumptionReceiptBindingRequired: true,
    exactConsumptionPolicyBindingRequired: true,
    exactConsumptionMemoryBindingRequired: true,
    exactReviewAuthorizationBindingRequired: true,
    exactReviewBindingRequired: true,
    exactSubsequentContinuationObservationBindingRequired: true,
    exactPriorSubsequentContinuationBindingRequired: true,
    exactContinuationObservationBindingRequired: true,
    exactPriorContinuationBindingRequired: true,
    exactExecutionStartBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    executorIndependenceRequired: true,
    executorValidityAtContinuationRequired: true,
    authorizationValidityAtContinuationRequired: true,
    signedFurtherSubsequentContinuationReceiptRequired: true,
    appendOnlyFurtherSubsequentContinuationMemoryRequired: true,
    duplicateConsumptionContinuationRejected: true,
    atomicMemoryHeadBindingRequired: true,
    singleUseFurtherSubsequentContinuationRequired: true,
    maximumFurtherSubsequentContinuations: 1,
    followingSubsequentContinuationAllowed: true,
    followingSubsequentContinuationObservationAllowed: false,
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

function followingSubsequentContinuationPolicyContext(args) {
  const context = stripFurtherSubsequentContinuationFields(args);
  delete context.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumption;
  delete context.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory;
  return {
    ...context,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy:
      args.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
    trustedFurtherSubsequentContinuationExecutors:
      args.trustedFurtherSubsequentContinuationExecutors ??
      args.controlledProofExecutionFurtherSubsequentContinuationPolicy?.trustedFurtherSubsequentContinuationExecutors,
  };
}

export function inspectControlledProofExecutionFurtherSubsequentContinuationPolicy(policy, context) {
  try {
    const recreated = createControlledProofExecutionFurtherSubsequentContinuationPolicy(context);
    if (recreated.policyHash !== policy?.policyHash) {
      return { ok: false, reason: "controlled_proof_execution_next_subsequent_continuation_policy_hash_mismatch" };
    }
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) {
      return { ok: false, reason: "controlled_proof_execution_next_subsequent_continuation_policy_contract_mismatch" };
    }
    return {
      ok: true,
      policyHash: recreated.policyHash,
      trustedExecutors: recreated.trustedFurtherSubsequentContinuationExecutors.length,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_next_subsequent_continuation_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedFurtherSubsequentContinuations: entries.length,
      consumedAuthorizationConsumptions: new Set(entries.map((entry) => entry.consumptionReceiptHash)).size,
      distinctFurtherSubsequentContinuations: new Set(entries.map((entry) => entry.furtherSubsequentContinuationId)).size,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      followingSubsequentContinuationAuthorizationConsumed: entries.length > 0,
      followingSubsequentContinuationExecuted: entries.length > 0,
      followingSubsequentContinuationObserved: false,
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

export function createControlledProofExecutionFurtherSubsequentContinuationMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_POLICY_SCHEMA) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_memory_policy_invalid");
  }
  assertHash(policy.policyHash, "controlled_proof_execution_next_subsequent_continuation_memory_policy_hash");
  if (!Array.isArray(entries)) throw new Error("controlled_proof_execution_next_subsequent_continuation_memory_entries_invalid");
  let previousEntryHash = null;
  const consumptionHashes = new Set();
  const continuationIds = new Set();
  const nonces = new Set();
  const normalized = [];
  for (const [index, entry] of entries.entries()) {
    if (entry?.schema !== CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_MEMORY_ENTRY_SCHEMA) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_memory_entry_schema_invalid");
    }
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_memory_chain_invalid");
    }
    for (const field of [
      "followingSubsequentContinuationReceiptHash", "followingSubsequentContinuationPolicyHash", "followingSubsequentContinuationMemoryHashBefore",
      "consumptionReceiptHash", "consumptionPolicyHash", "consumptionMemoryHash", "reviewAuthorizationHash",
      "reviewAuthorizationPolicyHash", "reviewAuthorizationMemoryHash", "reviewReceiptHash", "reviewPolicyHash",
      "reviewMemoryHash", "authorizedFollowingSubsequentContinuationObservationReceiptHash",
      "authorizedFollowingSubsequentContinuationObservationPolicyHash", "authorizedFollowingSubsequentContinuationObservationMemoryHash",
      "authorizedFollowingSubsequentContinuationReceiptHash", "authorizedFollowingSubsequentContinuationPolicyHash",
      "authorizedFollowingSubsequentContinuationMemoryHash",
      "packageSha256", "inventoryHash",
    ]) assertHash(entry[field], `controlled_proof_execution_next_subsequent_continuation_memory_${field}`);
    for (const [value, field] of [
      [entry.consumptionId, "consumption_id"], [entry.furtherSubsequentContinuationId, "subsequent_continuation_id"],
      [entry.executorActorId, "executor_actor_id"], [entry.nonce, "nonce"],
    ]) assertSlug(value, `controlled_proof_execution_next_subsequent_continuation_memory_${field}`);
    assertIso(entry.consumedAt, "controlled_proof_execution_next_subsequent_continuation_memory_consumed_at");
    assertIso(entry.continuedAt, "controlled_proof_execution_next_subsequent_continuation_memory_continued_at");
    if (entry.followingSubsequentContinuationPolicyHash !== policy.policyHash) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_memory_policy_binding_mismatch");
    }
    if (entry.followingSubsequentContinuationMemoryHashBefore !== memoryHashForEntries(policy, normalized)) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_memory_head_binding_mismatch");
    }
    if (consumptionHashes.has(entry.consumptionReceiptHash)) {
      throw new Error("controlled_proof_execution_authorization_consumption_already_continued");
    }
    if (continuationIds.has(entry.furtherSubsequentContinuationId)) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_duplicate_id");
    }
    if (nonces.has(entry.nonce)) throw new Error("controlled_proof_execution_next_subsequent_continuation_duplicate_nonce");
    if (
      entry.authorizationConsumptionVerified !== true || entry.authorizationConsumptionRecorded !== true ||
      entry.singleUse !== true || entry.maximumFurtherSubsequentContinuations !== 1 || entry.remainingFurtherSubsequentContinuations !== 0 ||
      entry.followingSubsequentContinuationExecuted !== true || entry.followingSubsequentContinuationRecorded !== true ||
      entry.followingSubsequentContinuationObserved !== false
    ) throw new Error("controlled_proof_execution_next_subsequent_continuation_memory_single_use_contract_invalid");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`controlled_proof_execution_next_subsequent_continuation_memory_${key}_must_be_false`);
    }
    const entryPayload = { ...entry };
    delete entryPayload.entryHash;
    if (digest(entryPayload) !== entry.entryHash) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_memory_entry_hash_mismatch");
    }
    normalized.push({ ...entry });
    consumptionHashes.add(entry.consumptionReceiptHash);
    continuationIds.add(entry.furtherSubsequentContinuationId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledProofExecutionFurtherSubsequentContinuationMemory(memory, { policy }) {
  try {
    const recreated = createControlledProofExecutionFurtherSubsequentContinuationMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) {
      return { ok: false, reason: "controlled_proof_execution_next_subsequent_continuation_memory_hash_mismatch" };
    }
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) {
      return { ok: false, reason: "controlled_proof_execution_next_subsequent_continuation_memory_contract_mismatch" };
    }
    return { ok: true, memoryHash: recreated.memoryHash, ...recreated.summary };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_next_subsequent_continuation_memory_invalid" };
  }
}

function verifyContext(args) {
  const policyInspection = inspectControlledProofExecutionFurtherSubsequentContinuationPolicy(
    args.controlledProofExecutionFurtherSubsequentContinuationPolicy,
    followingSubsequentContinuationPolicyContext(args),
  );
  if (!policyInspection.ok) throw new Error(`controlled_proof_execution_next_subsequent_continuation_policy_invalid:${policyInspection.reason}`);
  const memoryInspection = inspectControlledProofExecutionFurtherSubsequentContinuationMemory(
    args.controlledProofExecutionFurtherSubsequentContinuationMemory,
    { policy: args.controlledProofExecutionFurtherSubsequentContinuationPolicy },
  );
  if (!memoryInspection.ok) throw new Error(`controlled_proof_execution_next_subsequent_continuation_memory_invalid:${memoryInspection.reason}`);
  const consumptionMemoryInspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory(
    args.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
    { policy: args.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy },
  );
  if (!consumptionMemoryInspection.ok) {
    throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_memory_invalid:${consumptionMemoryInspection.reason}`);
  }
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

function consumptionReceiptInspectionContext(args) {
  const context = stripFurtherSubsequentContinuationFields(args);
  delete context.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumption;
  return context;
}

function inspectEligibleConsumption(consumption, args) {
  const inspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionReceipt(
    consumption,
    consumptionReceiptInspectionContext(args),
  );
  if (!inspection.ok) {
    throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_invalid:${inspection.reason}`);
  }
  if (
    consumption.consumptionRecorded !== true || consumption.authorizationConsumptionVerified !== true ||
    consumption.singleUse !== true || consumption.maximumUses !== 1 || consumption.remainingUses !== 0 ||
    consumption.reviewAuthorizationConsumed !== true || consumption.followingSubsequentContinuationAuthorizationConsumed !== true ||
    consumption.followingSubsequentContinuationExecuted !== false
  ) throw new Error("recorded_signed_authorization_consumption_required_for_subsequent_continuation");
  if (!args.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory.entries.some(
    (entry) => entry.consumptionReceiptHash === consumption.consumptionReceiptHash && entry.reviewAuthorizationConsumed === true,
  )) throw new Error("controlled_proof_execution_authorization_consumption_not_recorded");
  return inspection;
}

function validateContinuationWindow(consumption, authorization, executor, continuedAt, upstreamContext) {
  assertIso(continuedAt, "controlled_proof_execution_subsequent_continued_at");
  const continued = Date.parse(continuedAt);
  if (continued < Date.parse(consumption.consumedAt)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_before_consumption");
  }
  if (continued >= Date.parse(authorization.expiresAt)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_after_authorization_expiration");
  }
  if (executor.status !== "active") throw new Error("controlled_proof_execution_next_subsequent_continuation_executor_inactive");
  if (continued < Date.parse(executor.validFrom) || continued > Date.parse(executor.validUntil)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_executor_key_outside_validity");
  }
  const identities = collectPriorIdentities(consumption);
  collectPriorIdentities(authorization, identities);
  collectPriorIdentities(stripFurtherSubsequentContinuationFields(upstreamContext), identities);
  if (identities.has(executor.actorId) || identities.has(executor.keyId)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_executor_not_independent");
  }
}

function signingPayload({ consumption, consumptionMemory, authorization, policy, memoryHashBefore, continuationId, executor, continuedAt, nonce }) {
  return {
    signingSchema: "atlas.controlled-proof-execution-further-subsequent-continuation-signing-payload.v1",
    compositionId: consumption.compositionId,
    consumptionReceiptHash: consumption.consumptionReceiptHash,
    consumptionPolicyHash: consumption.consumptionPolicyHash,
    consumptionMemoryHash: consumptionMemory.memoryHash,
    reviewAuthorizationHash: consumption.reviewAuthorizationHash,
    reviewAuthorizationPolicyHash: consumption.reviewAuthorizationPolicyHash,
    reviewAuthorizationMemoryHash: consumption.reviewAuthorizationMemoryHash,
    reviewReceiptHash: consumption.reviewReceiptHash,
    reviewPolicyHash: consumption.reviewPolicyHash,
    reviewMemoryHash: consumption.reviewMemoryHash,
    authorizedFollowingSubsequentContinuationObservationReceiptHash: consumption.followingSubsequentContinuationObservationReceiptHash,
    authorizedFollowingSubsequentContinuationObservationPolicyHash: consumption.followingSubsequentContinuationObservationPolicyHash,
    authorizedFollowingSubsequentContinuationObservationMemoryHash: consumption.followingSubsequentContinuationObservationMemoryHash,
    authorizedFollowingSubsequentContinuationReceiptHash: consumption.followingSubsequentContinuationReceiptHash,
    authorizedFollowingSubsequentContinuationPolicyHash: consumption.followingSubsequentContinuationPolicyHash,
    authorizedFollowingSubsequentContinuationMemoryHash: consumption.followingSubsequentContinuationMemoryHash,
    packageSha256: consumption.packageSha256,
    inventoryHash: consumption.inventoryHash,
    consumptionId: consumption.consumptionId,
    reviewAuthorizationId: consumption.reviewAuthorizationId,
    reviewAuthorizationExpiresAt: authorization.expiresAt,
    followingSubsequentContinuationPolicyHash: policy.policyHash,
    followingSubsequentContinuationMemoryHashBefore: memoryHashBefore,
    furtherSubsequentContinuationId: continuationId,
    executorKeyId: executor.keyId,
    executorActorId: executor.actorId,
    consumedAt: consumption.consumedAt,
    continuedAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  const signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url");
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) {
    throw new Error("private_key_does_not_match_controlled_proof_execution_next_subsequent_continuation_executor");
  }
  return signature;
}

export function executeControlledProofExecutionFurtherSubsequentContinuation({
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumption: consumption,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: consumptionMemory,
  controlledProofExecutionFurtherSubsequentContinuationPolicy: policy,
  controlledProofExecutionFurtherSubsequentContinuationMemory: memory,
  furtherSubsequentContinuationId: continuationId,
  furtherSubsequentContinuationExecutorKeyId: executorKeyId,
  furtherSubsequentContinuationExecutorPrivateKey: executorPrivateKey,
  subsequentContinuedAt: continuedAt,
  furtherSubsequentContinuationNonce: nonce,
  ...upstream
}) {
  const args = {
    ...upstream,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumption: consumption,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: consumptionMemory,
    controlledProofExecutionFurtherSubsequentContinuationPolicy: policy,
    controlledProofExecutionFurtherSubsequentContinuationMemory: memory,
    trustedFurtherSubsequentContinuationExecutors: policy.trustedFurtherSubsequentContinuationExecutors,
  };
  verifyContext(args);
  inspectEligibleConsumption(consumption, args);
  for (const [value, field] of [[continuationId, "id"], [executorKeyId, "executor_key_id"], [nonce, "nonce"]]) {
    assertSlug(value, `controlled_proof_execution_next_subsequent_continuation_${field}`);
  }
  const executor = policy.trustedFurtherSubsequentContinuationExecutors.find((item) => item.keyId === executorKeyId);
  if (!executor) throw new Error("controlled_proof_execution_next_subsequent_continuation_executor_untrusted");
  validateContinuationWindow(
    consumption,
    args.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization,
    executor,
    continuedAt,
    args,
  );
  if (memory.entries.some((entry) => entry.consumptionReceiptHash === consumption.consumptionReceiptHash)) {
    throw new Error("controlled_proof_execution_authorization_consumption_already_continued");
  }
  if (memory.entries.some((entry) => entry.furtherSubsequentContinuationId === continuationId)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_duplicate_id");
  }
  if (memory.entries.some((entry) => entry.nonce === nonce)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_duplicate_nonce");
  }
  const memoryHashBefore = memory.memoryHash;
  const payload = signingPayload({
    consumption,
    consumptionMemory,
    authorization: args.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization,
    policy,
    memoryHashBefore,
    continuationId,
    executor,
    continuedAt,
    nonce,
  });
  const signature = signPayload(payload, executorPrivateKey, executor.publicKeyPem);
  const unsigned = {
    schema: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_RECEIPT_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_SIGNATURE_ALGORITHM,
    authorizationConsumptionVerified: true,
    authorizationConsumptionRecorded: true,
    singleUse: true,
    maximumFurtherSubsequentContinuations: 1,
    remainingFurtherSubsequentContinuations: 0,
    followingSubsequentContinuationExecuted: true,
    followingSubsequentContinuationRecorded: true,
    followingSubsequentContinuationObserved: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const followingSubsequentContinuationReceipt = { ...unsigned, followingSubsequentContinuationReceiptHash: digest(unsigned) };
  const entryPayload = {
    schema: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_MEMORY_ENTRY_SCHEMA,
    sequence: memory.entries.length + 1,
    previousEntryHash: memory.entries.at(-1)?.entryHash ?? null,
    followingSubsequentContinuationReceiptHash: followingSubsequentContinuationReceipt.followingSubsequentContinuationReceiptHash,
    followingSubsequentContinuationPolicyHash: policy.policyHash,
    followingSubsequentContinuationMemoryHashBefore: memoryHashBefore,
    consumptionReceiptHash: consumption.consumptionReceiptHash,
    consumptionPolicyHash: consumption.consumptionPolicyHash,
    consumptionMemoryHash: consumptionMemory.memoryHash,
    reviewAuthorizationHash: consumption.reviewAuthorizationHash,
    reviewAuthorizationPolicyHash: consumption.reviewAuthorizationPolicyHash,
    reviewAuthorizationMemoryHash: consumption.reviewAuthorizationMemoryHash,
    reviewReceiptHash: consumption.reviewReceiptHash,
    reviewPolicyHash: consumption.reviewPolicyHash,
    reviewMemoryHash: consumption.reviewMemoryHash,
    authorizedFollowingSubsequentContinuationObservationReceiptHash: consumption.followingSubsequentContinuationObservationReceiptHash,
    authorizedFollowingSubsequentContinuationObservationPolicyHash: consumption.followingSubsequentContinuationObservationPolicyHash,
    authorizedFollowingSubsequentContinuationObservationMemoryHash: consumption.followingSubsequentContinuationObservationMemoryHash,
    authorizedFollowingSubsequentContinuationReceiptHash: consumption.followingSubsequentContinuationReceiptHash,
    authorizedFollowingSubsequentContinuationPolicyHash: consumption.followingSubsequentContinuationPolicyHash,
    authorizedFollowingSubsequentContinuationMemoryHash: consumption.followingSubsequentContinuationMemoryHash,
    packageSha256: consumption.packageSha256,
    inventoryHash: consumption.inventoryHash,
    consumptionId: consumption.consumptionId,
    furtherSubsequentContinuationId: continuationId,
    executorActorId: executor.actorId,
    consumedAt: consumption.consumedAt,
    continuedAt,
    nonce,
    authorizationConsumptionVerified: true,
    authorizationConsumptionRecorded: true,
    singleUse: true,
    maximumFurtherSubsequentContinuations: 1,
    remainingFurtherSubsequentContinuations: 0,
    followingSubsequentContinuationExecuted: true,
    followingSubsequentContinuationRecorded: true,
    followingSubsequentContinuationObserved: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  const entry = { ...entryPayload, entryHash: digest(entryPayload) };
  return {
    followingSubsequentContinuationReceipt,
    controlledProofExecutionFurtherSubsequentContinuationMemory:
      createControlledProofExecutionFurtherSubsequentContinuationMemory({ policy, entries: [...memory.entries, entry] }),
  };
}

export function inspectControlledProofExecutionFurtherSubsequentContinuationReceipt(receipt, {
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumption: consumption,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: consumptionMemory,
  controlledProofExecutionFurtherSubsequentContinuationPolicy: policy,
  controlledProofExecutionFurtherSubsequentContinuationMemory: memory,
  ...upstream
}) {
  try {
    if (receipt?.schema !== CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_RECEIPT_SCHEMA) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_receipt_schema_invalid");
    }
    const args = {
      ...upstream,
      controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumption: consumption,
      controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: consumptionMemory,
      controlledProofExecutionFurtherSubsequentContinuationPolicy: policy,
      controlledProofExecutionFurtherSubsequentContinuationMemory: memory,
      trustedFurtherSubsequentContinuationExecutors: policy.trustedFurtherSubsequentContinuationExecutors,
    };
    verifyContext(args);
    inspectEligibleConsumption(consumption, args);
    const entryIndex = memory.entries.findIndex(
      (entry) => entry.followingSubsequentContinuationReceiptHash === receipt.followingSubsequentContinuationReceiptHash,
    );
    if (entryIndex < 0) throw new Error("controlled_proof_execution_next_subsequent_continuation_not_recorded");
    const executor = policy.trustedFurtherSubsequentContinuationExecutors.find((item) => item.keyId === receipt.executorKeyId);
    if (!executor) throw new Error("controlled_proof_execution_next_subsequent_continuation_executor_untrusted");
    validateContinuationWindow(
      consumption,
      args.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization,
      executor,
      receipt.continuedAt,
      args,
    );
    const memoryHashBefore = memoryHashForEntries(policy, memory.entries.slice(0, entryIndex));
    const payload = signingPayload({
      consumption,
      consumptionMemory,
      authorization: args.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization,
      policy,
      memoryHashBefore,
      continuationId: receipt.furtherSubsequentContinuationId,
      executor,
      continuedAt: receipt.continuedAt,
      nonce: receipt.nonce,
    });
    for (const [key, expected] of Object.entries(payload)) {
      if (JSON.stringify(receipt[key]) !== JSON.stringify(expected)) {
        throw new Error(`controlled_proof_execution_next_subsequent_continuation_${key}_mismatch`);
      }
    }
    if (receipt.signatureAlgorithm !== CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_SIGNATURE_ALGORITHM || typeof receipt.signature !== "string") {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_signature_invalid");
    }
    if (!cryptoVerify(null, bytes(payload), executor.publicKeyPem, Buffer.from(receipt.signature, "base64url"))) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_signature_verification_failed");
    }
    if (
      receipt.authorizationConsumptionVerified !== true || receipt.authorizationConsumptionRecorded !== true ||
      receipt.singleUse !== true || receipt.maximumFurtherSubsequentContinuations !== 1 ||
      receipt.remainingFurtherSubsequentContinuations !== 0 || receipt.followingSubsequentContinuationExecuted !== true ||
      receipt.followingSubsequentContinuationRecorded !== true || receipt.followingSubsequentContinuationObserved !== false
    ) throw new Error("controlled_proof_execution_next_subsequent_continuation_receipt_contract_invalid");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (receipt[key] !== false) throw new Error(`controlled_proof_execution_next_subsequent_continuation_${key}_must_be_false`);
    }
    const hashPayload = { ...receipt };
    delete hashPayload.followingSubsequentContinuationReceiptHash;
    if (digest(hashPayload) !== receipt.followingSubsequentContinuationReceiptHash) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_receipt_hash_mismatch");
    }
    const entry = memory.entries[entryIndex];
    if (
      entry.consumptionReceiptHash !== consumption.consumptionReceiptHash ||
      entry.consumptionMemoryHash !== consumptionMemory.memoryHash ||
      entry.followingSubsequentContinuationMemoryHashBefore !== memoryHashBefore ||
      entry.executorActorId !== executor.actorId || entry.followingSubsequentContinuationExecuted !== true
    ) throw new Error("controlled_proof_execution_next_subsequent_continuation_memory_entry_mismatch");
    return {
      ok: true,
      followingSubsequentContinuationReceiptHash: receipt.followingSubsequentContinuationReceiptHash,
      consumptionReceiptHash: receipt.consumptionReceiptHash,
      followingSubsequentContinuationExecuted: true,
      followingSubsequentContinuationObserved: false,
      publicationExecuted: false,
      externalPublicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_next_subsequent_continuation_receipt_invalid" };
  }
}

