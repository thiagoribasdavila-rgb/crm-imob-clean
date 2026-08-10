import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_RECEIPT_SCHEMA,
  inspectControlledProofExecutionFollowingSubsequentContinuationMemory,
  inspectControlledProofExecutionFollowingSubsequentContinuationPolicy,
  inspectControlledProofExecutionFollowingSubsequentContinuationReceipt,
} from "./controlled-proof-execution-following-subsequent-continuation.mjs";

export const CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_POLICY_SCHEMA =
  "atlas.controlled-proof-execution-following-subsequent-continuation-observation-policy.v1";
export const CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_RECEIPT_SCHEMA =
  "atlas.controlled-proof-execution-following-subsequent-continuation-observation-receipt.v1";
export const CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_MEMORY_SCHEMA =
  "atlas.controlled-proof-execution-following-subsequent-continuation-observation-memory.v1";
export const CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_MEMORY_ENTRY_SCHEMA =
  "atlas.controlled-proof-execution-following-subsequent-continuation-observation-memory-entry.v1";
export const CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_SIGNATURE_ALGORITHM = "ed25519";
export const CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVER_ROLE =
  "controlled-proof-execution-following-subsequent-continuation-observer";
export const CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_KIND =
  "execution-following-subsequent-continuation-confirmed";

const EXTERNAL_EFFECT_FIELDS = [
  "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted",
  "deployExecuted", "releasePromoted",
];
const RECEIPT_BINDING_HASH_FIELDS = [
  "consumptionReceiptHash", "consumptionPolicyHash", "consumptionMemoryHash",
  "reviewAuthorizationHash", "reviewAuthorizationPolicyHash", "reviewAuthorizationMemoryHash",
  "reviewReceiptHash", "reviewPolicyHash", "reviewMemoryHash",
  "authorizedNextSubsequentContinuationObservationReceiptHash",
  "authorizedNextSubsequentContinuationObservationPolicyHash",
  "authorizedNextSubsequentContinuationObservationMemoryHash",
  "authorizedNextSubsequentContinuationReceiptHash", "authorizedNextSubsequentContinuationPolicyHash",
  "authorizedNextSubsequentContinuationMemoryHash", "packageSha256", "inventoryHash",
  "nextSubsequentContinuationPolicyHash",
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

function normalizeObserver(observer) {
  if (!observer || typeof observer !== "object" || Array.isArray(observer)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_observer_invalid");
  }
  assertSlug(observer.keyId, "controlled_proof_execution_next_subsequent_continuation_observer_key_id");
  assertSlug(observer.actorId, "controlled_proof_execution_next_subsequent_continuation_observer_actor_id");
  if (observer.role !== CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVER_ROLE) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_observer_role_invalid");
  }
  if (!["active", "inactive"].includes(observer.status)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_observer_status_invalid");
  }
  assertIso(observer.validFrom, "controlled_proof_execution_next_subsequent_continuation_observer_valid_from");
  assertIso(observer.validUntil, "controlled_proof_execution_next_subsequent_continuation_observer_valid_until");
  if (Date.parse(observer.validUntil) <= Date.parse(observer.validFrom)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_observer_validity_invalid");
  }
  try {
    const key = createPublicKey(observer.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_observer_public_key_invalid");
  }
  return {
    keyId: observer.keyId,
    actorId: observer.actorId,
    role: observer.role,
    publicKeyPem: observer.publicKeyPem,
    validFrom: observer.validFrom,
    validUntil: observer.validUntil,
    status: observer.status,
  };
}

function inspectPriorPolicy(policy, context) {
  const inspection = inspectControlledProofExecutionFollowingSubsequentContinuationPolicy(policy, context);
  if (!inspection.ok) {
    throw new Error(`controlled_proof_execution_next_subsequent_continuation_policy_invalid:${inspection.reason}`);
  }
}

export function createControlledProofExecutionFollowingSubsequentContinuationObservationPolicy({
  controlledProofExecutionFollowingSubsequentContinuationPolicy: subsequentPolicy,
  controlledProofExecutionFollowingSubsequentContinuationPolicyContext: subsequentPolicyContext,
  trustedFollowingSubsequentContinuationObservers = [],
  maximumFollowingSubsequentContinuationObservationDelaySeconds = 300,
}) {
  inspectPriorPolicy(subsequentPolicy, subsequentPolicyContext);
  if (!Array.isArray(trustedFollowingSubsequentContinuationObservers)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_observers_invalid");
  }
  if (!Number.isInteger(maximumFollowingSubsequentContinuationObservationDelaySeconds) ||
      maximumFollowingSubsequentContinuationObservationDelaySeconds < 1 ||
      maximumFollowingSubsequentContinuationObservationDelaySeconds > 3600) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_delay_invalid");
  }
  const observers = trustedFollowingSubsequentContinuationObservers.map(normalizeObserver)
    .sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(observers.map((item) => item.keyId)).size !== observers.length) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_observer_key_id_duplicate");
  }
  if (new Set(observers.map((item) => item.actorId)).size !== observers.length) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_observer_actor_id_duplicate");
  }
  const payload = {
    schema: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_POLICY_SCHEMA,
    compositionId: subsequentPolicy.compositionId,
    compositionDecisionHash: subsequentPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: subsequentPolicy.publicationDecisionPolicyHash,
    executionStartPolicyHash: subsequentPolicy.executionStartPolicyHash,
    executionObservationPolicyHash: subsequentPolicy.executionObservationPolicyHash,
    continuationAuthorizationPolicyHash: subsequentPolicy.continuationAuthorizationPolicyHash,
    continuationPolicyHash: subsequentPolicy.continuationPolicyHash,
    continuationObservationPolicyHash: subsequentPolicy.continuationObservationPolicyHash,
    reviewPolicyHash: subsequentPolicy.reviewPolicyHash,
    reviewAuthorizationPolicyHash: subsequentPolicy.reviewAuthorizationPolicyHash,
    reviewAuthorizationConsumptionPolicyHash: subsequentPolicy.reviewAuthorizationConsumptionPolicyHash,
    nextSubsequentContinuationPolicyHash: subsequentPolicy.policyHash,
    requiredSubsequentContinuationReceiptSchema: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_RECEIPT_SCHEMA,
    requiredMemoryEntrySchema: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_MEMORY_ENTRY_SCHEMA,
    observationKind: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_KIND,
    observerRole: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVER_ROLE,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_SIGNATURE_ALGORITHM,
    trustedFollowingSubsequentContinuationObservers: observers,
    maximumFollowingSubsequentContinuationObservationDelaySeconds,
    recordedSignedSubsequentContinuationRequired: true,
    exactSubsequentContinuationReceiptBindingRequired: true,
    exactSubsequentContinuationPolicyBindingRequired: true,
    exactSubsequentContinuationMemoryBindingRequired: true,
    exactAuthorizationConsumptionBindingRequired: true,
    exactReviewAuthorizationBindingRequired: true,
    exactReviewBindingRequired: true,
    exactContinuationObservationBindingRequired: true,
    exactPriorContinuationBindingRequired: true,
    exactExecutionStartBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    nextSubsequentContinuationSignatureVerificationRequired: true,
    observerIndependenceRequired: true,
    observerValidityAtObservationRequired: true,
    appendOnlyObservationMemoryRequired: true,
    duplicateSubsequentContinuationRejected: true,
    atomicMemoryHeadBindingRequired: true,
    signedObservationRequired: true,
    singleObservationPerSubsequentContinuationRequired: true,
    maximumObservationsPerSubsequentContinuation: 1,
    nextSubsequentContinuationObservationAllowed: true,
    nextSubsequentContinuationObservationReviewAllowed: false,
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

export function inspectControlledProofExecutionFollowingSubsequentContinuationObservationPolicy(policy, context) {
  try {
    const recreated = createControlledProofExecutionFollowingSubsequentContinuationObservationPolicy(context);
    if (recreated.policyHash !== policy?.policyHash) {
      return { ok: false, reason: "controlled_proof_execution_next_subsequent_continuation_observation_policy_hash_mismatch" };
    }
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) {
      return { ok: false, reason: "controlled_proof_execution_next_subsequent_continuation_observation_policy_contract_mismatch" };
    }
    return { ok: true, policyHash: recreated.policyHash, trustedObservers: recreated.trustedFollowingSubsequentContinuationObservers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_next_subsequent_continuation_observation_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedSubsequentContinuationObservations: entries.length,
      observedSubsequentContinuations: new Set(entries.map((entry) => entry.nextSubsequentContinuationReceiptHash)).size,
      distinctObservations: new Set(entries.map((entry) => entry.observationId)).size,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      nextSubsequentContinuationExecuted: entries.length > 0,
      nextSubsequentContinuationObserved: entries.length > 0,
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

export function createControlledProofExecutionFollowingSubsequentContinuationObservationMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_POLICY_SCHEMA) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_memory_policy_invalid");
  }
  assertHash(policy.policyHash, "controlled_proof_execution_next_subsequent_continuation_observation_memory_policy_hash");
  if (!Array.isArray(entries)) throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_memory_entries_invalid");
  let previousEntryHash = null;
  const receiptHashes = new Set();
  const observationIds = new Set();
  const nonces = new Set();
  const normalized = [];
  for (const [index, entry] of entries.entries()) {
    if (entry?.schema !== CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_MEMORY_ENTRY_SCHEMA) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_memory_entry_schema_invalid");
    }
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_memory_chain_invalid");
    }
    for (const field of [
      "nextSubsequentContinuationObservationReceiptHash", "nextSubsequentContinuationReceiptHash",
      "nextSubsequentContinuationPolicyHash", "nextSubsequentContinuationMemoryHash",
      "nextSubsequentContinuationObservationPolicyHash", "nextSubsequentContinuationObservationMemoryHashBefore",
      ...RECEIPT_BINDING_HASH_FIELDS,
    ]) assertHash(entry[field], `controlled_proof_execution_next_subsequent_continuation_observation_memory_${field}`);
    for (const [value, field] of [
      [entry.nextSubsequentContinuationId, "next_subsequent_continuation_id"], [entry.observationId, "observation_id"],
      [entry.observerKeyId, "observer_key_id"], [entry.observerActorId, "observer_actor_id"], [entry.nonce, "nonce"],
    ]) assertSlug(value, `controlled_proof_execution_next_subsequent_continuation_observation_memory_${field}`);
    assertIso(entry.continuedAt, "controlled_proof_execution_next_subsequent_continuation_observation_memory_continued_at");
    assertIso(entry.observedAt, "controlled_proof_execution_next_subsequent_continuation_observation_memory_observed_at");
    if (entry.nextSubsequentContinuationObservationPolicyHash !== policy.policyHash) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_memory_policy_binding_mismatch");
    }
    if (entry.nextSubsequentContinuationObservationMemoryHashBefore !== memoryHashForEntries(policy, normalized)) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_memory_head_binding_mismatch");
    }
    if (receiptHashes.has(entry.nextSubsequentContinuationReceiptHash)) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_already_observed");
    }
    if (observationIds.has(entry.observationId)) throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_duplicate_id");
    if (nonces.has(entry.nonce)) throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_duplicate_nonce");
    if (
      entry.observationKind !== CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_KIND ||
      entry.nextSubsequentContinuationVerified !== true || entry.nextSubsequentContinuationExecuted !== true ||
      entry.nextSubsequentContinuationObserved !== true || entry.observationRecorded !== true ||
      entry.maximumObservationsPerSubsequentContinuation !== 1 || entry.remainingObservations !== 0
    ) throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_memory_contract_invalid");
    for (const key of EXTERNAL_EFFECT_FIELDS) {
      if (entry[key] !== false) throw new Error(`controlled_proof_execution_next_subsequent_continuation_observation_memory_${key}_must_be_false`);
    }
    const entryPayload = { ...entry };
    delete entryPayload.entryHash;
    if (digest(entryPayload) !== entry.entryHash) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_memory_entry_hash_mismatch");
    }
    normalized.push({ ...entry });
    receiptHashes.add(entry.nextSubsequentContinuationReceiptHash);
    observationIds.add(entry.observationId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledProofExecutionFollowingSubsequentContinuationObservationMemory(memory, { policy }) {
  try {
    const recreated = createControlledProofExecutionFollowingSubsequentContinuationObservationMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) {
      return { ok: false, reason: "controlled_proof_execution_next_subsequent_continuation_observation_memory_hash_mismatch" };
    }
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) {
      return { ok: false, reason: "controlled_proof_execution_next_subsequent_continuation_observation_memory_contract_mismatch" };
    }
    return { ok: true, memoryHash: recreated.memoryHash, ...recreated.summary };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_next_subsequent_continuation_observation_memory_invalid" };
  }
}

function verifyContext(args) {
  inspectPriorPolicy(
    args.controlledProofExecutionFollowingSubsequentContinuationPolicy,
    args.controlledProofExecutionFollowingSubsequentContinuationPolicyContext,
  );
  const subsequentMemoryInspection = inspectControlledProofExecutionFollowingSubsequentContinuationMemory(
    args.controlledProofExecutionFollowingSubsequentContinuationMemory,
    { policy: args.controlledProofExecutionFollowingSubsequentContinuationPolicy },
  );
  if (!subsequentMemoryInspection.ok) {
    throw new Error(`controlled_proof_execution_next_subsequent_continuation_memory_invalid:${subsequentMemoryInspection.reason}`);
  }
  const policyInspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationPolicy(
    args.controlledProofExecutionFollowingSubsequentContinuationObservationPolicy,
    args.controlledProofExecutionFollowingSubsequentContinuationObservationPolicyContext,
  );
  if (!policyInspection.ok) {
    throw new Error(`controlled_proof_execution_next_subsequent_continuation_observation_policy_invalid:${policyInspection.reason}`);
  }
  const memoryInspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationMemory(
    args.controlledProofExecutionFollowingSubsequentContinuationObservationMemory,
    { policy: args.controlledProofExecutionFollowingSubsequentContinuationObservationPolicy },
  );
  if (!memoryInspection.ok) {
    throw new Error(`controlled_proof_execution_next_subsequent_continuation_observation_memory_invalid:${memoryInspection.reason}`);
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

function priorChainContext(args) {
  const {
    controlledProofExecutionFollowingSubsequentContinuationObservationPolicy: _observationPolicy,
    controlledProofExecutionFollowingSubsequentContinuationObservationPolicyContext: _observationPolicyContext,
    controlledProofExecutionFollowingSubsequentContinuationObservationMemory: _observationMemory,
    trustedFollowingSubsequentContinuationObservers: _trustedObservers,
    maximumFollowingSubsequentContinuationObservationDelaySeconds: _maximumDelay,
    observationId: _observationId,
    observationKind: _observationKind,
    observerKeyId: _observerKeyId,
    observerPrivateKey: _observerPrivateKey,
    observedAt: _observedAt,
    observationNonce: _observationNonce,
    ...priorContext
  } = args ?? {};
  return priorContext;
}

function validateObservationWindow(receipt, observer, observedAt, maximumDelaySeconds) {
  assertIso(observedAt, "controlled_proof_execution_next_subsequent_continuation_observed_at");
  const continuedAtMs = Date.parse(receipt.continuedAt);
  const observedAtMs = Date.parse(observedAt);
  if (observedAtMs < continuedAtMs) throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_before_continuation");
  if (observedAtMs > continuedAtMs + maximumDelaySeconds * 1000) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_delay_exceeded");
  }
  if (observer.status !== "active") throw new Error("controlled_proof_execution_next_subsequent_continuation_observer_inactive");
  if (observedAtMs < Date.parse(observer.validFrom) || observedAtMs > Date.parse(observer.validUntil)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_observer_outside_validity");
  }
}

function validatePriorReceipt(args) {
  const receiptContext = {
    ...args.controlledProofExecutionFollowingSubsequentContinuationReceiptContext,
    controlledProofExecutionFollowingSubsequentContinuationPolicy: args.controlledProofExecutionFollowingSubsequentContinuationPolicy,
    controlledProofExecutionFollowingSubsequentContinuationMemory: args.controlledProofExecutionFollowingSubsequentContinuationMemory,
  };
  const inspection = inspectControlledProofExecutionFollowingSubsequentContinuationReceipt(
    args.controlledProofExecutionFollowingSubsequentContinuationReceipt,
    receiptContext,
  );
  if (!inspection.ok) {
    throw new Error(`controlled_proof_execution_next_subsequent_continuation_receipt_invalid:${inspection.reason}`);
  }
  if (!args.controlledProofExecutionFollowingSubsequentContinuationMemory.entries.some(
    (entry) => entry.nextSubsequentContinuationReceiptHash === args.controlledProofExecutionFollowingSubsequentContinuationReceipt.nextSubsequentContinuationReceiptHash,
  )) throw new Error("controlled_proof_execution_next_subsequent_continuation_not_recorded");
}

function signingPayload({ receipt, subsequentMemory, observationPolicy, observationMemoryHashBefore, observationId, observer, observedAt, nonce }) {
  return {
    signingSchema: "atlas.controlled-proof-execution-following-subsequent-continuation-observation-signing-payload.v1",
    compositionId: receipt.compositionId,
    ...Object.fromEntries(RECEIPT_BINDING_HASH_FIELDS.map((field) => [field, receipt[field]])),
    nextSubsequentContinuationReceiptHash: receipt.nextSubsequentContinuationReceiptHash,
    nextSubsequentContinuationMemoryHash: subsequentMemory.memoryHash,
    nextSubsequentContinuationObservationPolicyHash: observationPolicy.policyHash,
    nextSubsequentContinuationObservationMemoryHashBefore: observationMemoryHashBefore,
    nextSubsequentContinuationId: receipt.followingSubsequentContinuationId,
    executorKeyId: receipt.executorKeyId,
    executorActorId: receipt.executorActorId,
    observationId,
    observationKind: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_KIND,
    observerKeyId: observer.keyId,
    observerActorId: observer.actorId,
    continuedAt: receipt.continuedAt,
    observedAt,
    nonce,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_SIGNATURE_ALGORITHM,
    nextSubsequentContinuationVerified: true,
    nextSubsequentContinuationExecuted: true,
    nextSubsequentContinuationObserved: true,
    observationRecorded: true,
    maximumObservationsPerSubsequentContinuation: 1,
    remainingObservations: 0,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
}

export function observeControlledProofExecutionFollowingSubsequentContinuation(args) {
  verifyContext(args);
  validatePriorReceipt(args);
  const receipt = args.controlledProofExecutionFollowingSubsequentContinuationReceipt;
  const policy = args.controlledProofExecutionFollowingSubsequentContinuationObservationPolicy;
  const memory = args.controlledProofExecutionFollowingSubsequentContinuationObservationMemory;
  if (args.observationKind !== CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_KIND) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_kind_invalid");
  }
  assertSlug(args.observationId, "controlled_proof_execution_next_subsequent_continuation_observation_id");
  assertSlug(args.observationNonce, "controlled_proof_execution_next_subsequent_continuation_observation_nonce");
  if (memory.entries.some((entry) => entry.nextSubsequentContinuationReceiptHash === receipt.nextSubsequentContinuationReceiptHash)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_already_observed");
  }
  if (memory.entries.some((entry) => entry.observationId === args.observationId)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_duplicate_id");
  }
  if (memory.entries.some((entry) => entry.nonce === args.observationNonce)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_duplicate_nonce");
  }
  const observer = policy.trustedFollowingSubsequentContinuationObservers.find((item) => item.keyId === args.observerKeyId);
  if (!observer) throw new Error("controlled_proof_execution_next_subsequent_continuation_observer_untrusted");
  validateObservationWindow(receipt, observer, args.observedAt, policy.maximumFollowingSubsequentContinuationObservationDelaySeconds);
  const identities = collectPriorIdentities(priorChainContext(args));
  collectPriorIdentities(receipt, identities);
  if (identities.has(observer.actorId) || identities.has(observer.keyId)) {
    throw new Error("controlled_proof_execution_next_subsequent_continuation_observer_not_independent");
  }
  const memoryHashBefore = memory.memoryHash;
  const payload = signingPayload({
    receipt,
    subsequentMemory: args.controlledProofExecutionFollowingSubsequentContinuationMemory,
    observationPolicy: policy,
    observationMemoryHashBefore: memoryHashBefore,
    observationId: args.observationId,
    observer,
    observedAt: args.observedAt,
    nonce: args.observationNonce,
  });
  let signature;
  try { signature = cryptoSign(null, bytes(payload), args.observerPrivateKey).toString("base64url"); }
  catch { throw new Error("controlled_proof_execution_next_subsequent_continuation_observer_private_key_invalid"); }
  if (!cryptoVerify(null, bytes(payload), observer.publicKeyPem, Buffer.from(signature, "base64url"))) {
    throw new Error("private_key_does_not_match_controlled_proof_execution_next_subsequent_continuation_observer");
  }
  const receiptWithoutHash = {
    schema: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_RECEIPT_SCHEMA,
    ...payload,
    signature,
  };
  const observationReceipt = {
    ...receiptWithoutHash,
    nextSubsequentContinuationObservationReceiptHash: digest(receiptWithoutHash),
  };
  const entryPayload = {
    schema: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_MEMORY_ENTRY_SCHEMA,
    sequence: memory.entries.length + 1,
    previousEntryHash: memory.entries.at(-1)?.entryHash ?? null,
    ...payload,
    nextSubsequentContinuationObservationReceiptHash: observationReceipt.nextSubsequentContinuationObservationReceiptHash,
  };
  const entry = { ...entryPayload, entryHash: digest(entryPayload) };
  return {
    nextSubsequentContinuationObservationReceipt: observationReceipt,
    controlledProofExecutionFollowingSubsequentContinuationObservationMemory:
      createControlledProofExecutionFollowingSubsequentContinuationObservationMemory({ policy, entries: [...memory.entries, entry] }),
  };
}

export function inspectControlledProofExecutionFollowingSubsequentContinuationObservationReceipt(receipt, args) {
  try {
    verifyContext(args);
    validatePriorReceipt(args);
    if (receipt?.schema !== CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_RECEIPT_SCHEMA) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_receipt_schema_invalid");
    }
    const memory = args.controlledProofExecutionFollowingSubsequentContinuationObservationMemory;
    const entryIndex = memory.entries.findIndex(
      (entry) => entry.nextSubsequentContinuationObservationReceiptHash === receipt.nextSubsequentContinuationObservationReceiptHash,
    );
    if (entryIndex < 0) throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_not_recorded");
    const observer = args.controlledProofExecutionFollowingSubsequentContinuationObservationPolicy
      .trustedFollowingSubsequentContinuationObservers.find((item) => item.keyId === receipt.observerKeyId);
    if (!observer) throw new Error("controlled_proof_execution_next_subsequent_continuation_observer_untrusted");
    const identities = collectPriorIdentities(priorChainContext(args));
    collectPriorIdentities(args.controlledProofExecutionFollowingSubsequentContinuationReceipt, identities);
    if (identities.has(observer.actorId) || identities.has(observer.keyId)) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_observer_not_independent");
    }
    validateObservationWindow(
      args.controlledProofExecutionFollowingSubsequentContinuationReceipt,
      observer,
      receipt.observedAt,
      args.controlledProofExecutionFollowingSubsequentContinuationObservationPolicy.maximumFollowingSubsequentContinuationObservationDelaySeconds,
    );
    const payload = signingPayload({
      receipt: args.controlledProofExecutionFollowingSubsequentContinuationReceipt,
      subsequentMemory: args.controlledProofExecutionFollowingSubsequentContinuationMemory,
      observationPolicy: args.controlledProofExecutionFollowingSubsequentContinuationObservationPolicy,
      observationMemoryHashBefore: memoryHashForEntries(
        args.controlledProofExecutionFollowingSubsequentContinuationObservationPolicy,
        memory.entries.slice(0, entryIndex),
      ),
      observationId: receipt.observationId,
      observer,
      observedAt: receipt.observedAt,
      nonce: receipt.nonce,
    });
    for (const [key, expected] of Object.entries(payload)) {
      if (JSON.stringify(receipt[key]) !== JSON.stringify(expected)) {
        throw new Error(`controlled_proof_execution_next_subsequent_continuation_observation_${key}_mismatch`);
      }
    }
    if (typeof receipt.signature !== "string" ||
        !cryptoVerify(null, bytes(payload), observer.publicKeyPem, Buffer.from(receipt.signature, "base64url"))) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_signature_verification_failed");
    }
    const hashPayload = { ...receipt };
    delete hashPayload.nextSubsequentContinuationObservationReceiptHash;
    if (digest(hashPayload) !== receipt.nextSubsequentContinuationObservationReceiptHash) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_receipt_hash_mismatch");
    }
    const entry = memory.entries[entryIndex];
    if (entry.nextSubsequentContinuationReceiptHash !== receipt.nextSubsequentContinuationReceiptHash ||
        entry.nextSubsequentContinuationMemoryHash !== receipt.nextSubsequentContinuationMemoryHash ||
        entry.nextSubsequentContinuationObservationMemoryHashBefore !== receipt.nextSubsequentContinuationObservationMemoryHashBefore ||
        entry.observerActorId !== observer.actorId) {
      throw new Error("controlled_proof_execution_next_subsequent_continuation_observation_memory_entry_mismatch");
    }
    return {
      ok: true,
      nextSubsequentContinuationObservationReceiptHash: receipt.nextSubsequentContinuationObservationReceiptHash,
      nextSubsequentContinuationReceiptHash: receipt.nextSubsequentContinuationReceiptHash,
      observationKind: receipt.observationKind,
      nextSubsequentContinuationVerified: true,
      nextSubsequentContinuationExecuted: true,
      nextSubsequentContinuationObserved: true,
      publicationExecuted: false,
      externalPublicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_next_subsequent_continuation_observation_receipt_invalid" };
  }
}
