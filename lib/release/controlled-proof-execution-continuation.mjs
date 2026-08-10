import { createHash, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_SCHEMA,
  inspectControlledProofExecutionContinuationAuthorization,
  inspectControlledProofExecutionContinuationAuthorizationMemory,
  inspectControlledProofExecutionContinuationAuthorizationPolicy,
} from "./controlled-proof-execution-continuation-authorization.mjs";
import {
  inspectControlledProofExecutionStartPolicy,
} from "./controlled-proof-execution-start.mjs";

export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_POLICY_SCHEMA = "atlas.controlled-proof-execution-continuation-policy.v1";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_RECEIPT_SCHEMA = "atlas.controlled-proof-execution-continuation-receipt.v1";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_MEMORY_SCHEMA = "atlas.controlled-proof-execution-continuation-memory.v1";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_MEMORY_ENTRY_SCHEMA = "atlas.controlled-proof-execution-continuation-memory-entry.v1";
export const CONTROLLED_PROOF_EXECUTION_CONTINUATION_SIGNATURE_ALGORITHM = "ed25519";

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

function authorizationUpstreamContext(args) {
  return {
    controlledProofExecutionObservationPolicy: args.controlledProofExecutionObservationPolicy,
    trustedContinuationAuthorizers: args.trustedContinuationAuthorizers,
    maximumAuthorizationDelaySeconds: args.maximumAuthorizationDelaySeconds,
    maximumAuthorizationTtlSeconds: args.maximumAuthorizationTtlSeconds,
    controlledProofExecutionStartPolicy: args.controlledProofExecutionStartPolicy,
    trustedProofObservers: args.trustedProofObservers,
    maximumObservationDelaySeconds: args.maximumObservationDelaySeconds,
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

export function createControlledProofExecutionContinuationPolicy({
  controlledProofExecutionContinuationAuthorizationPolicy: authorizationPolicy,
  controlledProofExecutionStartPolicy: startPolicy,
  ...upstream
}) {
  const authorizationInspection = inspectControlledProofExecutionContinuationAuthorizationPolicy(
    authorizationPolicy,
    authorizationUpstreamContext({ ...upstream, controlledProofExecutionStartPolicy: startPolicy }),
  );
  if (!authorizationInspection.ok) throw new Error(`controlled_proof_execution_continuation_authorization_policy_invalid:${authorizationInspection.reason}`);
  const startInspection = inspectControlledProofExecutionStartPolicy(startPolicy, startPolicyContext(upstream));
  if (!startInspection.ok) throw new Error(`controlled_proof_execution_start_policy_invalid:${startInspection.reason}`);
  if (authorizationPolicy.executionStartPolicyHash !== startPolicy.policyHash) throw new Error("controlled_proof_execution_continuation_start_policy_binding_mismatch");
  const payload = {
    schema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_POLICY_SCHEMA,
    compositionId: authorizationPolicy.compositionId,
    compositionDecisionHash: authorizationPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: authorizationPolicy.publicationDecisionPolicyHash,
    executionStartPolicyHash: startPolicy.policyHash,
    observationPolicyHash: authorizationPolicy.observationPolicyHash,
    continuationAuthorizationPolicyHash: authorizationPolicy.policyHash,
    requiredContinuationAuthorizationSchema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_SCHEMA,
    requiredMemoryEntrySchema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_MEMORY_ENTRY_SCHEMA,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_CONTINUATION_SIGNATURE_ALGORITHM,
    trustedContinuationExecutors: startPolicy.trustedStartExecutors,
    recordedContinuationAuthorizationRequired: true,
    exactContinuationAuthorizationBindingRequired: true,
    exactContinuationAuthorizationMemoryBindingRequired: true,
    exactObservationBindingRequired: true,
    exactExecutionStartBindingRequired: true,
    exactTargetExecutorBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    continuationAuthorizationSignatureVerificationRequired: true,
    authorizationValidityAtContinuationRequired: true,
    appendOnlyContinuationMemoryRequired: true,
    duplicateContinuationAuthorizationRejected: true,
    atomicMemoryHeadBindingRequired: true,
    signedContinuationRequired: true,
    singleUseContinuationRequired: true,
    maximumContinuations: 1,
    controlledProofExecutionContinuationAllowed: true,
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

function continuationPolicyContext(args) {
  return {
    controlledProofExecutionContinuationAuthorizationPolicy: args.controlledProofExecutionContinuationAuthorizationPolicy,
    controlledProofExecutionStartPolicy: args.controlledProofExecutionStartPolicy,
    ...authorizationUpstreamContext(args),
  };
}

export function inspectControlledProofExecutionContinuationPolicy(policy, context) {
  try {
    const recreated = createControlledProofExecutionContinuationPolicy(context);
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "controlled_proof_execution_continuation_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "controlled_proof_execution_continuation_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedContinuationExecutors: recreated.trustedContinuationExecutors.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_continuation_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedContinuations: entries.length,
      consumedContinuationAuthorizations: new Set(entries.map((entry) => entry.continuationAuthorizationHash)).size,
      distinctContinuations: new Set(entries.map((entry) => entry.continuationId)).size,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      controlledProofExecutionStarted: entries.length > 0,
      controlledProofExecutionObserved: entries.length > 0,
      controlledProofExecutionContinuationAuthorized: entries.length > 0,
      controlledProofExecutionContinued: entries.length > 0,
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

export function createControlledProofExecutionContinuationMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_POLICY_SCHEMA) throw new Error("controlled_proof_execution_continuation_memory_policy_invalid");
  assertHash(policy.policyHash, "controlled_proof_execution_continuation_memory_policy_hash");
  if (!Array.isArray(entries)) throw new Error("controlled_proof_execution_continuation_memory_entries_invalid");
  let previousEntryHash = null;
  const authorizationHashes = new Set();
  const continuationIds = new Set();
  const nonces = new Set();
  const normalized = [];
  for (const [index, entry] of entries.entries()) {
    if (entry?.schema !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_MEMORY_ENTRY_SCHEMA) throw new Error("controlled_proof_execution_continuation_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("controlled_proof_execution_continuation_memory_chain_invalid");
    for (const field of [
      "continuationReceiptHash", "continuationPolicyHash", "continuationMemoryHashBefore",
      "continuationAuthorizationHash", "continuationAuthorizationPolicyHash", "continuationAuthorizationMemoryHash",
      "observationReceiptHash", "observationPolicyHash", "observationMemoryHash", "executionStartReceiptHash",
      "executionStartPolicyHash", "executionStartMemoryHash", "packageSha256", "inventoryHash",
    ]) assertHash(entry[field], `controlled_proof_execution_continuation_memory_${field}`);
    for (const field of [
      "continuationId", "continuationAuthorizationId", "observationId", "executionStartId",
      "externalExecutorActorId", "observerActorId", "continuationAuthorizerActorId", "nonce",
    ]) assertSlug(entry[field], `controlled_proof_execution_continuation_memory_${field}`);
    assertIso(entry.authorizedAt, "controlled_proof_execution_continuation_memory_authorized_at");
    assertIso(entry.expiresAt, "controlled_proof_execution_continuation_memory_expires_at");
    assertIso(entry.continuedAt, "controlled_proof_execution_continuation_memory_continued_at");
    if (entry.continuationPolicyHash !== policy.policyHash) throw new Error("controlled_proof_execution_continuation_memory_policy_binding_mismatch");
    if (entry.continuationMemoryHashBefore !== memoryHashForEntries(policy, normalized)) throw new Error("controlled_proof_execution_continuation_memory_head_binding_mismatch");
    if (authorizationHashes.has(entry.continuationAuthorizationHash)) throw new Error("controlled_proof_execution_continuation_authorization_already_consumed");
    if (continuationIds.has(entry.continuationId)) throw new Error("controlled_proof_execution_continuation_duplicate_id");
    if (nonces.has(entry.nonce)) throw new Error("controlled_proof_execution_continuation_duplicate_nonce");
    if (
      entry.continuationAuthorizationVerified !== true || entry.continuationAuthorizationRecorded !== true ||
      entry.controlledProofExecutionStarted !== true || entry.controlledProofExecutionObserved !== true ||
      entry.controlledProofExecutionContinuationAuthorized !== true || entry.controlledProofExecutionContinued !== true ||
      entry.singleUse !== true || entry.maximumContinuations !== 1 || entry.remainingContinuations !== 0
    ) throw new Error("controlled_proof_execution_continuation_memory_contract_invalid");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`controlled_proof_execution_continuation_memory_${key}_must_be_false`);
    }
    const entryPayload = { ...entry };
    delete entryPayload.entryHash;
    if (digest(entryPayload) !== entry.entryHash) throw new Error("controlled_proof_execution_continuation_memory_entry_hash_mismatch");
    normalized.push({ ...entry });
    authorizationHashes.add(entry.continuationAuthorizationHash);
    continuationIds.add(entry.continuationId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledProofExecutionContinuationMemory(memory, { policy }) {
  try {
    const recreated = createControlledProofExecutionContinuationMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "controlled_proof_execution_continuation_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "controlled_proof_execution_continuation_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, ...recreated.summary };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_continuation_memory_invalid" };
  }
}

function verifyContext(args) {
  const policyInspection = inspectControlledProofExecutionContinuationPolicy(
    args.controlledProofExecutionContinuationPolicy,
    continuationPolicyContext(args),
  );
  if (!policyInspection.ok) throw new Error(`controlled_proof_execution_continuation_policy_invalid:${policyInspection.reason}`);
  const memoryInspection = inspectControlledProofExecutionContinuationMemory(
    args.controlledProofExecutionContinuationMemory,
    { policy: args.controlledProofExecutionContinuationPolicy },
  );
  if (!memoryInspection.ok) throw new Error(`controlled_proof_execution_continuation_memory_invalid:${memoryInspection.reason}`);
  const authorizationMemoryInspection = inspectControlledProofExecutionContinuationAuthorizationMemory(
    args.controlledProofExecutionContinuationAuthorizationMemory,
    { policy: args.controlledProofExecutionContinuationAuthorizationPolicy },
  );
  if (!authorizationMemoryInspection.ok) throw new Error(`controlled_proof_execution_continuation_authorization_memory_invalid:${authorizationMemoryInspection.reason}`);
}

function validateContinuationWindow(authorization, executor, continuedAt) {
  assertIso(continuedAt, "controlled_proof_execution_continued_at");
  const continued = Date.parse(continuedAt);
  if (continued < Date.parse(authorization.authorizedAt)) throw new Error("controlled_proof_execution_continuation_before_authorization");
  if (continued > Date.parse(authorization.expiresAt)) throw new Error("controlled_proof_execution_continuation_authorization_expired");
  if (executor.status !== "active") throw new Error("controlled_proof_execution_continuation_executor_inactive");
  if (continued < Date.parse(executor.validFrom) || continued > Date.parse(executor.validUntil)) throw new Error("controlled_proof_execution_continuation_executor_key_outside_validity");
}

function signingPayload({ authorization, authorizationMemory, policy, memoryHashBefore, continuationId, executor, continuedAt, nonce }) {
  if (!authorizationMemory.entries.some((entry) => entry.continuationAuthorizationHash === authorization.continuationAuthorizationHash && entry.remainingContinuations === 1)) {
    throw new Error("controlled_proof_execution_continuation_authorization_not_recorded");
  }
  return {
    signingSchema: "atlas.controlled-proof-execution-continuation-signing-payload.v1",
    compositionId: authorization.compositionId,
    compositionDecisionHash: authorization.compositionDecisionHash,
    publicationDecisionHash: authorization.publicationDecisionHash,
    evidenceDecisionHash: authorization.evidenceDecisionHash,
    packageSha256: authorization.packageSha256,
    inventoryHash: authorization.inventoryHash,
    executionStartReceiptHash: authorization.executionStartReceiptHash,
    executionStartPolicyHash: authorization.executionStartPolicyHash,
    executionStartMemoryHash: authorization.executionStartMemoryHash,
    executionStartId: authorization.executionStartId,
    observationReceiptHash: authorization.observationReceiptHash,
    observationPolicyHash: authorization.observationPolicyHash,
    observationMemoryHash: authorization.observationMemoryHash,
    observationId: authorization.observationId,
    observerKeyId: authorization.observerKeyId,
    observerActorId: authorization.observerActorId,
    continuationAuthorizationHash: authorization.continuationAuthorizationHash,
    continuationAuthorizationPolicyHash: authorization.continuationAuthorizationPolicyHash,
    continuationAuthorizationMemoryHash: authorizationMemory.memoryHash,
    continuationAuthorizationId: authorization.continuationAuthorizationId,
    continuationAuthorizerKeyId: authorization.continuationAuthorizerKeyId,
    continuationAuthorizerActorId: authorization.continuationAuthorizerActorId,
    continuationPolicyHash: policy.policyHash,
    continuationMemoryHashBefore: memoryHashBefore,
    continuationId,
    externalExecutorKeyId: executor.keyId,
    externalExecutorActorId: executor.actorId,
    continuationAuthorizationVerified: true,
    continuationAuthorizationRecorded: true,
    controlledProofExecutionStarted: true,
    controlledProofExecutionObserved: true,
    controlledProofExecutionContinuationAuthorized: true,
    controlledProofExecutionContinued: true,
    authorizedAt: authorization.authorizedAt,
    expiresAt: authorization.expiresAt,
    continuedAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("controlled_proof_execution_continuation_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) {
    throw new Error("private_key_does_not_match_controlled_proof_execution_continuation_executor");
  }
  return signature;
}

export function continueControlledProofExecution({
  controlledProofExecutionContinuationAuthorization: authorization,
  controlledProofExecutionContinuationAuthorizationMemory: authorizationMemory,
  controlledProofExecutionContinuationPolicy: policy,
  controlledProofExecutionContinuationMemory: memory,
  continuationId,
  externalExecutorKeyId,
  externalExecutorPrivateKey,
  continuedAt,
  nonce,
  ...upstream
}) {
  const context = {
    ...upstream,
    controlledProofExecutionContinuationAuthorizationMemory: authorizationMemory,
    controlledProofExecutionContinuationPolicy: policy,
    controlledProofExecutionContinuationMemory: memory,
  };
  verifyContext(context);
  if (authorization?.schema !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION_SCHEMA) throw new Error("controlled_proof_execution_continuation_authorization_schema_invalid");
  const authorizationInspection = inspectControlledProofExecutionContinuationAuthorization(authorization, {
    ...upstream,
    controlledProofExecutionContinuationAuthorizationMemory: authorizationMemory,
  });
  if (!authorizationInspection.ok) throw new Error(`controlled_proof_execution_continuation_authorization_invalid:${authorizationInspection.reason}`);
  assertSlug(continuationId, "controlled_proof_execution_continuation_id");
  assertSlug(externalExecutorKeyId, "controlled_proof_execution_continuation_executor_key_id");
  assertSlug(nonce, "controlled_proof_execution_continuation_nonce");
  if (authorization.remainingContinuations !== 1 || authorization.singleUse !== true) throw new Error("controlled_proof_execution_continuation_authorization_not_consumable");
  if (authorization.externalExecutorKeyId !== externalExecutorKeyId) throw new Error("controlled_proof_execution_continuation_executor_binding_mismatch");
  const executor = policy.trustedContinuationExecutors.find((item) => item.keyId === externalExecutorKeyId);
  if (!executor || executor.actorId !== authorization.externalExecutorActorId) throw new Error("controlled_proof_execution_continuation_executor_untrusted");
  validateContinuationWindow(authorization, executor, continuedAt);
  if (memory.entries.some((entry) => entry.continuationAuthorizationHash === authorization.continuationAuthorizationHash)) throw new Error("controlled_proof_execution_continuation_authorization_already_consumed");
  if (memory.entries.some((entry) => entry.continuationId === continuationId)) throw new Error("controlled_proof_execution_continuation_duplicate_id");
  if (memory.entries.some((entry) => entry.nonce === nonce)) throw new Error("controlled_proof_execution_continuation_duplicate_nonce");
  const memoryHashBefore = memory.memoryHash;
  const payload = signingPayload({ authorization, authorizationMemory, policy, memoryHashBefore, continuationId, executor, continuedAt, nonce });
  const signature = signPayload(payload, externalExecutorPrivateKey, executor.publicKeyPem);
  const unsigned = {
    schema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_RECEIPT_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_CONTINUATION_SIGNATURE_ALGORITHM,
    continuationRecorded: true,
    singleUse: true,
    maximumContinuations: 1,
    remainingContinuations: 0,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const continuationReceipt = { ...unsigned, continuationReceiptHash: digest(unsigned) };
  const entryPayload = {
    schema: CONTROLLED_PROOF_EXECUTION_CONTINUATION_MEMORY_ENTRY_SCHEMA,
    sequence: memory.entries.length + 1,
    previousEntryHash: memory.entries.at(-1)?.entryHash ?? null,
    continuationReceiptHash: continuationReceipt.continuationReceiptHash,
    continuationPolicyHash: policy.policyHash,
    continuationMemoryHashBefore: memoryHashBefore,
    continuationAuthorizationHash: authorization.continuationAuthorizationHash,
    continuationAuthorizationPolicyHash: authorization.continuationAuthorizationPolicyHash,
    continuationAuthorizationMemoryHash: authorizationMemory.memoryHash,
    observationReceiptHash: authorization.observationReceiptHash,
    observationPolicyHash: authorization.observationPolicyHash,
    observationMemoryHash: authorization.observationMemoryHash,
    executionStartReceiptHash: authorization.executionStartReceiptHash,
    executionStartPolicyHash: authorization.executionStartPolicyHash,
    executionStartMemoryHash: authorization.executionStartMemoryHash,
    packageSha256: authorization.packageSha256,
    inventoryHash: authorization.inventoryHash,
    continuationId,
    continuationAuthorizationId: authorization.continuationAuthorizationId,
    observationId: authorization.observationId,
    executionStartId: authorization.executionStartId,
    externalExecutorActorId: executor.actorId,
    observerActorId: authorization.observerActorId,
    continuationAuthorizerActorId: authorization.continuationAuthorizerActorId,
    continuationAuthorizationVerified: true,
    continuationAuthorizationRecorded: true,
    controlledProofExecutionStarted: true,
    controlledProofExecutionObserved: true,
    controlledProofExecutionContinuationAuthorized: true,
    controlledProofExecutionContinued: true,
    singleUse: true,
    maximumContinuations: 1,
    remainingContinuations: 0,
    authorizedAt: authorization.authorizedAt,
    expiresAt: authorization.expiresAt,
    continuedAt,
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
    continuationReceipt,
    controlledProofExecutionContinuationMemory: createControlledProofExecutionContinuationMemory({
      policy,
      entries: [...memory.entries, entry],
    }),
  };
}

export function inspectControlledProofExecutionContinuationReceipt(receipt, {
  controlledProofExecutionContinuationAuthorization: authorization,
  controlledProofExecutionContinuationAuthorizationMemory: authorizationMemory,
  controlledProofExecutionContinuationPolicy: policy,
  controlledProofExecutionContinuationMemory: memory,
  ...upstream
}) {
  try {
    if (receipt?.schema !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_RECEIPT_SCHEMA) throw new Error("controlled_proof_execution_continuation_receipt_schema_invalid");
    const context = {
      ...upstream,
      controlledProofExecutionContinuationAuthorizationMemory: authorizationMemory,
      controlledProofExecutionContinuationPolicy: policy,
      controlledProofExecutionContinuationMemory: memory,
    };
    verifyContext(context);
    const authorizationInspection = inspectControlledProofExecutionContinuationAuthorization(authorization, {
      ...upstream,
      controlledProofExecutionContinuationAuthorizationMemory: authorizationMemory,
    });
    if (!authorizationInspection.ok) throw new Error(`controlled_proof_execution_continuation_authorization_invalid:${authorizationInspection.reason}`);
    const entryIndex = memory.entries.findIndex((entry) => entry.continuationReceiptHash === receipt.continuationReceiptHash);
    if (entryIndex < 0) throw new Error("controlled_proof_execution_continuation_not_recorded");
    const executor = policy.trustedContinuationExecutors.find((item) => item.keyId === receipt.externalExecutorKeyId);
    if (!executor || executor.actorId !== authorization.externalExecutorActorId) throw new Error("controlled_proof_execution_continuation_executor_untrusted");
    if (authorization.externalExecutorKeyId !== executor.keyId) throw new Error("controlled_proof_execution_continuation_executor_binding_mismatch");
    validateContinuationWindow(authorization, executor, receipt.continuedAt);
    const memoryHashBefore = memoryHashForEntries(policy, memory.entries.slice(0, entryIndex));
    const payload = signingPayload({
      authorization,
      authorizationMemory,
      policy,
      memoryHashBefore,
      continuationId: receipt.continuationId,
      executor,
      continuedAt: receipt.continuedAt,
      nonce: receipt.nonce,
    });
    for (const [key, expected] of Object.entries(payload)) {
      if (JSON.stringify(receipt[key]) !== JSON.stringify(expected)) throw new Error(`controlled_proof_execution_continuation_${key}_mismatch`);
    }
    if (receipt.signatureAlgorithm !== CONTROLLED_PROOF_EXECUTION_CONTINUATION_SIGNATURE_ALGORITHM || typeof receipt.signature !== "string") {
      throw new Error("controlled_proof_execution_continuation_signature_invalid");
    }
    if (!cryptoVerify(null, bytes(payload), executor.publicKeyPem, Buffer.from(receipt.signature, "base64url"))) {
      throw new Error("controlled_proof_execution_continuation_signature_verification_failed");
    }
    if (
      receipt.continuationAuthorizationVerified !== true || receipt.continuationAuthorizationRecorded !== true ||
      receipt.controlledProofExecutionStarted !== true || receipt.controlledProofExecutionObserved !== true ||
      receipt.controlledProofExecutionContinuationAuthorized !== true || receipt.controlledProofExecutionContinued !== true ||
      receipt.continuationRecorded !== true || receipt.singleUse !== true ||
      receipt.maximumContinuations !== 1 || receipt.remainingContinuations !== 0
    ) throw new Error("controlled_proof_execution_continuation_contract_invalid");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (receipt[key] !== false) throw new Error(`controlled_proof_execution_continuation_${key}_must_be_false`);
    }
    const hashPayload = { ...receipt };
    delete hashPayload.continuationReceiptHash;
    if (digest(hashPayload) !== receipt.continuationReceiptHash) throw new Error("controlled_proof_execution_continuation_receipt_hash_mismatch");
    const entry = memory.entries[entryIndex];
    if (
      entry.continuationAuthorizationHash !== authorization.continuationAuthorizationHash ||
      entry.continuationAuthorizationMemoryHash !== authorizationMemory.memoryHash ||
      entry.continuationMemoryHashBefore !== memoryHashBefore ||
      entry.externalExecutorActorId !== executor.actorId
    ) throw new Error("controlled_proof_execution_continuation_memory_entry_mismatch");
    return {
      ok: true,
      continuationReceiptHash: receipt.continuationReceiptHash,
      continuationAuthorizationHash: receipt.continuationAuthorizationHash,
      controlledProofExecutionStarted: true,
      controlledProofExecutionObserved: true,
      controlledProofExecutionContinuationAuthorized: true,
      controlledProofExecutionContinued: true,
      publicationExecuted: false,
      externalPublicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_continuation_receipt_invalid" };
  }
}
