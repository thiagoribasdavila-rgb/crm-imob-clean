import {
  createHash,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import {
  CONTROLLED_PROOF_EXECUTION_START_RECEIPT_SCHEMA,
  inspectControlledProofExecutionStartMemory,
  inspectControlledProofExecutionStartPolicy,
  inspectControlledProofExecutionStartReceipt,
} from "./controlled-proof-execution-start.mjs";

export const CONTROLLED_PROOF_EXECUTION_OBSERVATION_POLICY_SCHEMA = "atlas.controlled-proof-execution-observation-policy.v1";
export const CONTROLLED_PROOF_EXECUTION_OBSERVATION_RECEIPT_SCHEMA = "atlas.controlled-proof-execution-observation-receipt.v1";
export const CONTROLLED_PROOF_EXECUTION_OBSERVATION_MEMORY_SCHEMA = "atlas.controlled-proof-execution-observation-memory.v1";
export const CONTROLLED_PROOF_EXECUTION_OBSERVATION_MEMORY_ENTRY_SCHEMA = "atlas.controlled-proof-execution-observation-memory-entry.v1";
export const CONTROLLED_PROOF_EXECUTION_OBSERVATION_SIGNATURE_ALGORITHM = "ed25519";
export const CONTROLLED_PROOF_EXECUTION_OBSERVATION_KIND = "execution-start-confirmed";

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

function startPolicyContext(args) {
  return {
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

function verifyStartPolicy(policy, args) {
  const inspection = inspectControlledProofExecutionStartPolicy(policy, startPolicyContext(args));
  if (!inspection.ok) throw new Error(`controlled_proof_execution_start_policy_invalid:${inspection.reason}`);
}

function normalizeObserver(observer) {
  if (!observer || typeof observer !== "object") throw new Error("controlled_proof_execution_observer_invalid");
  for (const field of ["keyId", "actorId", "role"]) assertSlug(observer[field], `controlled_proof_execution_observer_${field}`);
  if (observer.role !== "proof-observer") throw new Error("controlled_proof_execution_observer_role_invalid");
  if (!new Set(["active", "inactive"]).has(observer.status)) throw new Error("controlled_proof_execution_observer_status_invalid");
  assertIso(observer.validFrom, "controlled_proof_execution_observer_valid_from");
  assertIso(observer.validUntil, "controlled_proof_execution_observer_valid_until");
  if (Date.parse(observer.validUntil) <= Date.parse(observer.validFrom)) throw new Error("controlled_proof_execution_observer_validity_invalid");
  if (typeof observer.publicKeyPem !== "string" || !observer.publicKeyPem.includes("BEGIN PUBLIC KEY")) throw new Error("controlled_proof_execution_observer_public_key_invalid");
  try {
    if (createPublicKey(observer.publicKeyPem).asymmetricKeyType !== "ed25519") throw new Error();
  } catch {
    throw new Error("controlled_proof_execution_observer_public_key_invalid");
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

export function createControlledProofExecutionObservationPolicy({
  controlledProofExecutionStartPolicy: startPolicy,
  trustedProofObservers = [],
  maximumObservationDelaySeconds = 300,
  ...upstream
}) {
  verifyStartPolicy(startPolicy, upstream);
  if (!Array.isArray(trustedProofObservers)) throw new Error("trusted_proof_observers_invalid");
  const observers = trustedProofObservers.map(normalizeObserver);
  if (new Set(observers.map((item) => item.keyId)).size !== observers.length) throw new Error("trusted_proof_observer_key_id_duplicate");
  if (new Set(observers.map((item) => item.actorId)).size !== observers.length) throw new Error("trusted_proof_observer_actor_id_duplicate");
  if (!Number.isInteger(maximumObservationDelaySeconds) || maximumObservationDelaySeconds < 1 || maximumObservationDelaySeconds > 3600) {
    throw new Error("maximum_observation_delay_seconds_invalid");
  }
  const payload = {
    schema: CONTROLLED_PROOF_EXECUTION_OBSERVATION_POLICY_SCHEMA,
    compositionId: startPolicy.compositionId,
    compositionDecisionHash: startPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: startPolicy.publicationDecisionPolicyHash,
    authorizationConsumptionPolicyHash: startPolicy.authorizationConsumptionPolicyHash,
    executionHandoffPolicyHash: startPolicy.executionHandoffPolicyHash,
    executionAcceptancePolicyHash: startPolicy.executionAcceptancePolicyHash,
    executionPermitGrantPolicyHash: startPolicy.executionPermitGrantPolicyHash,
    executionPermitConsumptionPolicyHash: startPolicy.executionPermitConsumptionPolicyHash,
    startAuthorizationPolicyHash: startPolicy.startAuthorizationPolicyHash,
    executionStartPolicyHash: startPolicy.policyHash,
    requiredExecutionStartReceiptSchema: CONTROLLED_PROOF_EXECUTION_START_RECEIPT_SCHEMA,
    requiredMemoryEntrySchema: CONTROLLED_PROOF_EXECUTION_OBSERVATION_MEMORY_ENTRY_SCHEMA,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_OBSERVATION_SIGNATURE_ALGORITHM,
    trustedProofObservers: observers,
    allowedObservationKinds: [CONTROLLED_PROOF_EXECUTION_OBSERVATION_KIND],
    maximumObservationDelaySeconds,
    recordedExecutionStartRequired: true,
    exactExecutionStartBindingRequired: true,
    exactExecutionStartMemoryBindingRequired: true,
    exactStartAuthorizationBindingRequired: true,
    exactTargetExecutorBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    executionStartSignatureVerificationRequired: true,
    observerIndependenceRequired: true,
    observerValidityAtObservationRequired: true,
    appendOnlyObservationMemoryRequired: true,
    duplicateExecutionStartRejected: true,
    atomicMemoryHeadBindingRequired: true,
    signedObservationRequired: true,
    singleObservationPerExecutionStartRequired: true,
    maximumObservationsPerExecutionStart: 1,
    controlledProofExecutionObservationAllowed: true,
    controlledProofExecutionContinuationAllowed: false,
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

export function inspectControlledProofExecutionObservationPolicy(policy, context) {
  try {
    const recreated = createControlledProofExecutionObservationPolicy(context);
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "controlled_proof_execution_observation_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "controlled_proof_execution_observation_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedProofObservers: recreated.trustedProofObservers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_observation_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_PROOF_EXECUTION_OBSERVATION_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedExecutionObservations: entries.length,
      observedExecutionStarts: new Set(entries.map((entry) => entry.executionStartReceiptHash)).size,
      distinctObservations: new Set(entries.map((entry) => entry.observationReceiptHash)).size,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      controlledProofExecutionStarted: entries.length > 0,
      controlledProofExecutionObserved: entries.length > 0,
      controlledProofExecutionContinued: false,
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

export function createControlledProofExecutionObservationMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_PROOF_EXECUTION_OBSERVATION_POLICY_SCHEMA) throw new Error("controlled_proof_execution_observation_memory_policy_invalid");
  assertHash(policy.policyHash, "controlled_proof_execution_observation_memory_policy_hash");
  if (!Array.isArray(entries)) throw new Error("controlled_proof_execution_observation_memory_entries_invalid");
  let previousEntryHash = null;
  const startHashes = new Set();
  const observationIds = new Set();
  const nonces = new Set();
  const normalized = [];
  for (const [index, entry] of entries.entries()) {
    if (entry?.schema !== CONTROLLED_PROOF_EXECUTION_OBSERVATION_MEMORY_ENTRY_SCHEMA) throw new Error("controlled_proof_execution_observation_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("controlled_proof_execution_observation_memory_chain_invalid");
    for (const field of [
      "observationReceiptHash", "observationPolicyHash", "observationMemoryHashBefore", "executionStartReceiptHash",
      "executionStartPolicyHash", "executionStartMemoryHash", "startAuthorizationHash", "permitHash", "packageSha256", "inventoryHash",
    ]) assertHash(entry[field], `controlled_proof_execution_observation_memory_${field}`);
    for (const field of [
      "observationId", "observationKind", "executionStartId", "startAuthorizationId", "permitId", "externalExecutorActorId",
      "observerActorId", "nonce",
    ]) assertSlug(entry[field], `controlled_proof_execution_observation_memory_${field}`);
    for (const [field, value] of [["started_at", entry.startedAt], ["observed_at", entry.observedAt]]) {
      assertIso(value, `controlled_proof_execution_observation_memory_${field}`);
    }
    if (entry.observationPolicyHash !== policy.policyHash) throw new Error("controlled_proof_execution_observation_memory_policy_binding_mismatch");
    if (entry.observationMemoryHashBefore !== memoryHashForEntries(policy, normalized)) throw new Error("controlled_proof_execution_observation_memory_head_binding_mismatch");
    if (!policy.allowedObservationKinds.includes(entry.observationKind)) throw new Error("controlled_proof_execution_observation_kind_not_allowed");
    if (startHashes.has(entry.executionStartReceiptHash)) throw new Error("controlled_proof_execution_start_already_observed");
    if (observationIds.has(entry.observationId)) throw new Error("controlled_proof_execution_observation_duplicate_id");
    if (nonces.has(entry.nonce)) throw new Error("controlled_proof_execution_observation_duplicate_nonce");
    if (entry.executionStartVerified !== true || entry.controlledProofExecutionStarted !== true || entry.controlledProofExecutionObserved !== true) {
      throw new Error("controlled_proof_execution_observation_memory_contract_invalid");
    }
    for (const key of [
      "controlledProofExecutionContinued", "publicationExecuted", "externalPublicationExecuted", "packageGenerated",
      "buildExecuted", "deployExecuted", "releasePromoted",
    ]) if (entry[key] !== false) throw new Error(`controlled_proof_execution_observation_memory_${key}_must_be_false`);
    const entryPayload = { ...entry };
    delete entryPayload.entryHash;
    if (digest(entryPayload) !== entry.entryHash) throw new Error("controlled_proof_execution_observation_memory_entry_hash_mismatch");
    normalized.push({ ...entry });
    startHashes.add(entry.executionStartReceiptHash);
    observationIds.add(entry.observationId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledProofExecutionObservationMemory(memory, { policy }) {
  try {
    const recreated = createControlledProofExecutionObservationMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "controlled_proof_execution_observation_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "controlled_proof_execution_observation_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, ...recreated.summary };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_observation_memory_invalid" };
  }
}

function observationPolicyContext(args) {
  return {
    controlledProofExecutionStartPolicy: args.controlledProofExecutionStartPolicy,
    trustedProofObservers: args.trustedProofObservers,
    maximumObservationDelaySeconds: args.maximumObservationDelaySeconds,
    ...startPolicyContext(args),
  };
}

function verifyContext(args) {
  const policyInspection = inspectControlledProofExecutionObservationPolicy(
    args.controlledProofExecutionObservationPolicy,
    observationPolicyContext(args),
  );
  if (!policyInspection.ok) throw new Error(`controlled_proof_execution_observation_policy_invalid:${policyInspection.reason}`);
  const observationMemoryInspection = inspectControlledProofExecutionObservationMemory(
    args.controlledProofExecutionObservationMemory,
    { policy: args.controlledProofExecutionObservationPolicy },
  );
  if (!observationMemoryInspection.ok) throw new Error(`controlled_proof_execution_observation_memory_invalid:${observationMemoryInspection.reason}`);
  const startMemoryInspection = inspectControlledProofExecutionStartMemory(
    args.controlledProofExecutionStartMemory,
    { policy: args.controlledProofExecutionStartPolicy },
  );
  if (!startMemoryInspection.ok) throw new Error(`controlled_proof_execution_start_memory_invalid:${startMemoryInspection.reason}`);
}

function validateObservationWindow(startReceipt, observer, observedAt, maximumDelaySeconds) {
  assertIso(observedAt, "controlled_proof_execution_observed_at");
  const observed = Date.parse(observedAt);
  const started = Date.parse(startReceipt.startedAt);
  if (observed < started) throw new Error("controlled_proof_execution_observation_before_start");
  if (observed > started + (maximumDelaySeconds * 1000)) throw new Error("controlled_proof_execution_observation_window_expired");
  if (observer.status !== "active") throw new Error("controlled_proof_execution_observer_inactive");
  if (observed < Date.parse(observer.validFrom) || observed > Date.parse(observer.validUntil)) throw new Error("controlled_proof_execution_observer_key_outside_validity");
  if (observer.actorId === startReceipt.externalExecutorActorId || observer.keyId === startReceipt.externalExecutorKeyId) {
    throw new Error("controlled_proof_execution_observer_not_independent");
  }
}

function signingPayload({ startReceipt, startMemory, observationPolicy, observationMemoryHashBefore, observationId, observationKind, observer, observedAt, nonce }) {
  if (!startMemory.entries.some((entry) => entry.executionStartReceiptHash === startReceipt.executionStartReceiptHash && entry.controlledProofExecutionStarted === true)) {
    throw new Error("controlled_proof_execution_start_not_recorded");
  }
  return {
    signingSchema: "atlas.controlled-proof-execution-observation-signing-payload.v1",
    compositionId: startReceipt.compositionId,
    compositionDecisionHash: startReceipt.compositionDecisionHash,
    publicationDecisionHash: startReceipt.publicationDecisionHash,
    evidenceDecisionHash: startReceipt.evidenceDecisionHash,
    packageSha256: startReceipt.packageSha256,
    inventoryHash: startReceipt.inventoryHash,
    permitHash: startReceipt.permitHash,
    permitId: startReceipt.permitId,
    startAuthorizationHash: startReceipt.startAuthorizationHash,
    startAuthorizationId: startReceipt.startAuthorizationId,
    executionStartReceiptHash: startReceipt.executionStartReceiptHash,
    executionStartPolicyHash: startReceipt.executionStartPolicyHash,
    executionStartMemoryHash: startMemory.memoryHash,
    executionStartId: startReceipt.executionStartId,
    externalExecutorKeyId: startReceipt.externalExecutorKeyId,
    externalExecutorActorId: startReceipt.externalExecutorActorId,
    observationPolicyHash: observationPolicy.policyHash,
    observationMemoryHashBefore,
    observationId,
    observationKind,
    observerKeyId: observer.keyId,
    observerActorId: observer.actorId,
    observerRole: observer.role,
    executionStartVerified: true,
    controlledProofExecutionStarted: true,
    controlledProofExecutionObserved: true,
    startedAt: startReceipt.startedAt,
    observedAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("controlled_proof_execution_observation_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) {
    throw new Error("private_key_does_not_match_controlled_proof_execution_observer");
  }
  return signature;
}

export function observeControlledProofExecution({
  controlledProofExecutionStartReceipt: startReceipt,
  controlledProofExecutionStartMemory: startMemory,
  controlledProofExecutionObservationPolicy: observationPolicy,
  controlledProofExecutionObservationMemory: observationMemory,
  observationId,
  observationKind = CONTROLLED_PROOF_EXECUTION_OBSERVATION_KIND,
  observerKeyId,
  observerPrivateKey,
  observedAt,
  nonce,
  ...upstream
}) {
  const context = {
    ...upstream,
    controlledProofExecutionStartMemory: startMemory,
    controlledProofExecutionObservationPolicy: observationPolicy,
    controlledProofExecutionObservationMemory: observationMemory,
  };
  verifyContext(context);
  const startInspection = inspectControlledProofExecutionStartReceipt(startReceipt, {
    ...upstream,
    controlledProofExecutionStartMemory: startMemory,
  });
  if (!startInspection.ok) throw new Error(`controlled_proof_execution_start_receipt_invalid:${startInspection.reason}`);
  assertSlug(observationId, "controlled_proof_execution_observation_id");
  assertSlug(observationKind, "controlled_proof_execution_observation_kind");
  assertSlug(observerKeyId, "controlled_proof_execution_observer_key_id");
  assertSlug(nonce, "controlled_proof_execution_observation_nonce");
  if (!observationPolicy.allowedObservationKinds.includes(observationKind)) throw new Error("controlled_proof_execution_observation_kind_not_allowed");
  if (observationMemory.entries.some((entry) => entry.executionStartReceiptHash === startReceipt.executionStartReceiptHash)) throw new Error("controlled_proof_execution_start_already_observed");
  if (observationMemory.entries.some((entry) => entry.observationId === observationId)) throw new Error("controlled_proof_execution_observation_duplicate_id");
  if (observationMemory.entries.some((entry) => entry.nonce === nonce)) throw new Error("controlled_proof_execution_observation_duplicate_nonce");
  const observer = observationPolicy.trustedProofObservers.find((item) => item.keyId === observerKeyId);
  if (!observer) throw new Error("controlled_proof_execution_observer_untrusted");
  validateObservationWindow(startReceipt, observer, observedAt, observationPolicy.maximumObservationDelaySeconds);
  const observationMemoryHashBefore = observationMemory.memoryHash;
  const payload = signingPayload({
    startReceipt,
    startMemory,
    observationPolicy,
    observationMemoryHashBefore,
    observationId,
    observationKind,
    observer,
    observedAt,
    nonce,
  });
  const signature = signPayload(payload, observerPrivateKey, observer.publicKeyPem);
  const receiptValue = {
    schema: CONTROLLED_PROOF_EXECUTION_OBSERVATION_RECEIPT_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_OBSERVATION_SIGNATURE_ALGORITHM,
    observationRecorded: true,
    controlledProofExecutionContinued: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const observationReceipt = { ...receiptValue, observationReceiptHash: digest(receiptValue) };
  const entryPayload = {
    schema: CONTROLLED_PROOF_EXECUTION_OBSERVATION_MEMORY_ENTRY_SCHEMA,
    sequence: observationMemory.entries.length + 1,
    previousEntryHash: observationMemory.entries.at(-1)?.entryHash ?? null,
    observationReceiptHash: observationReceipt.observationReceiptHash,
    observationPolicyHash: observationPolicy.policyHash,
    observationMemoryHashBefore,
    executionStartReceiptHash: startReceipt.executionStartReceiptHash,
    executionStartPolicyHash: startReceipt.executionStartPolicyHash,
    executionStartMemoryHash: startMemory.memoryHash,
    startAuthorizationHash: startReceipt.startAuthorizationHash,
    permitHash: startReceipt.permitHash,
    packageSha256: startReceipt.packageSha256,
    inventoryHash: startReceipt.inventoryHash,
    observationId,
    observationKind,
    executionStartId: startReceipt.executionStartId,
    startAuthorizationId: startReceipt.startAuthorizationId,
    permitId: startReceipt.permitId,
    externalExecutorActorId: startReceipt.externalExecutorActorId,
    observerActorId: observer.actorId,
    executionStartVerified: true,
    controlledProofExecutionStarted: true,
    controlledProofExecutionObserved: true,
    controlledProofExecutionContinued: false,
    startedAt: startReceipt.startedAt,
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
    controlledProofExecutionObservationMemory: createControlledProofExecutionObservationMemory({
      policy: observationPolicy,
      entries: [...observationMemory.entries, entry],
    }),
  };
}

export function inspectControlledProofExecutionObservationReceipt(receipt, {
  controlledProofExecutionStartReceipt: startReceipt,
  controlledProofExecutionStartMemory: startMemory,
  controlledProofExecutionObservationPolicy: observationPolicy,
  controlledProofExecutionObservationMemory: observationMemory,
  ...upstream
}) {
  try {
    if (receipt?.schema !== CONTROLLED_PROOF_EXECUTION_OBSERVATION_RECEIPT_SCHEMA) throw new Error("controlled_proof_execution_observation_receipt_schema_invalid");
    const context = {
      ...upstream,
      controlledProofExecutionStartMemory: startMemory,
      controlledProofExecutionObservationPolicy: observationPolicy,
      controlledProofExecutionObservationMemory: observationMemory,
    };
    verifyContext(context);
    const startInspection = inspectControlledProofExecutionStartReceipt(startReceipt, {
      ...upstream,
      controlledProofExecutionStartMemory: startMemory,
    });
    if (!startInspection.ok) throw new Error(`controlled_proof_execution_start_receipt_invalid:${startInspection.reason}`);
    const entryIndex = observationMemory.entries.findIndex((entry) => entry.observationReceiptHash === receipt.observationReceiptHash);
    if (entryIndex < 0) throw new Error("controlled_proof_execution_observation_not_recorded");
    const observer = observationPolicy.trustedProofObservers.find((item) => item.keyId === receipt.observerKeyId);
    if (!observer) throw new Error("controlled_proof_execution_observer_untrusted");
    validateObservationWindow(startReceipt, observer, receipt.observedAt, observationPolicy.maximumObservationDelaySeconds);
    const observationMemoryHashBefore = memoryHashForEntries(observationPolicy, observationMemory.entries.slice(0, entryIndex));
    const payload = signingPayload({
      startReceipt,
      startMemory,
      observationPolicy,
      observationMemoryHashBefore,
      observationId: receipt.observationId,
      observationKind: receipt.observationKind,
      observer,
      observedAt: receipt.observedAt,
      nonce: receipt.nonce,
    });
    for (const [key, expected] of Object.entries(payload)) {
      if (JSON.stringify(receipt[key]) !== JSON.stringify(expected)) throw new Error(`controlled_proof_execution_observation_${key}_mismatch`);
    }
    if (receipt.signatureAlgorithm !== CONTROLLED_PROOF_EXECUTION_OBSERVATION_SIGNATURE_ALGORITHM || typeof receipt.signature !== "string") {
      throw new Error("controlled_proof_execution_observation_signature_invalid");
    }
    if (!cryptoVerify(null, bytes(payload), observer.publicKeyPem, Buffer.from(receipt.signature, "base64url"))) {
      throw new Error("controlled_proof_execution_observation_signature_verification_failed");
    }
    if (
      receipt.executionStartVerified !== true || receipt.controlledProofExecutionStarted !== true ||
      receipt.controlledProofExecutionObserved !== true || receipt.observationRecorded !== true
    ) throw new Error("controlled_proof_execution_observation_receipt_contract_invalid");
    for (const key of [
      "controlledProofExecutionContinued", "publicationExecuted", "externalPublicationExecuted", "packageGenerated",
      "buildExecuted", "deployExecuted", "releasePromoted",
    ]) if (receipt[key] !== false) throw new Error(`controlled_proof_execution_observation_${key}_must_be_false`);
    const hashPayload = { ...receipt };
    delete hashPayload.observationReceiptHash;
    if (digest(hashPayload) !== receipt.observationReceiptHash) throw new Error("controlled_proof_execution_observation_receipt_hash_mismatch");
    const entry = observationMemory.entries[entryIndex];
    if (
      entry.executionStartReceiptHash !== startReceipt.executionStartReceiptHash ||
      entry.observationMemoryHashBefore !== observationMemoryHashBefore ||
      entry.observerActorId !== observer.actorId
    ) throw new Error("controlled_proof_execution_observation_memory_entry_mismatch");
    return {
      ok: true,
      observationReceiptHash: receipt.observationReceiptHash,
      executionStartReceiptHash: receipt.executionStartReceiptHash,
      observationKind: receipt.observationKind,
      executionStartVerified: true,
      controlledProofExecutionStarted: true,
      controlledProofExecutionObserved: true,
      controlledProofExecutionContinued: false,
      publicationExecuted: false,
      externalPublicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_observation_receipt_invalid" };
  }
}
