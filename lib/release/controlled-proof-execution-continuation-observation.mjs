import {
  createHash,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import {
  CONTROLLED_PROOF_EXECUTION_CONTINUATION_RECEIPT_SCHEMA,
  inspectControlledProofExecutionContinuationMemory,
  inspectControlledProofExecutionContinuationPolicy,
  inspectControlledProofExecutionContinuationReceipt,
} from "./controlled-proof-execution-continuation.mjs";

export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_POLICY_SCHEMA = "atlas.controlled-proof-execution-continuation-observation-policy.v1";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_RECEIPT_SCHEMA = "atlas.controlled-proof-execution-continuation-observation-receipt.v1";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_MEMORY_SCHEMA = "atlas.controlled-proof-execution-continuation-observation-memory.v1";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_MEMORY_ENTRY_SCHEMA = "atlas.controlled-proof-execution-continuation-observation-memory-entry.v1";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_SIGNATURE_ALGORITHM = "ed25519";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_KIND = "execution-continuation-confirmed";

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

function continuationPolicyContext(args) {
  return {
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

function verifyContinuationPolicy(policy, args) {
  const inspection = inspectControlledProofExecutionContinuationPolicy(policy, continuationPolicyContext(args));
  if (!inspection.ok) throw new Error(`controlled_proof_execution_continuation_policy_invalid:${inspection.reason}`);
}

function normalizeObserver(observer) {
  if (!observer || typeof observer !== "object") throw new Error("controlled_proof_execution_continuation_observer_invalid");
  for (const field of ["keyId", "actorId", "role"]) assertSlug(observer[field], `controlled_proof_execution_continuation_observer_${field}`);
  if (observer.role !== "continuation-observer") throw new Error("controlled_proof_execution_continuation_observer_role_invalid");
  if (!new Set(["active", "inactive"]).has(observer.status)) throw new Error("controlled_proof_execution_continuation_observer_status_invalid");
  assertIso(observer.validFrom, "controlled_proof_execution_continuation_observer_valid_from");
  assertIso(observer.validUntil, "controlled_proof_execution_continuation_observer_valid_until");
  if (Date.parse(observer.validUntil) <= Date.parse(observer.validFrom)) throw new Error("controlled_proof_execution_continuation_observer_validity_invalid");
  if (typeof observer.publicKeyPem !== "string" || !observer.publicKeyPem.includes("BEGIN PUBLIC KEY")) throw new Error("controlled_proof_execution_continuation_observer_public_key_invalid");
  try {
    if (createPublicKey(observer.publicKeyPem).asymmetricKeyType !== "ed25519") throw new Error();
  } catch {
    throw new Error("controlled_proof_execution_continuation_observer_public_key_invalid");
  }
  return {
    keyId: observer.keyId,
    actorId: observer.actorId,
    role: observer.role,
    publicKeyPem: observer.publicKeyPem,
    status: observer.status,
    validFrom: observer.validFrom,
    validUntil: observer.validUntil,
  };
}

export function createControlledProofExecutionContinuationObservationPolicy({
  controlledProofExecutionContinuationPolicy: continuationPolicy,
  trustedContinuationObservers = [],
  maximumContinuationObservationDelaySeconds = 300,
  ...upstream
}) {
  verifyContinuationPolicy(continuationPolicy, upstream);
  if (!Array.isArray(trustedContinuationObservers)) throw new Error("trusted_continuation_observers_invalid");
  const observers = trustedContinuationObservers.map(normalizeObserver);
  if (new Set(observers.map((item) => item.keyId)).size !== observers.length) throw new Error("trusted_continuation_observer_key_id_duplicate");
  if (new Set(observers.map((item) => item.actorId)).size !== observers.length) throw new Error("trusted_continuation_observer_actor_id_duplicate");
  if (!Number.isInteger(maximumContinuationObservationDelaySeconds) || maximumContinuationObservationDelaySeconds < 1 || maximumContinuationObservationDelaySeconds > 3600) {
    throw new Error("maximum_continuation_observation_delay_seconds_invalid");
  }
  const payload = {
    schema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_POLICY_SCHEMA,
    compositionId: continuationPolicy.compositionId,
    compositionDecisionHash: continuationPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: continuationPolicy.publicationDecisionPolicyHash,
    executionStartPolicyHash: continuationPolicy.executionStartPolicyHash,
    observationPolicyHash: continuationPolicy.observationPolicyHash,
    continuationAuthorizationPolicyHash: continuationPolicy.continuationAuthorizationPolicyHash,
    continuationPolicyHash: continuationPolicy.policyHash,
    requiredContinuationReceiptSchema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_RECEIPT_SCHEMA,
    requiredMemoryEntrySchema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_MEMORY_ENTRY_SCHEMA,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_SIGNATURE_ALGORITHM,
    trustedContinuationObservers: observers,
    allowedObservationKinds: [CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_KIND],
    maximumContinuationObservationDelaySeconds,
    recordedContinuationRequired: true,
    exactContinuationBindingRequired: true,
    exactContinuationMemoryBindingRequired: true,
    exactContinuationAuthorizationBindingRequired: true,
    exactPriorObservationBindingRequired: true,
    exactExecutionStartBindingRequired: true,
    exactTargetExecutorBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    continuationSignatureVerificationRequired: true,
    observerIndependenceRequired: true,
    observerValidityAtObservationRequired: true,
    appendOnlyObservationMemoryRequired: true,
    duplicateContinuationRejected: true,
    atomicMemoryHeadBindingRequired: true,
    signedObservationRequired: true,
    singleObservationPerContinuationRequired: true,
    maximumObservationsPerContinuation: 1,
    controlledProofExecutionContinuationObservationAllowed: true,
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

export function inspectControlledProofExecutionContinuationObservationPolicy(policy, context) {
  try {
    const recreated = createControlledProofExecutionContinuationObservationPolicy(context);
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "controlled_proof_execution_continuation_observation_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "controlled_proof_execution_continuation_observation_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedContinuationObservers: recreated.trustedContinuationObservers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_continuation_observation_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedContinuationObservations: entries.length,
      observedContinuations: new Set(entries.map((entry) => entry.continuationReceiptHash)).size,
      distinctObservations: new Set(entries.map((entry) => entry.observationReceiptHash)).size,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      controlledProofExecutionStarted: entries.length > 0,
      controlledProofExecutionObserved: entries.length > 0,
      controlledProofExecutionContinuationAuthorized: entries.length > 0,
      controlledProofExecutionContinued: entries.length > 0,
      controlledProofExecutionContinuationObserved: entries.length > 0,
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

export function createControlledProofExecutionContinuationObservationMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_POLICY_SCHEMA) throw new Error("controlled_proof_execution_continuation_observation_memory_policy_invalid");
  assertHash(policy.policyHash, "controlled_proof_execution_continuation_observation_memory_policy_hash");
  if (!Array.isArray(entries)) throw new Error("controlled_proof_execution_continuation_observation_memory_entries_invalid");
  let previousEntryHash = null;
  const continuationHashes = new Set();
  const observationIds = new Set();
  const nonces = new Set();
  const normalized = [];
  for (const [index, entry] of entries.entries()) {
    if (entry?.schema !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_MEMORY_ENTRY_SCHEMA) throw new Error("controlled_proof_execution_continuation_observation_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("controlled_proof_execution_continuation_observation_memory_chain_invalid");
    for (const field of [
      "observationReceiptHash", "observationPolicyHash", "observationMemoryHashBefore",
      "continuationReceiptHash", "continuationPolicyHash", "continuationMemoryHash",
      "continuationAuthorizationHash", "continuationAuthorizationPolicyHash", "continuationAuthorizationMemoryHash",
      "priorObservationReceiptHash", "priorObservationPolicyHash", "priorObservationMemoryHash",
      "executionStartReceiptHash", "executionStartPolicyHash", "executionStartMemoryHash", "packageSha256", "inventoryHash",
    ]) assertHash(entry[field], `controlled_proof_execution_continuation_observation_memory_${field}`);
    for (const field of [
      "observationId", "observationKind", "continuationId", "continuationAuthorizationId",
      "priorObservationId", "executionStartId", "externalExecutorActorId", "priorObserverActorId",
      "continuationAuthorizerActorId", "observerActorId", "nonce",
    ]) assertSlug(entry[field], `controlled_proof_execution_continuation_observation_memory_${field}`);
    assertIso(entry.continuedAt, "controlled_proof_execution_continuation_observation_memory_continued_at");
    assertIso(entry.observedAt, "controlled_proof_execution_continuation_observation_memory_observed_at");
    if (entry.observationPolicyHash !== policy.policyHash) throw new Error("controlled_proof_execution_continuation_observation_memory_policy_binding_mismatch");
    if (entry.observationMemoryHashBefore !== memoryHashForEntries(policy, normalized)) throw new Error("controlled_proof_execution_continuation_observation_memory_head_binding_mismatch");
    if (!policy.allowedObservationKinds.includes(entry.observationKind)) throw new Error("controlled_proof_execution_continuation_observation_kind_not_allowed");
    if (continuationHashes.has(entry.continuationReceiptHash)) throw new Error("controlled_proof_execution_continuation_already_observed");
    if (observationIds.has(entry.observationId)) throw new Error("controlled_proof_execution_continuation_observation_duplicate_id");
    if (nonces.has(entry.nonce)) throw new Error("controlled_proof_execution_continuation_observation_duplicate_nonce");
    if (
      entry.continuationVerified !== true || entry.controlledProofExecutionStarted !== true ||
      entry.controlledProofExecutionObserved !== true || entry.controlledProofExecutionContinuationAuthorized !== true ||
      entry.controlledProofExecutionContinued !== true || entry.controlledProofExecutionContinuationObserved !== true
    ) throw new Error("controlled_proof_execution_continuation_observation_memory_contract_invalid");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`controlled_proof_execution_continuation_observation_memory_${key}_must_be_false`);
    }
    const entryPayload = { ...entry };
    delete entryPayload.entryHash;
    if (digest(entryPayload) !== entry.entryHash) throw new Error("controlled_proof_execution_continuation_observation_memory_entry_hash_mismatch");
    normalized.push({ ...entry });
    continuationHashes.add(entry.continuationReceiptHash);
    observationIds.add(entry.observationId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledProofExecutionContinuationObservationMemory(memory, { policy }) {
  try {
    const recreated = createControlledProofExecutionContinuationObservationMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "controlled_proof_execution_continuation_observation_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "controlled_proof_execution_continuation_observation_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, ...recreated.summary };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_continuation_observation_memory_invalid" };
  }
}

function observationPolicyContext(args) {
  return {
    controlledProofExecutionContinuationPolicy: args.controlledProofExecutionContinuationPolicy,
    trustedContinuationObservers: args.trustedContinuationObservers,
    maximumContinuationObservationDelaySeconds: args.maximumContinuationObservationDelaySeconds,
    ...continuationPolicyContext(args),
  };
}

function verifyContext(args) {
  const policyInspection = inspectControlledProofExecutionContinuationObservationPolicy(
    args.controlledProofExecutionContinuationObservationPolicy,
    observationPolicyContext(args),
  );
  if (!policyInspection.ok) throw new Error(`controlled_proof_execution_continuation_observation_policy_invalid:${policyInspection.reason}`);
  const observationMemoryInspection = inspectControlledProofExecutionContinuationObservationMemory(
    args.controlledProofExecutionContinuationObservationMemory,
    { policy: args.controlledProofExecutionContinuationObservationPolicy },
  );
  if (!observationMemoryInspection.ok) throw new Error(`controlled_proof_execution_continuation_observation_memory_invalid:${observationMemoryInspection.reason}`);
  const continuationMemoryInspection = inspectControlledProofExecutionContinuationMemory(
    args.controlledProofExecutionContinuationMemory,
    { policy: args.controlledProofExecutionContinuationPolicy },
  );
  if (!continuationMemoryInspection.ok) throw new Error(`controlled_proof_execution_continuation_memory_invalid:${continuationMemoryInspection.reason}`);
}

function validateObservationWindow(continuationReceipt, observer, observedAt, maximumDelaySeconds) {
  assertIso(observedAt, "controlled_proof_execution_continuation_observed_at");
  const observed = Date.parse(observedAt);
  const continued = Date.parse(continuationReceipt.continuedAt);
  if (observed < continued) throw new Error("controlled_proof_execution_continuation_observation_before_continuation");
  if (observed > continued + (maximumDelaySeconds * 1000)) throw new Error("controlled_proof_execution_continuation_observation_window_expired");
  if (observer.status !== "active") throw new Error("controlled_proof_execution_continuation_observer_inactive");
  if (observed < Date.parse(observer.validFrom) || observed > Date.parse(observer.validUntil)) throw new Error("controlled_proof_execution_continuation_observer_key_outside_validity");
  const forbiddenKeys = new Set([
    continuationReceipt.externalExecutorKeyId,
    continuationReceipt.continuationAuthorizerKeyId,
    continuationReceipt.observerKeyId,
  ]);
  const forbiddenActors = new Set([
    continuationReceipt.externalExecutorActorId,
    continuationReceipt.continuationAuthorizerActorId,
    continuationReceipt.observerActorId,
  ]);
  if (forbiddenKeys.has(observer.keyId) || forbiddenActors.has(observer.actorId)) {
    throw new Error("controlled_proof_execution_continuation_observer_not_independent");
  }
}

function signingPayload({ continuationReceipt, continuationMemory, observationPolicy, observationMemoryHashBefore, observationId, observationKind, observer, observedAt, nonce }) {
  if (!continuationMemory.entries.some((entry) => entry.continuationReceiptHash === continuationReceipt.continuationReceiptHash && entry.controlledProofExecutionContinued === true)) {
    throw new Error("controlled_proof_execution_continuation_not_recorded");
  }
  return {
    signingSchema: "atlas.controlled-proof-execution-continuation-observation-signing-payload.v1",
    compositionId: continuationReceipt.compositionId,
    compositionDecisionHash: continuationReceipt.compositionDecisionHash,
    publicationDecisionHash: continuationReceipt.publicationDecisionHash,
    evidenceDecisionHash: continuationReceipt.evidenceDecisionHash,
    packageSha256: continuationReceipt.packageSha256,
    inventoryHash: continuationReceipt.inventoryHash,
    executionStartReceiptHash: continuationReceipt.executionStartReceiptHash,
    executionStartPolicyHash: continuationReceipt.executionStartPolicyHash,
    executionStartMemoryHash: continuationReceipt.executionStartMemoryHash,
    executionStartId: continuationReceipt.executionStartId,
    priorObservationReceiptHash: continuationReceipt.observationReceiptHash,
    priorObservationPolicyHash: continuationReceipt.observationPolicyHash,
    priorObservationMemoryHash: continuationReceipt.observationMemoryHash,
    priorObservationId: continuationReceipt.observationId,
    priorObserverKeyId: continuationReceipt.observerKeyId,
    priorObserverActorId: continuationReceipt.observerActorId,
    continuationAuthorizationHash: continuationReceipt.continuationAuthorizationHash,
    continuationAuthorizationPolicyHash: continuationReceipt.continuationAuthorizationPolicyHash,
    continuationAuthorizationMemoryHash: continuationReceipt.continuationAuthorizationMemoryHash,
    continuationAuthorizationId: continuationReceipt.continuationAuthorizationId,
    continuationAuthorizerKeyId: continuationReceipt.continuationAuthorizerKeyId,
    continuationAuthorizerActorId: continuationReceipt.continuationAuthorizerActorId,
    continuationReceiptHash: continuationReceipt.continuationReceiptHash,
    continuationPolicyHash: continuationReceipt.continuationPolicyHash,
    continuationMemoryHash: continuationMemory.memoryHash,
    continuationId: continuationReceipt.continuationId,
    externalExecutorKeyId: continuationReceipt.externalExecutorKeyId,
    externalExecutorActorId: continuationReceipt.externalExecutorActorId,
    observationPolicyHash: observationPolicy.policyHash,
    observationMemoryHashBefore,
    observationId,
    observationKind,
    observerKeyId: observer.keyId,
    observerActorId: observer.actorId,
    observerRole: observer.role,
    continuationVerified: true,
    controlledProofExecutionStarted: true,
    controlledProofExecutionObserved: true,
    controlledProofExecutionContinuationAuthorized: true,
    controlledProofExecutionContinued: true,
    controlledProofExecutionContinuationObserved: true,
    continuedAt: continuationReceipt.continuedAt,
    observedAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("controlled_proof_execution_continuation_observation_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) {
    throw new Error("private_key_does_not_match_controlled_proof_execution_continuation_observer");
  }
  return signature;
}

export function observeControlledProofExecutionContinuation({
  controlledProofExecutionContinuationReceipt: continuationReceipt,
  controlledProofExecutionContinuationMemory: continuationMemory,
  controlledProofExecutionContinuationObservationPolicy: observationPolicy,
  controlledProofExecutionContinuationObservationMemory: observationMemory,
  observationId,
  observationKind = CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_KIND,
  observerKeyId,
  observerPrivateKey,
  observedAt,
  nonce,
  ...upstream
}) {
  const context = {
    ...upstream,
    controlledProofExecutionContinuationMemory: continuationMemory,
    controlledProofExecutionContinuationObservationPolicy: observationPolicy,
    controlledProofExecutionContinuationObservationMemory: observationMemory,
  };
  verifyContext(context);
  const continuationInspection = inspectControlledProofExecutionContinuationReceipt(continuationReceipt, {
    ...upstream,
    controlledProofExecutionContinuationMemory: continuationMemory,
  });
  if (!continuationInspection.ok) throw new Error(`controlled_proof_execution_continuation_receipt_invalid:${continuationInspection.reason}`);
  assertSlug(observationId, "controlled_proof_execution_continuation_observation_id");
  assertSlug(observationKind, "controlled_proof_execution_continuation_observation_kind");
  assertSlug(observerKeyId, "controlled_proof_execution_continuation_observer_key_id");
  assertSlug(nonce, "controlled_proof_execution_continuation_observation_nonce");
  if (!observationPolicy.allowedObservationKinds.includes(observationKind)) throw new Error("controlled_proof_execution_continuation_observation_kind_not_allowed");
  if (observationMemory.entries.some((entry) => entry.continuationReceiptHash === continuationReceipt.continuationReceiptHash)) throw new Error("controlled_proof_execution_continuation_already_observed");
  if (observationMemory.entries.some((entry) => entry.observationId === observationId)) throw new Error("controlled_proof_execution_continuation_observation_duplicate_id");
  if (observationMemory.entries.some((entry) => entry.nonce === nonce)) throw new Error("controlled_proof_execution_continuation_observation_duplicate_nonce");
  const observer = observationPolicy.trustedContinuationObservers.find((item) => item.keyId === observerKeyId);
  if (!observer) throw new Error("controlled_proof_execution_continuation_observer_untrusted");
  validateObservationWindow(continuationReceipt, observer, observedAt, observationPolicy.maximumContinuationObservationDelaySeconds);
  const observationMemoryHashBefore = observationMemory.memoryHash;
  const payload = signingPayload({
    continuationReceipt,
    continuationMemory,
    observationPolicy,
    observationMemoryHashBefore,
    observationId,
    observationKind,
    observer,
    observedAt,
    nonce,
  });
  const signature = signPayload(payload, observerPrivateKey, observer.publicKeyPem);
  const unsigned = {
    schema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_RECEIPT_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_SIGNATURE_ALGORITHM,
    observationRecorded: true,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const observationReceipt = { ...unsigned, observationReceiptHash: digest(unsigned) };
  const entryPayload = {
    schema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_MEMORY_ENTRY_SCHEMA,
    sequence: observationMemory.entries.length + 1,
    previousEntryHash: observationMemory.entries.at(-1)?.entryHash ?? null,
    observationReceiptHash: observationReceipt.observationReceiptHash,
    observationPolicyHash: observationPolicy.policyHash,
    observationMemoryHashBefore,
    continuationReceiptHash: continuationReceipt.continuationReceiptHash,
    continuationPolicyHash: continuationReceipt.continuationPolicyHash,
    continuationMemoryHash: continuationMemory.memoryHash,
    continuationAuthorizationHash: continuationReceipt.continuationAuthorizationHash,
    continuationAuthorizationPolicyHash: continuationReceipt.continuationAuthorizationPolicyHash,
    continuationAuthorizationMemoryHash: continuationReceipt.continuationAuthorizationMemoryHash,
    priorObservationReceiptHash: continuationReceipt.observationReceiptHash,
    priorObservationPolicyHash: continuationReceipt.observationPolicyHash,
    priorObservationMemoryHash: continuationReceipt.observationMemoryHash,
    executionStartReceiptHash: continuationReceipt.executionStartReceiptHash,
    executionStartPolicyHash: continuationReceipt.executionStartPolicyHash,
    executionStartMemoryHash: continuationReceipt.executionStartMemoryHash,
    packageSha256: continuationReceipt.packageSha256,
    inventoryHash: continuationReceipt.inventoryHash,
    observationId,
    observationKind,
    continuationId: continuationReceipt.continuationId,
    continuationAuthorizationId: continuationReceipt.continuationAuthorizationId,
    priorObservationId: continuationReceipt.observationId,
    executionStartId: continuationReceipt.executionStartId,
    externalExecutorActorId: continuationReceipt.externalExecutorActorId,
    priorObserverActorId: continuationReceipt.observerActorId,
    continuationAuthorizerActorId: continuationReceipt.continuationAuthorizerActorId,
    observerActorId: observer.actorId,
    continuationVerified: true,
    controlledProofExecutionStarted: true,
    controlledProofExecutionObserved: true,
    controlledProofExecutionContinuationAuthorized: true,
    controlledProofExecutionContinued: true,
    controlledProofExecutionContinuationObserved: true,
    continuedAt: continuationReceipt.continuedAt,
    observedAt,
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
    observationReceipt,
    controlledProofExecutionContinuationObservationMemory: createControlledProofExecutionContinuationObservationMemory({
      policy: observationPolicy,
      entries: [...observationMemory.entries, entry],
    }),
  };
}

export function inspectControlledProofExecutionContinuationObservationReceipt(receipt, {
  controlledProofExecutionContinuationReceipt: continuationReceipt,
  controlledProofExecutionContinuationMemory: continuationMemory,
  controlledProofExecutionContinuationObservationPolicy: observationPolicy,
  controlledProofExecutionContinuationObservationMemory: observationMemory,
  ...upstream
}) {
  try {
    if (receipt?.schema !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_RECEIPT_SCHEMA) throw new Error("controlled_proof_execution_continuation_observation_receipt_schema_invalid");
    const context = {
      ...upstream,
      controlledProofExecutionContinuationMemory: continuationMemory,
      controlledProofExecutionContinuationObservationPolicy: observationPolicy,
      controlledProofExecutionContinuationObservationMemory: observationMemory,
    };
    verifyContext(context);
    const continuationInspection = inspectControlledProofExecutionContinuationReceipt(continuationReceipt, {
      ...upstream,
      controlledProofExecutionContinuationMemory: continuationMemory,
    });
    if (!continuationInspection.ok) throw new Error(`controlled_proof_execution_continuation_receipt_invalid:${continuationInspection.reason}`);
    const entryIndex = observationMemory.entries.findIndex((entry) => entry.observationReceiptHash === receipt.observationReceiptHash);
    if (entryIndex < 0) throw new Error("controlled_proof_execution_continuation_observation_not_recorded");
    const observer = observationPolicy.trustedContinuationObservers.find((item) => item.keyId === receipt.observerKeyId);
    if (!observer) throw new Error("controlled_proof_execution_continuation_observer_untrusted");
    validateObservationWindow(continuationReceipt, observer, receipt.observedAt, observationPolicy.maximumContinuationObservationDelaySeconds);
    const observationMemoryHashBefore = memoryHashForEntries(observationPolicy, observationMemory.entries.slice(0, entryIndex));
    const payload = signingPayload({
      continuationReceipt,
      continuationMemory,
      observationPolicy,
      observationMemoryHashBefore,
      observationId: receipt.observationId,
      observationKind: receipt.observationKind,
      observer,
      observedAt: receipt.observedAt,
      nonce: receipt.nonce,
    });
    for (const [key, expected] of Object.entries(payload)) {
      if (JSON.stringify(receipt[key]) !== JSON.stringify(expected)) throw new Error(`controlled_proof_execution_continuation_observation_${key}_mismatch`);
    }
    if (receipt.signatureAlgorithm !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_SIGNATURE_ALGORITHM || typeof receipt.signature !== "string") {
      throw new Error("controlled_proof_execution_continuation_observation_signature_invalid");
    }
    if (!cryptoVerify(null, bytes(payload), observer.publicKeyPem, Buffer.from(receipt.signature, "base64url"))) {
      throw new Error("controlled_proof_execution_continuation_observation_signature_verification_failed");
    }
    if (
      receipt.continuationVerified !== true || receipt.controlledProofExecutionStarted !== true ||
      receipt.controlledProofExecutionObserved !== true || receipt.controlledProofExecutionContinuationAuthorized !== true ||
      receipt.controlledProofExecutionContinued !== true || receipt.controlledProofExecutionContinuationObserved !== true ||
      receipt.observationRecorded !== true
    ) throw new Error("controlled_proof_execution_continuation_observation_receipt_contract_invalid");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (receipt[key] !== false) throw new Error(`controlled_proof_execution_continuation_observation_${key}_must_be_false`);
    }
    const hashPayload = { ...receipt };
    delete hashPayload.observationReceiptHash;
    if (digest(hashPayload) !== receipt.observationReceiptHash) throw new Error("controlled_proof_execution_continuation_observation_receipt_hash_mismatch");
    const entry = observationMemory.entries[entryIndex];
    if (
      entry.continuationReceiptHash !== continuationReceipt.continuationReceiptHash ||
      entry.continuationMemoryHash !== continuationMemory.memoryHash ||
      entry.observationMemoryHashBefore !== observationMemoryHashBefore ||
      entry.observerActorId !== observer.actorId
    ) throw new Error("controlled_proof_execution_continuation_observation_memory_entry_mismatch");
    return {
      ok: true,
      observationReceiptHash: receipt.observationReceiptHash,
      continuationReceiptHash: receipt.continuationReceiptHash,
      observationKind: receipt.observationKind,
      continuationVerified: true,
      controlledProofExecutionContinued: true,
      controlledProofExecutionContinuationObserved: true,
      publicationExecuted: false,
      externalPublicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_continuation_observation_receipt_invalid" };
  }
}
