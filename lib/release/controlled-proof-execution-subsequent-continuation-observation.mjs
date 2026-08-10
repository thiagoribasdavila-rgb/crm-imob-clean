import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_RECEIPT_SCHEMA,
  inspectControlledProofExecutionSubsequentContinuationMemory,
  inspectControlledProofExecutionSubsequentContinuationPolicy,
  inspectControlledProofExecutionSubsequentContinuationReceipt,
} from "./controlled-proof-execution-subsequent-continuation.mjs";

export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_POLICY_SCHEMA =
  "atlas.controlled-proof-execution-subsequent-continuation-observation-policy.v1";
export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_RECEIPT_SCHEMA =
  "atlas.controlled-proof-execution-subsequent-continuation-observation-receipt.v1";
export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_MEMORY_SCHEMA =
  "atlas.controlled-proof-execution-subsequent-continuation-observation-memory.v1";
export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_MEMORY_ENTRY_SCHEMA =
  "atlas.controlled-proof-execution-subsequent-continuation-observation-memory-entry.v1";
export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_SIGNATURE_ALGORITHM = "ed25519";
export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVER_ROLE =
  "controlled-proof-execution-subsequent-continuation-observer";
export const CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_KIND =
  "execution-subsequent-continuation-confirmed";

const EXTERNAL_EFFECT_FIELDS = [
  "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted",
  "deployExecuted", "releasePromoted",
];
const RECEIPT_BINDING_HASH_FIELDS = [
  "compositionDecisionHash", "publicationDecisionHash", "evidenceDecisionHash", "packageSha256", "inventoryHash",
  "executionStartReceiptHash", "executionStartPolicyHash", "executionStartMemoryHash", "priorObservationReceiptHash",
  "continuationReceiptHash", "continuationPolicyHash", "continuationMemoryHash", "observationReceiptHash",
  "observationPolicyHash", "observationMemoryHash", "reviewReceiptHash", "reviewPolicyHash", "reviewMemoryHash",
  "reviewAuthorizationHash", "reviewAuthorizationPolicyHash", "reviewAuthorizationMemoryHash", "consumptionReceiptHash",
  "consumptionPolicyHash", "consumptionMemoryHash", "subsequentContinuationPolicyHash",
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
    throw new Error("controlled_proof_execution_subsequent_continuation_observer_invalid");
  }
  assertSlug(observer.keyId, "controlled_proof_execution_subsequent_continuation_observer_key_id");
  assertSlug(observer.actorId, "controlled_proof_execution_subsequent_continuation_observer_actor_id");
  if (observer.role !== CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVER_ROLE) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observer_role_invalid");
  }
  if (!["active", "inactive"].includes(observer.status)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observer_status_invalid");
  }
  assertIso(observer.validFrom, "controlled_proof_execution_subsequent_continuation_observer_valid_from");
  assertIso(observer.validUntil, "controlled_proof_execution_subsequent_continuation_observer_valid_until");
  if (Date.parse(observer.validUntil) <= Date.parse(observer.validFrom)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observer_validity_invalid");
  }
  try {
    const key = createPublicKey(observer.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch {
    throw new Error("controlled_proof_execution_subsequent_continuation_observer_public_key_invalid");
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
  const inspection = inspectControlledProofExecutionSubsequentContinuationPolicy(policy, context);
  if (!inspection.ok) {
    throw new Error(`controlled_proof_execution_subsequent_continuation_policy_invalid:${inspection.reason}`);
  }
}

export function createControlledProofExecutionSubsequentContinuationObservationPolicy({
  controlledProofExecutionSubsequentContinuationPolicy: subsequentPolicy,
  controlledProofExecutionSubsequentContinuationPolicyContext: subsequentPolicyContext,
  trustedSubsequentContinuationObservers = [],
  maximumSubsequentContinuationObservationDelaySeconds = 300,
}) {
  inspectPriorPolicy(subsequentPolicy, subsequentPolicyContext);
  if (!Array.isArray(trustedSubsequentContinuationObservers)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observers_invalid");
  }
  if (!Number.isInteger(maximumSubsequentContinuationObservationDelaySeconds) ||
      maximumSubsequentContinuationObservationDelaySeconds < 1 ||
      maximumSubsequentContinuationObservationDelaySeconds > 3600) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_delay_invalid");
  }
  const observers = trustedSubsequentContinuationObservers.map(normalizeObserver)
    .sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(observers.map((item) => item.keyId)).size !== observers.length) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observer_key_id_duplicate");
  }
  if (new Set(observers.map((item) => item.actorId)).size !== observers.length) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observer_actor_id_duplicate");
  }
  const payload = {
    schema: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_POLICY_SCHEMA,
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
    subsequentContinuationPolicyHash: subsequentPolicy.policyHash,
    requiredSubsequentContinuationReceiptSchema: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_RECEIPT_SCHEMA,
    requiredMemoryEntrySchema: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_MEMORY_ENTRY_SCHEMA,
    observationKind: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_KIND,
    observerRole: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVER_ROLE,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_SIGNATURE_ALGORITHM,
    trustedSubsequentContinuationObservers: observers,
    maximumSubsequentContinuationObservationDelaySeconds,
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
    subsequentContinuationSignatureVerificationRequired: true,
    observerIndependenceRequired: true,
    observerValidityAtObservationRequired: true,
    appendOnlyObservationMemoryRequired: true,
    duplicateSubsequentContinuationRejected: true,
    atomicMemoryHeadBindingRequired: true,
    signedObservationRequired: true,
    singleObservationPerSubsequentContinuationRequired: true,
    maximumObservationsPerSubsequentContinuation: 1,
    subsequentContinuationObservationAllowed: true,
    subsequentContinuationObservationReviewAllowed: false,
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

export function inspectControlledProofExecutionSubsequentContinuationObservationPolicy(policy, context) {
  try {
    const recreated = createControlledProofExecutionSubsequentContinuationObservationPolicy(context);
    if (recreated.policyHash !== policy?.policyHash) {
      return { ok: false, reason: "controlled_proof_execution_subsequent_continuation_observation_policy_hash_mismatch" };
    }
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) {
      return { ok: false, reason: "controlled_proof_execution_subsequent_continuation_observation_policy_contract_mismatch" };
    }
    return { ok: true, policyHash: recreated.policyHash, trustedObservers: recreated.trustedSubsequentContinuationObservers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_subsequent_continuation_observation_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedSubsequentContinuationObservations: entries.length,
      observedSubsequentContinuations: new Set(entries.map((entry) => entry.subsequentContinuationReceiptHash)).size,
      distinctObservations: new Set(entries.map((entry) => entry.observationId)).size,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      subsequentContinuationExecuted: entries.length > 0,
      subsequentContinuationObserved: entries.length > 0,
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

export function createControlledProofExecutionSubsequentContinuationObservationMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_POLICY_SCHEMA) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_memory_policy_invalid");
  }
  assertHash(policy.policyHash, "controlled_proof_execution_subsequent_continuation_observation_memory_policy_hash");
  if (!Array.isArray(entries)) throw new Error("controlled_proof_execution_subsequent_continuation_observation_memory_entries_invalid");
  let previousEntryHash = null;
  const receiptHashes = new Set();
  const observationIds = new Set();
  const nonces = new Set();
  const normalized = [];
  for (const [index, entry] of entries.entries()) {
    if (entry?.schema !== CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_MEMORY_ENTRY_SCHEMA) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_memory_entry_schema_invalid");
    }
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_memory_chain_invalid");
    }
    for (const field of [
      "subsequentContinuationObservationReceiptHash", "subsequentContinuationReceiptHash",
      "subsequentContinuationPolicyHash", "subsequentContinuationMemoryHash",
      "subsequentContinuationObservationPolicyHash", "subsequentContinuationObservationMemoryHashBefore",
      ...RECEIPT_BINDING_HASH_FIELDS,
    ]) assertHash(entry[field], `controlled_proof_execution_subsequent_continuation_observation_memory_${field}`);
    for (const [value, field] of [
      [entry.subsequentContinuationId, "subsequent_continuation_id"], [entry.observationId, "observation_id"],
      [entry.observerKeyId, "observer_key_id"], [entry.observerActorId, "observer_actor_id"], [entry.nonce, "nonce"],
    ]) assertSlug(value, `controlled_proof_execution_subsequent_continuation_observation_memory_${field}`);
    assertIso(entry.continuedAt, "controlled_proof_execution_subsequent_continuation_observation_memory_continued_at");
    assertIso(entry.observedAt, "controlled_proof_execution_subsequent_continuation_observation_memory_observed_at");
    if (entry.subsequentContinuationObservationPolicyHash !== policy.policyHash) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_memory_policy_binding_mismatch");
    }
    if (entry.subsequentContinuationObservationMemoryHashBefore !== memoryHashForEntries(policy, normalized)) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_memory_head_binding_mismatch");
    }
    if (receiptHashes.has(entry.subsequentContinuationReceiptHash)) {
      throw new Error("controlled_proof_execution_subsequent_continuation_already_observed");
    }
    if (observationIds.has(entry.observationId)) throw new Error("controlled_proof_execution_subsequent_continuation_observation_duplicate_id");
    if (nonces.has(entry.nonce)) throw new Error("controlled_proof_execution_subsequent_continuation_observation_duplicate_nonce");
    if (
      entry.observationKind !== CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_KIND ||
      entry.subsequentContinuationVerified !== true || entry.subsequentContinuationExecuted !== true ||
      entry.subsequentContinuationObserved !== true || entry.observationRecorded !== true ||
      entry.maximumObservationsPerSubsequentContinuation !== 1 || entry.remainingObservations !== 0
    ) throw new Error("controlled_proof_execution_subsequent_continuation_observation_memory_contract_invalid");
    for (const key of EXTERNAL_EFFECT_FIELDS) {
      if (entry[key] !== false) throw new Error(`controlled_proof_execution_subsequent_continuation_observation_memory_${key}_must_be_false`);
    }
    const entryPayload = { ...entry };
    delete entryPayload.entryHash;
    if (digest(entryPayload) !== entry.entryHash) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_memory_entry_hash_mismatch");
    }
    normalized.push({ ...entry });
    receiptHashes.add(entry.subsequentContinuationReceiptHash);
    observationIds.add(entry.observationId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledProofExecutionSubsequentContinuationObservationMemory(memory, { policy }) {
  try {
    const recreated = createControlledProofExecutionSubsequentContinuationObservationMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) {
      return { ok: false, reason: "controlled_proof_execution_subsequent_continuation_observation_memory_hash_mismatch" };
    }
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) {
      return { ok: false, reason: "controlled_proof_execution_subsequent_continuation_observation_memory_contract_mismatch" };
    }
    return { ok: true, memoryHash: recreated.memoryHash, ...recreated.summary };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_subsequent_continuation_observation_memory_invalid" };
  }
}

function verifyContext(args) {
  inspectPriorPolicy(
    args.controlledProofExecutionSubsequentContinuationPolicy,
    args.controlledProofExecutionSubsequentContinuationPolicyContext,
  );
  const subsequentMemoryInspection = inspectControlledProofExecutionSubsequentContinuationMemory(
    args.controlledProofExecutionSubsequentContinuationMemory,
    { policy: args.controlledProofExecutionSubsequentContinuationPolicy },
  );
  if (!subsequentMemoryInspection.ok) {
    throw new Error(`controlled_proof_execution_subsequent_continuation_memory_invalid:${subsequentMemoryInspection.reason}`);
  }
  const policyInspection = inspectControlledProofExecutionSubsequentContinuationObservationPolicy(
    args.controlledProofExecutionSubsequentContinuationObservationPolicy,
    args.controlledProofExecutionSubsequentContinuationObservationPolicyContext,
  );
  if (!policyInspection.ok) {
    throw new Error(`controlled_proof_execution_subsequent_continuation_observation_policy_invalid:${policyInspection.reason}`);
  }
  const memoryInspection = inspectControlledProofExecutionSubsequentContinuationObservationMemory(
    args.controlledProofExecutionSubsequentContinuationObservationMemory,
    { policy: args.controlledProofExecutionSubsequentContinuationObservationPolicy },
  );
  if (!memoryInspection.ok) {
    throw new Error(`controlled_proof_execution_subsequent_continuation_observation_memory_invalid:${memoryInspection.reason}`);
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

function validateObservationWindow(receipt, observer, observedAt, maximumDelaySeconds) {
  assertIso(observedAt, "controlled_proof_execution_subsequent_continuation_observed_at");
  const continuedAtMs = Date.parse(receipt.continuedAt);
  const observedAtMs = Date.parse(observedAt);
  if (observedAtMs < continuedAtMs) throw new Error("controlled_proof_execution_subsequent_continuation_observation_before_continuation");
  if (observedAtMs > continuedAtMs + maximumDelaySeconds * 1000) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_delay_exceeded");
  }
  if (observer.status !== "active") throw new Error("controlled_proof_execution_subsequent_continuation_observer_inactive");
  if (observedAtMs < Date.parse(observer.validFrom) || observedAtMs > Date.parse(observer.validUntil)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observer_outside_validity");
  }
}

function validatePriorReceipt(args) {
  const receiptContext = {
    ...args.controlledProofExecutionSubsequentContinuationReceiptContext,
    controlledProofExecutionSubsequentContinuationPolicy: args.controlledProofExecutionSubsequentContinuationPolicy,
    controlledProofExecutionSubsequentContinuationMemory: args.controlledProofExecutionSubsequentContinuationMemory,
  };
  const inspection = inspectControlledProofExecutionSubsequentContinuationReceipt(
    args.controlledProofExecutionSubsequentContinuationReceipt,
    receiptContext,
  );
  if (!inspection.ok) {
    throw new Error(`controlled_proof_execution_subsequent_continuation_receipt_invalid:${inspection.reason}`);
  }
  if (!args.controlledProofExecutionSubsequentContinuationMemory.entries.some(
    (entry) => entry.subsequentContinuationReceiptHash === args.controlledProofExecutionSubsequentContinuationReceipt.subsequentContinuationReceiptHash,
  )) throw new Error("controlled_proof_execution_subsequent_continuation_not_recorded");
}

function signingPayload({ receipt, subsequentMemory, observationPolicy, observationMemoryHashBefore, observationId, observer, observedAt, nonce }) {
  return {
    signingSchema: "atlas.controlled-proof-execution-subsequent-continuation-observation-signing-payload.v1",
    compositionId: receipt.compositionId,
    ...Object.fromEntries(RECEIPT_BINDING_HASH_FIELDS.map((field) => [field, receipt[field]])),
    subsequentContinuationReceiptHash: receipt.subsequentContinuationReceiptHash,
    subsequentContinuationMemoryHash: subsequentMemory.memoryHash,
    subsequentContinuationObservationPolicyHash: observationPolicy.policyHash,
    subsequentContinuationObservationMemoryHashBefore: observationMemoryHashBefore,
    subsequentContinuationId: receipt.subsequentContinuationId,
    executorKeyId: receipt.executorKeyId,
    executorActorId: receipt.executorActorId,
    observationId,
    observationKind: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_KIND,
    observerKeyId: observer.keyId,
    observerActorId: observer.actorId,
    continuedAt: receipt.continuedAt,
    observedAt,
    nonce,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_SIGNATURE_ALGORITHM,
    subsequentContinuationVerified: true,
    subsequentContinuationExecuted: true,
    subsequentContinuationObserved: true,
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

export function observeControlledProofExecutionSubsequentContinuation(args) {
  verifyContext(args);
  validatePriorReceipt(args);
  const receipt = args.controlledProofExecutionSubsequentContinuationReceipt;
  const policy = args.controlledProofExecutionSubsequentContinuationObservationPolicy;
  const memory = args.controlledProofExecutionSubsequentContinuationObservationMemory;
  if (args.observationKind !== CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_KIND) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_kind_invalid");
  }
  assertSlug(args.observationId, "controlled_proof_execution_subsequent_continuation_observation_id");
  assertSlug(args.observationNonce, "controlled_proof_execution_subsequent_continuation_observation_nonce");
  if (memory.entries.some((entry) => entry.subsequentContinuationReceiptHash === receipt.subsequentContinuationReceiptHash)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_already_observed");
  }
  if (memory.entries.some((entry) => entry.observationId === args.observationId)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_duplicate_id");
  }
  if (memory.entries.some((entry) => entry.nonce === args.observationNonce)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observation_duplicate_nonce");
  }
  const observer = policy.trustedSubsequentContinuationObservers.find((item) => item.keyId === args.observerKeyId);
  if (!observer) throw new Error("controlled_proof_execution_subsequent_continuation_observer_untrusted");
  validateObservationWindow(receipt, observer, args.observedAt, policy.maximumSubsequentContinuationObservationDelaySeconds);
  const identities = collectPriorIdentities(args.controlledProofExecutionSubsequentContinuationReceiptContext);
  collectPriorIdentities(receipt, identities);
  if (identities.has(observer.actorId) || identities.has(observer.keyId)) {
    throw new Error("controlled_proof_execution_subsequent_continuation_observer_not_independent");
  }
  const memoryHashBefore = memory.memoryHash;
  const payload = signingPayload({
    receipt,
    subsequentMemory: args.controlledProofExecutionSubsequentContinuationMemory,
    observationPolicy: policy,
    observationMemoryHashBefore: memoryHashBefore,
    observationId: args.observationId,
    observer,
    observedAt: args.observedAt,
    nonce: args.observationNonce,
  });
  let signature;
  try { signature = cryptoSign(null, bytes(payload), args.observerPrivateKey).toString("base64url"); }
  catch { throw new Error("controlled_proof_execution_subsequent_continuation_observer_private_key_invalid"); }
  if (!cryptoVerify(null, bytes(payload), observer.publicKeyPem, Buffer.from(signature, "base64url"))) {
    throw new Error("private_key_does_not_match_controlled_proof_execution_subsequent_continuation_observer");
  }
  const receiptWithoutHash = {
    schema: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_RECEIPT_SCHEMA,
    ...payload,
    signature,
  };
  const observationReceipt = {
    ...receiptWithoutHash,
    subsequentContinuationObservationReceiptHash: digest(receiptWithoutHash),
  };
  const entryPayload = {
    schema: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_MEMORY_ENTRY_SCHEMA,
    sequence: memory.entries.length + 1,
    previousEntryHash: memory.entries.at(-1)?.entryHash ?? null,
    ...payload,
    subsequentContinuationObservationReceiptHash: observationReceipt.subsequentContinuationObservationReceiptHash,
  };
  const entry = { ...entryPayload, entryHash: digest(entryPayload) };
  return {
    subsequentContinuationObservationReceipt: observationReceipt,
    controlledProofExecutionSubsequentContinuationObservationMemory:
      createControlledProofExecutionSubsequentContinuationObservationMemory({ policy, entries: [...memory.entries, entry] }),
  };
}

export function inspectControlledProofExecutionSubsequentContinuationObservationReceipt(receipt, args) {
  try {
    verifyContext(args);
    validatePriorReceipt(args);
    if (receipt?.schema !== CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_RECEIPT_SCHEMA) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_receipt_schema_invalid");
    }
    const memory = args.controlledProofExecutionSubsequentContinuationObservationMemory;
    const entryIndex = memory.entries.findIndex(
      (entry) => entry.subsequentContinuationObservationReceiptHash === receipt.subsequentContinuationObservationReceiptHash,
    );
    if (entryIndex < 0) throw new Error("controlled_proof_execution_subsequent_continuation_observation_not_recorded");
    const observer = args.controlledProofExecutionSubsequentContinuationObservationPolicy
      .trustedSubsequentContinuationObservers.find((item) => item.keyId === receipt.observerKeyId);
    if (!observer) throw new Error("controlled_proof_execution_subsequent_continuation_observer_untrusted");
    const identities = collectPriorIdentities(args.controlledProofExecutionSubsequentContinuationReceiptContext);
    collectPriorIdentities(args.controlledProofExecutionSubsequentContinuationReceipt, identities);
    if (identities.has(observer.actorId) || identities.has(observer.keyId)) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observer_not_independent");
    }
    validateObservationWindow(
      args.controlledProofExecutionSubsequentContinuationReceipt,
      observer,
      receipt.observedAt,
      args.controlledProofExecutionSubsequentContinuationObservationPolicy.maximumSubsequentContinuationObservationDelaySeconds,
    );
    const payload = signingPayload({
      receipt: args.controlledProofExecutionSubsequentContinuationReceipt,
      subsequentMemory: args.controlledProofExecutionSubsequentContinuationMemory,
      observationPolicy: args.controlledProofExecutionSubsequentContinuationObservationPolicy,
      observationMemoryHashBefore: memoryHashForEntries(
        args.controlledProofExecutionSubsequentContinuationObservationPolicy,
        memory.entries.slice(0, entryIndex),
      ),
      observationId: receipt.observationId,
      observer,
      observedAt: receipt.observedAt,
      nonce: receipt.nonce,
    });
    for (const [key, expected] of Object.entries(payload)) {
      if (JSON.stringify(receipt[key]) !== JSON.stringify(expected)) {
        throw new Error(`controlled_proof_execution_subsequent_continuation_observation_${key}_mismatch`);
      }
    }
    if (typeof receipt.signature !== "string" ||
        !cryptoVerify(null, bytes(payload), observer.publicKeyPem, Buffer.from(receipt.signature, "base64url"))) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_signature_verification_failed");
    }
    const hashPayload = { ...receipt };
    delete hashPayload.subsequentContinuationObservationReceiptHash;
    if (digest(hashPayload) !== receipt.subsequentContinuationObservationReceiptHash) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_receipt_hash_mismatch");
    }
    const entry = memory.entries[entryIndex];
    if (entry.subsequentContinuationReceiptHash !== receipt.subsequentContinuationReceiptHash ||
        entry.subsequentContinuationMemoryHash !== receipt.subsequentContinuationMemoryHash ||
        entry.subsequentContinuationObservationMemoryHashBefore !== receipt.subsequentContinuationObservationMemoryHashBefore ||
        entry.observerActorId !== observer.actorId) {
      throw new Error("controlled_proof_execution_subsequent_continuation_observation_memory_entry_mismatch");
    }
    return {
      ok: true,
      subsequentContinuationObservationReceiptHash: receipt.subsequentContinuationObservationReceiptHash,
      subsequentContinuationReceiptHash: receipt.subsequentContinuationReceiptHash,
      observationKind: receipt.observationKind,
      subsequentContinuationVerified: true,
      subsequentContinuationExecuted: true,
      subsequentContinuationObserved: true,
      publicationExecuted: false,
      externalPublicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_subsequent_continuation_observation_receipt_invalid" };
  }
}
