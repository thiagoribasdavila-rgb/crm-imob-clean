import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_RECEIPT_SCHEMA,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionReceipt,
} from "./controlled-proof-execution-subsequent-continuation-observation-review-authorization-consumption.mjs";

export const CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_POLICY_SCHEMA =
  "atlas.controlled-proof-execution-next-subsequent-continuation-policy.v1";
export const CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_RECEIPT_SCHEMA =
  "atlas.controlled-proof-execution-next-subsequent-continuation-receipt.v1";
export const CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_MEMORY_SCHEMA =
  "atlas.controlled-proof-execution-next-subsequent-continuation-memory.v1";
export const CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_MEMORY_ENTRY_SCHEMA =
  "atlas.controlled-proof-execution-next-subsequent-continuation-memory-entry.v1";
export const CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_SIGNATURE_ALGORITHM = "ed25519";
export const CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_EXECUTOR_ROLE =
  "controlled-proof-execution-next-subsequent-continuation-executor";

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
  if (executor.role !== CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_EXECUTOR_ROLE) {
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

function stripNextSubsequentContinuationFields(args) {
  const {
    controlledProofExecutionNextSubsequentContinuation: _receipt,
    controlledProofExecutionNextSubsequentContinuationPolicy: _policy,
    controlledProofExecutionNextSubsequentContinuationMemory: _memory,
    trustedNextSubsequentContinuationExecutors: _executors,
    nextSubsequentContinuationId: _continuationId,
    nextSubsequentContinuationExecutorKeyId: _executorKeyId,
    nextSubsequentContinuationExecutorPrivateKey: _privateKey,
    subsequentContinuedAt: _continuedAt,
    nextSubsequentContinuationNonce: _nonce,
    ...context
  } = args;
  return context;
}

function consumptionPolicyContext(args) {
  const context = stripNextSubsequentContinuationFields(args);
  const consumptionPolicy = args.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy;
  delete context.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumption;
  delete context.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory;
  delete context.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy;
  return {
    ...context,
    trustedReviewAuthorizationConsumers: consumptionPolicy.trustedReviewAuthorizationConsumers,
  };
}

export function createControlledProofExecutionNextSubsequentContinuationPolicy({
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy: consumptionPolicy,
  trustedNextSubsequentContinuationExecutors = [],
  ...upstream
}) {
  const consumptionInspection = inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(
    consumptionPolicy,
    consumptionPolicyContext({
      ...upstream,
      controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy: consumptionPolicy,
    }),
  );
  if (!consumptionInspection.ok) {
    throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_policy_invalid:${consumptionInspection.reason}`);
  }
  if (!Array.isArray(trustedNextSubsequentContinuationExecutors)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_executors_invalid");
  }
  const executors = trustedNextSubsequentContinuationExecutors.map(normalizeExecutor).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(executors.map((item) => item.keyId)).size !== executors.length) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_executor_key_id_duplicate");
  }
  if (new Set(executors.map((item) => item.actorId)).size !== executors.length) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_executor_actor_id_duplicate");
  }
  const payload = {
    schema: CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_POLICY_SCHEMA,
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
      CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION_RECEIPT_SCHEMA,
    requiredMemoryEntrySchema: CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_MEMORY_ENTRY_SCHEMA,
    nextSubsequentContinuationExecutorRole: CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_EXECUTOR_ROLE,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_SIGNATURE_ALGORITHM,
    trustedNextSubsequentContinuationExecutors: executors,
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
    signedNextSubsequentContinuationReceiptRequired: true,
    appendOnlyNextSubsequentContinuationMemoryRequired: true,
    duplicateConsumptionContinuationRejected: true,
    atomicMemoryHeadBindingRequired: true,
    singleUseNextSubsequentContinuationRequired: true,
    maximumNextSubsequentContinuations: 1,
    nextSubsequentContinuationAllowed: true,
    nextSubsequentContinuationObservationAllowed: false,
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

function nextSubsequentContinuationPolicyContext(args) {
  const context = stripNextSubsequentContinuationFields(args);
  delete context.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumption;
  delete context.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory;
  return {
    ...context,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy:
      args.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
    trustedNextSubsequentContinuationExecutors:
      args.trustedNextSubsequentContinuationExecutors ??
      args.controlledProofExecutionNextSubsequentContinuationPolicy?.trustedNextSubsequentContinuationExecutors,
  };
}

export function inspectControlledProofExecutionNextSubsequentContinuationPolicy(policy, context) {
  try {
    const recreated = createControlledProofExecutionNextSubsequentContinuationPolicy(context);
    if (recreated.policyHash !== policy?.policyHash) {
      return { ok: false, reason: "controlled_proof_execution_next_subsequent_continuation_policy_hash_mismatch" };
    }
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) {
      return { ok: false, reason: "controlled_proof_execution_next_subsequent_continuation_policy_contract_mismatch" };
    }
    return {
      ok: true,
      policyHash: recreated.policyHash,
      trustedExecutors: recreated.trustedNextSubsequentContinuationExecutors.length,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_next_subsequent_continuation_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedNextSubsequentContinuations: entries.length,
      consumedAuthorizationConsumptions: new Set(entries.map((entry) => entry.consumptionReceiptHash)).size,
      distinctNextSubsequentContinuations: new Set(entries.map((entry) => entry.nextSubsequentContinuationId)).size,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      nextSubsequentContinuationAuthorizationConsumed: entries.length > 0,
      nextSubsequentContinuationExecuted: entries.length > 0,
      nextSubsequentContinuationObserved: false,
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

export function createControlledProofExecutionNextSubsequentContinuationMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_POLICY_SCHEMA) {
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
    if (entry?.schema !== CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_MEMORY_ENTRY_SCHEMA) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_memory_entry_schema_invalid");
    }
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_memory_chain_invalid");
    }
    for (const field of [
      "nextSubsequentContinuationReceiptHash", "nextSubsequentContinuationPolicyHash", "nextSubsequentContinuationMemoryHashBefore",
      "consumptionReceiptHash", "consumptionPolicyHash", "consumptionMemoryHash", "reviewAuthorizationHash",
      "reviewAuthorizationPolicyHash", "reviewAuthorizationMemoryHash", "reviewReceiptHash", "reviewPolicyHash",
      "reviewMemoryHash", "subsequentContinuationObservationReceiptHash",
      "subsequentContinuationObservationPolicyHash", "subsequentContinuationObservationMemoryHash",
      "subsequentContinuationReceiptHash", "subsequentContinuationPolicyHash", "subsequentContinuationMemoryHash",
      "packageSha256", "inventoryHash",
    ]) assertHash(entry[field], `controlled_proof_execution_next_subsequent_continuation_memory_${field}`);
    for (const [value, field] of [
      [entry.consumptionId, "consumption_id"], [entry.nextSubsequentContinuationId, "subsequent_continuation_id"],
      [entry.executorActorId, "executor_actor_id"], [entry.nonce, "nonce"],
    ]) assertSlug(value, `controlled_proof_execution_next_subsequent_continuation_memory_${field}`);
    assertIso(entry.consumedAt, "controlled_proof_execution_next_subsequent_continuation_memory_consumed_at");
    assertIso(entry.continuedAt, "controlled_proof_execution_next_subsequent_continuation_memory_continued_at");
    if (entry.nextSubsequentContinuationPolicyHash !== policy.policyHash) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_memory_policy_binding_mismatch");
    }
    if (entry.nextSubsequentContinuationMemoryHashBefore !== memoryHashForEntries(policy, normalized)) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_memory_head_binding_mismatch");
    }
    if (consumptionHashes.has(entry.consumptionReceiptHash)) {
      throw new Error("controlled_proof_execution_authorization_consumption_already_continued");
    }
    if (continuationIds.has(entry.nextSubsequentContinuationId)) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_duplicate_id");
    }
    if (nonces.has(entry.nonce)) throw new Error("controlled_proof_execution_next_subsequent_continuation_duplicate_nonce");
    if (
      entry.authorizationConsumptionVerified !== true || entry.authorizationConsumptionRecorded !== true ||
      entry.singleUse !== true || entry.maximumNextSubsequentContinuations !== 1 || entry.remainingNextSubsequentContinuations !== 0 ||
      entry.nextSubsequentContinuationExecuted !== true || entry.nextSubsequentContinuationRecorded !== true ||
      entry.nextSubsequentContinuationObserved !== false
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
    continuationIds.add(entry.nextSubsequentContinuationId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledProofExecutionNextSubsequentContinuationMemory(memory, { policy }) {
  try {
    const recreated = createControlledProofExecutionNextSubsequentContinuationMemory({ policy, entries: memory?.entries });
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
  const policyInspection = inspectControlledProofExecutionNextSubsequentContinuationPolicy(
    args.controlledProofExecutionNextSubsequentContinuationPolicy,
    nextSubsequentContinuationPolicyContext(args),
  );
  if (!policyInspection.ok) throw new Error(`controlled_proof_execution_next_subsequent_continuation_policy_invalid:${policyInspection.reason}`);
  const memoryInspection = inspectControlledProofExecutionNextSubsequentContinuationMemory(
    args.controlledProofExecutionNextSubsequentContinuationMemory,
    { policy: args.controlledProofExecutionNextSubsequentContinuationPolicy },
  );
  if (!memoryInspection.ok) throw new Error(`controlled_proof_execution_next_subsequent_continuation_memory_invalid:${memoryInspection.reason}`);
  const consumptionMemoryInspection = inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory(
    args.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
    { policy: args.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy },
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
  const context = stripNextSubsequentContinuationFields(args);
  delete context.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumption;
  return context;
}

function inspectEligibleConsumption(consumption, args) {
  const inspection = inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionReceipt(
    consumption,
    consumptionReceiptInspectionContext(args),
  );
  if (!inspection.ok) {
    throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_invalid:${inspection.reason}`);
  }
  if (
    consumption.consumptionRecorded !== true || consumption.authorizationConsumptionVerified !== true ||
    consumption.singleUse !== true || consumption.maximumUses !== 1 || consumption.remainingUses !== 0 ||
    consumption.reviewAuthorizationConsumed !== true || consumption.subsequentContinuationAuthorizationConsumed !== true ||
    consumption.subsequentContinuationExecuted !== false
  ) throw new Error("recorded_signed_authorization_consumption_required_for_subsequent_continuation");
  if (!args.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory.entries.some(
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
  collectPriorIdentities(stripNextSubsequentContinuationFields(upstreamContext), identities);
  if (identities.has(executor.actorId) || identities.has(executor.keyId)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_executor_not_independent");
  }
}

function signingPayload({ consumption, consumptionMemory, authorization, policy, memoryHashBefore, continuationId, executor, continuedAt, nonce }) {
  return {
    signingSchema: "atlas.controlled-proof-execution-next-subsequent-continuation-signing-payload.v1",
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
    subsequentContinuationObservationReceiptHash: consumption.subsequentContinuationObservationReceiptHash,
    subsequentContinuationObservationPolicyHash: consumption.subsequentContinuationObservationPolicyHash,
    subsequentContinuationObservationMemoryHash: consumption.subsequentContinuationObservationMemoryHash,
    subsequentContinuationReceiptHash: consumption.subsequentContinuationReceiptHash,
    subsequentContinuationPolicyHash: consumption.subsequentContinuationPolicyHash,
    subsequentContinuationMemoryHash: consumption.subsequentContinuationMemoryHash,
    packageSha256: consumption.packageSha256,
    inventoryHash: consumption.inventoryHash,
    consumptionId: consumption.consumptionId,
    reviewAuthorizationId: consumption.reviewAuthorizationId,
    reviewAuthorizationExpiresAt: authorization.expiresAt,
    nextSubsequentContinuationPolicyHash: policy.policyHash,
    nextSubsequentContinuationMemoryHashBefore: memoryHashBefore,
    nextSubsequentContinuationId: continuationId,
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

export function executeControlledProofExecutionNextSubsequentContinuation({
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumption: consumption,
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: consumptionMemory,
  controlledProofExecutionNextSubsequentContinuationPolicy: policy,
  controlledProofExecutionNextSubsequentContinuationMemory: memory,
  nextSubsequentContinuationId: continuationId,
  nextSubsequentContinuationExecutorKeyId: executorKeyId,
  nextSubsequentContinuationExecutorPrivateKey: executorPrivateKey,
  subsequentContinuedAt: continuedAt,
  nextSubsequentContinuationNonce: nonce,
  ...upstream
}) {
  const args = {
    ...upstream,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumption: consumption,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: consumptionMemory,
    controlledProofExecutionNextSubsequentContinuationPolicy: policy,
    controlledProofExecutionNextSubsequentContinuationMemory: memory,
    trustedNextSubsequentContinuationExecutors: policy.trustedNextSubsequentContinuationExecutors,
  };
  verifyContext(args);
  inspectEligibleConsumption(consumption, args);
  for (const [value, field] of [[continuationId, "id"], [executorKeyId, "executor_key_id"], [nonce, "nonce"]]) {
    assertSlug(value, `controlled_proof_execution_next_subsequent_continuation_${field}`);
  }
  const executor = policy.trustedNextSubsequentContinuationExecutors.find((item) => item.keyId === executorKeyId);
  if (!executor) throw new Error("controlled_proof_execution_next_subsequent_continuation_executor_untrusted");
  validateContinuationWindow(
    consumption,
    args.controlledProofExecutionSubsequentContinuationObservationReviewAuthorization,
    executor,
    continuedAt,
    args,
  );
  if (memory.entries.some((entry) => entry.consumptionReceiptHash === consumption.consumptionReceiptHash)) {
    throw new Error("controlled_proof_execution_authorization_consumption_already_continued");
  }
  if (memory.entries.some((entry) => entry.nextSubsequentContinuationId === continuationId)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_duplicate_id");
  }
  if (memory.entries.some((entry) => entry.nonce === nonce)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_duplicate_nonce");
  }
  const memoryHashBefore = memory.memoryHash;
  const payload = signingPayload({
    consumption,
    consumptionMemory,
    authorization: args.controlledProofExecutionSubsequentContinuationObservationReviewAuthorization,
    policy,
    memoryHashBefore,
    continuationId,
    executor,
    continuedAt,
    nonce,
  });
  const signature = signPayload(payload, executorPrivateKey, executor.publicKeyPem);
  const unsigned = {
    schema: CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_RECEIPT_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_SIGNATURE_ALGORITHM,
    authorizationConsumptionVerified: true,
    authorizationConsumptionRecorded: true,
    singleUse: true,
    maximumNextSubsequentContinuations: 1,
    remainingNextSubsequentContinuations: 0,
    nextSubsequentContinuationExecuted: true,
    nextSubsequentContinuationRecorded: true,
    nextSubsequentContinuationObserved: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const nextSubsequentContinuationReceipt = { ...unsigned, nextSubsequentContinuationReceiptHash: digest(unsigned) };
  const entryPayload = {
    schema: CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_MEMORY_ENTRY_SCHEMA,
    sequence: memory.entries.length + 1,
    previousEntryHash: memory.entries.at(-1)?.entryHash ?? null,
    nextSubsequentContinuationReceiptHash: nextSubsequentContinuationReceipt.nextSubsequentContinuationReceiptHash,
    nextSubsequentContinuationPolicyHash: policy.policyHash,
    nextSubsequentContinuationMemoryHashBefore: memoryHashBefore,
    consumptionReceiptHash: consumption.consumptionReceiptHash,
    consumptionPolicyHash: consumption.consumptionPolicyHash,
    consumptionMemoryHash: consumptionMemory.memoryHash,
    reviewAuthorizationHash: consumption.reviewAuthorizationHash,
    reviewAuthorizationPolicyHash: consumption.reviewAuthorizationPolicyHash,
    reviewAuthorizationMemoryHash: consumption.reviewAuthorizationMemoryHash,
    reviewReceiptHash: consumption.reviewReceiptHash,
    reviewPolicyHash: consumption.reviewPolicyHash,
    reviewMemoryHash: consumption.reviewMemoryHash,
    subsequentContinuationObservationReceiptHash: consumption.subsequentContinuationObservationReceiptHash,
    subsequentContinuationObservationPolicyHash: consumption.subsequentContinuationObservationPolicyHash,
    subsequentContinuationObservationMemoryHash: consumption.subsequentContinuationObservationMemoryHash,
    subsequentContinuationReceiptHash: consumption.subsequentContinuationReceiptHash,
    subsequentContinuationPolicyHash: consumption.subsequentContinuationPolicyHash,
    subsequentContinuationMemoryHash: consumption.subsequentContinuationMemoryHash,
    packageSha256: consumption.packageSha256,
    inventoryHash: consumption.inventoryHash,
    consumptionId: consumption.consumptionId,
    nextSubsequentContinuationId: continuationId,
    executorActorId: executor.actorId,
    consumedAt: consumption.consumedAt,
    continuedAt,
    nonce,
    authorizationConsumptionVerified: true,
    authorizationConsumptionRecorded: true,
    singleUse: true,
    maximumNextSubsequentContinuations: 1,
    remainingNextSubsequentContinuations: 0,
    nextSubsequentContinuationExecuted: true,
    nextSubsequentContinuationRecorded: true,
    nextSubsequentContinuationObserved: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  const entry = { ...entryPayload, entryHash: digest(entryPayload) };
  return {
    nextSubsequentContinuationReceipt,
    controlledProofExecutionNextSubsequentContinuationMemory:
      createControlledProofExecutionNextSubsequentContinuationMemory({ policy, entries: [...memory.entries, entry] }),
  };
}

export function inspectControlledProofExecutionNextSubsequentContinuationReceipt(receipt, {
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumption: consumption,
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: consumptionMemory,
  controlledProofExecutionNextSubsequentContinuationPolicy: policy,
  controlledProofExecutionNextSubsequentContinuationMemory: memory,
  ...upstream
}) {
  try {
    if (receipt?.schema !== CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_RECEIPT_SCHEMA) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_receipt_schema_invalid");
    }
    const args = {
      ...upstream,
      controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumption: consumption,
      controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: consumptionMemory,
      controlledProofExecutionNextSubsequentContinuationPolicy: policy,
      controlledProofExecutionNextSubsequentContinuationMemory: memory,
      trustedNextSubsequentContinuationExecutors: policy.trustedNextSubsequentContinuationExecutors,
    };
    verifyContext(args);
    inspectEligibleConsumption(consumption, args);
    const entryIndex = memory.entries.findIndex(
      (entry) => entry.nextSubsequentContinuationReceiptHash === receipt.nextSubsequentContinuationReceiptHash,
    );
    if (entryIndex < 0) throw new Error("controlled_proof_execution_next_subsequent_continuation_not_recorded");
    const executor = policy.trustedNextSubsequentContinuationExecutors.find((item) => item.keyId === receipt.executorKeyId);
    if (!executor) throw new Error("controlled_proof_execution_next_subsequent_continuation_executor_untrusted");
    validateContinuationWindow(
      consumption,
      args.controlledProofExecutionSubsequentContinuationObservationReviewAuthorization,
      executor,
      receipt.continuedAt,
      args,
    );
    const memoryHashBefore = memoryHashForEntries(policy, memory.entries.slice(0, entryIndex));
    const payload = signingPayload({
      consumption,
      consumptionMemory,
      authorization: args.controlledProofExecutionSubsequentContinuationObservationReviewAuthorization,
      policy,
      memoryHashBefore,
      continuationId: receipt.nextSubsequentContinuationId,
      executor,
      continuedAt: receipt.continuedAt,
      nonce: receipt.nonce,
    });
    for (const [key, expected] of Object.entries(payload)) {
      if (JSON.stringify(receipt[key]) !== JSON.stringify(expected)) {
        throw new Error(`controlled_proof_execution_next_subsequent_continuation_${key}_mismatch`);
      }
    }
    if (receipt.signatureAlgorithm !== CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_SIGNATURE_ALGORITHM || typeof receipt.signature !== "string") {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_signature_invalid");
    }
    if (!cryptoVerify(null, bytes(payload), executor.publicKeyPem, Buffer.from(receipt.signature, "base64url"))) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_signature_verification_failed");
    }
    if (
      receipt.authorizationConsumptionVerified !== true || receipt.authorizationConsumptionRecorded !== true ||
      receipt.singleUse !== true || receipt.maximumNextSubsequentContinuations !== 1 ||
      receipt.remainingNextSubsequentContinuations !== 0 || receipt.nextSubsequentContinuationExecuted !== true ||
      receipt.nextSubsequentContinuationRecorded !== true || receipt.nextSubsequentContinuationObserved !== false
    ) throw new Error("controlled_proof_execution_next_subsequent_continuation_receipt_contract_invalid");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (receipt[key] !== false) throw new Error(`controlled_proof_execution_next_subsequent_continuation_${key}_must_be_false`);
    }
    const hashPayload = { ...receipt };
    delete hashPayload.nextSubsequentContinuationReceiptHash;
    if (digest(hashPayload) !== receipt.nextSubsequentContinuationReceiptHash) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_receipt_hash_mismatch");
    }
    const entry = memory.entries[entryIndex];
    if (
      entry.consumptionReceiptHash !== consumption.consumptionReceiptHash ||
      entry.consumptionMemoryHash !== consumptionMemory.memoryHash ||
      entry.nextSubsequentContinuationMemoryHashBefore !== memoryHashBefore ||
      entry.executorActorId !== executor.actorId || entry.nextSubsequentContinuationExecuted !== true
    ) throw new Error("controlled_proof_execution_next_subsequent_continuation_memory_entry_mismatch");
    return {
      ok: true,
      nextSubsequentContinuationReceiptHash: receipt.nextSubsequentContinuationReceiptHash,
      consumptionReceiptHash: receipt.consumptionReceiptHash,
      nextSubsequentContinuationExecuted: true,
      nextSubsequentContinuationObserved: false,
      publicationExecuted: false,
      externalPublicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_next_subsequent_continuation_receipt_invalid" };
  }
}
