import { createHash, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION_SCHEMA,
  inspectControlledProofExecutionStartAuthorization,
  inspectControlledProofExecutionStartAuthorizationMemory,
  inspectControlledProofExecutionStartAuthorizationPolicy,
} from "./controlled-proof-execution-start-authorization.mjs";

export const CONTROLLED_PROOF_EXECUTION_START_POLICY_SCHEMA = "atlas.controlled-proof-execution-start-policy.v1";
export const CONTROLLED_PROOF_EXECUTION_START_RECEIPT_SCHEMA = "atlas.controlled-proof-execution-start-receipt.v1";
export const CONTROLLED_PROOF_EXECUTION_START_MEMORY_SCHEMA = "atlas.controlled-proof-execution-start-memory.v1";
export const CONTROLLED_PROOF_EXECUTION_START_MEMORY_ENTRY_SCHEMA = "atlas.controlled-proof-execution-start-memory-entry.v1";
export const CONTROLLED_PROOF_EXECUTION_START_SIGNATURE_ALGORITHM = "ed25519";

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

function authorizationPolicyContext(args) {
  return {
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

function verifyAuthorizationPolicy(policy, args) {
  const inspection = inspectControlledProofExecutionStartAuthorizationPolicy(policy, authorizationPolicyContext(args));
  if (!inspection.ok) throw new Error(`controlled_proof_execution_start_authorization_policy_invalid:${inspection.reason}`);
}

export function createControlledProofExecutionStartPolicy({
  controlledProofExecutionStartAuthorizationPolicy: authorizationPolicy,
  ...upstream
}) {
  verifyAuthorizationPolicy(authorizationPolicy, upstream);
  const payload = {
    schema: CONTROLLED_PROOF_EXECUTION_START_POLICY_SCHEMA,
    compositionId: authorizationPolicy.compositionId,
    compositionDecisionHash: authorizationPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: authorizationPolicy.publicationDecisionPolicyHash,
    authorizationConsumptionPolicyHash: authorizationPolicy.authorizationConsumptionPolicyHash,
    executionHandoffPolicyHash: authorizationPolicy.executionHandoffPolicyHash,
    executionAcceptancePolicyHash: authorizationPolicy.executionAcceptancePolicyHash,
    executionPermitGrantPolicyHash: authorizationPolicy.executionPermitGrantPolicyHash,
    executionPermitConsumptionPolicyHash: authorizationPolicy.executionPermitConsumptionPolicyHash,
    startAuthorizationPolicyHash: authorizationPolicy.policyHash,
    requiredStartAuthorizationSchema: CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION_SCHEMA,
    requiredMemoryEntrySchema: CONTROLLED_PROOF_EXECUTION_START_MEMORY_ENTRY_SCHEMA,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_START_SIGNATURE_ALGORITHM,
    trustedStartExecutors: authorizationPolicy.trustedStartAuthorizers,
    recordedStartAuthorizationRequired: true,
    exactStartAuthorizationBindingRequired: true,
    exactStartAuthorizationMemoryBindingRequired: true,
    exactConsumptionBindingRequired: true,
    exactPermitBindingRequired: true,
    exactTargetExecutorBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    startAuthorizationSignatureVerificationRequired: true,
    authorizationValidityAtStartRequired: true,
    appendOnlyStartMemoryRequired: true,
    duplicateStartAuthorizationRejected: true,
    atomicMemoryHeadBindingRequired: true,
    signedExecutionStartRequired: true,
    singleUseStartRequired: true,
    maximumStarts: 1,
    controlledProofExecutionStartAllowed: true,
    controlledProofExecutionObservationAllowed: false,
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

export function inspectControlledProofExecutionStartPolicy(policy, context) {
  try {
    const recreated = createControlledProofExecutionStartPolicy(context);
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "controlled_proof_execution_start_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "controlled_proof_execution_start_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedStartExecutors: recreated.trustedStartExecutors.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_start_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_PROOF_EXECUTION_START_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedExecutionStarts: entries.length,
      consumedStartAuthorizations: new Set(entries.map((entry) => entry.startAuthorizationHash)).size,
      distinctExecutionStarts: new Set(entries.map((entry) => entry.executionStartReceiptHash)).size,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      controlledProofExecutionStarted: entries.length > 0,
      controlledProofExecutionObserved: false,
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

export function createControlledProofExecutionStartMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_PROOF_EXECUTION_START_POLICY_SCHEMA) throw new Error("controlled_proof_execution_start_memory_policy_invalid");
  assertHash(policy.policyHash, "controlled_proof_execution_start_memory_policy_hash");
  if (!Array.isArray(entries)) throw new Error("controlled_proof_execution_start_memory_entries_invalid");
  let previousEntryHash = null;
  const authorizationHashes = new Set();
  const startIds = new Set();
  const nonces = new Set();
  const normalized = [];
  for (const [index, entry] of entries.entries()) {
    if (entry?.schema !== CONTROLLED_PROOF_EXECUTION_START_MEMORY_ENTRY_SCHEMA) throw new Error("controlled_proof_execution_start_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("controlled_proof_execution_start_memory_chain_invalid");
    for (const field of [
      "executionStartReceiptHash", "executionStartPolicyHash", "executionStartMemoryHashBefore", "startAuthorizationHash",
      "startAuthorizationPolicyHash", "startAuthorizationMemoryHash", "consumptionReceiptHash", "consumptionMemoryHash",
      "permitHash", "packageSha256", "inventoryHash",
    ]) assertHash(entry[field], `controlled_proof_execution_start_memory_${field}`);
    for (const field of ["executionStartId", "startAuthorizationId", "consumptionId", "permitId", "externalExecutorActorId", "nonce"]) {
      assertSlug(entry[field], `controlled_proof_execution_start_memory_${field}`);
    }
    assertIso(entry.startedAt, "controlled_proof_execution_start_memory_started_at");
    if (entry.executionStartPolicyHash !== policy.policyHash) throw new Error("controlled_proof_execution_start_memory_policy_binding_mismatch");
    if (entry.executionStartMemoryHashBefore !== memoryHashForEntries(policy, normalized)) throw new Error("controlled_proof_execution_start_memory_head_binding_mismatch");
    if (authorizationHashes.has(entry.startAuthorizationHash)) throw new Error("controlled_proof_execution_start_authorization_already_consumed");
    if (startIds.has(entry.executionStartId)) throw new Error("controlled_proof_execution_start_duplicate_id");
    if (nonces.has(entry.nonce)) throw new Error("controlled_proof_execution_start_duplicate_nonce");
    if (
      entry.startAuthorizationVerified !== true || entry.startAuthorizationConsumed !== true || entry.remainingStarts !== 0 ||
      entry.executionStartRecorded !== true || entry.controlledProofExecutionStarted !== true
    ) throw new Error("controlled_proof_execution_start_memory_contract_invalid");
    for (const key of ["controlledProofExecutionObserved", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`controlled_proof_execution_start_memory_${key}_must_be_false`);
    }
    const entryPayload = { ...entry };
    delete entryPayload.entryHash;
    if (digest(entryPayload) !== entry.entryHash) throw new Error("controlled_proof_execution_start_memory_entry_hash_mismatch");
    normalized.push({ ...entry });
    authorizationHashes.add(entry.startAuthorizationHash);
    startIds.add(entry.executionStartId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledProofExecutionStartMemory(memory, { policy }) {
  try {
    const recreated = createControlledProofExecutionStartMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "controlled_proof_execution_start_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "controlled_proof_execution_start_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, ...recreated.summary };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_start_memory_invalid" };
  }
}

function startPolicyContext(args) {
  return {
    controlledProofExecutionStartAuthorizationPolicy: args.controlledProofExecutionStartAuthorizationPolicy,
    ...authorizationPolicyContext(args),
  };
}

function verifyContext(args) {
  const policyInspection = inspectControlledProofExecutionStartPolicy(args.controlledProofExecutionStartPolicy, startPolicyContext(args));
  if (!policyInspection.ok) throw new Error(`controlled_proof_execution_start_policy_invalid:${policyInspection.reason}`);
  const memoryInspection = inspectControlledProofExecutionStartMemory(args.controlledProofExecutionStartMemory, { policy: args.controlledProofExecutionStartPolicy });
  if (!memoryInspection.ok) throw new Error(`controlled_proof_execution_start_memory_invalid:${memoryInspection.reason}`);
  const authorizationMemoryInspection = inspectControlledProofExecutionStartAuthorizationMemory(
    args.controlledProofExecutionStartAuthorizationMemory,
    { policy: args.controlledProofExecutionStartAuthorizationPolicy },
  );
  if (!authorizationMemoryInspection.ok) throw new Error(`controlled_proof_execution_start_authorization_memory_invalid:${authorizationMemoryInspection.reason}`);
}

function validateStartWindow(startAuthorization, executor, startedAt) {
  assertIso(startedAt, "controlled_proof_execution_started_at");
  const started = Date.parse(startedAt);
  if (started < Date.parse(startAuthorization.authorizedAt)) throw new Error("controlled_proof_execution_start_before_authorization");
  if (started >= Date.parse(startAuthorization.expiresAt)) throw new Error("controlled_proof_execution_start_authorization_expired");
  if (executor.status !== "active") throw new Error("controlled_proof_execution_start_executor_inactive");
  if (started < Date.parse(executor.validFrom) || started > Date.parse(executor.validUntil)) throw new Error("controlled_proof_execution_start_executor_key_outside_validity");
}

function signingPayload({ startAuthorization, authorizationMemory, startPolicy, startMemoryHashBefore, executionStartId, executor, startedAt, nonce }) {
  if (!authorizationMemory.entries.some((entry) => entry.startAuthorizationHash === startAuthorization.startAuthorizationHash && entry.remainingStarts === 1)) {
    throw new Error("controlled_proof_execution_start_authorization_not_recorded");
  }
  return {
    signingSchema: "atlas.controlled-proof-execution-start-signing-payload.v1",
    compositionId: startAuthorization.compositionId,
    compositionDecisionHash: startAuthorization.compositionDecisionHash,
    publicationDecisionHash: startAuthorization.publicationDecisionHash,
    evidenceDecisionHash: startAuthorization.evidenceDecisionHash,
    authorizationConsumptionReceiptHash: startAuthorization.authorizationConsumptionReceiptHash,
    handoffReceiptHash: startAuthorization.handoffReceiptHash,
    acceptanceReceiptHash: startAuthorization.acceptanceReceiptHash,
    packageSha256: startAuthorization.packageSha256,
    inventoryHash: startAuthorization.inventoryHash,
    permitHash: startAuthorization.permitHash,
    permitId: startAuthorization.permitId,
    consumptionReceiptHash: startAuthorization.consumptionReceiptHash,
    consumptionMemoryHash: startAuthorization.consumptionMemoryHash,
    consumptionId: startAuthorization.consumptionId,
    startAuthorizationHash: startAuthorization.startAuthorizationHash,
    startAuthorizationPolicyHash: startAuthorization.startAuthorizationPolicyHash,
    startAuthorizationMemoryHash: authorizationMemory.memoryHash,
    startAuthorizationId: startAuthorization.startAuthorizationId,
    executionStartPolicyHash: startPolicy.policyHash,
    executionStartMemoryHashBefore: startMemoryHashBefore,
    executionStartId,
    externalExecutorKeyId: executor.keyId,
    externalExecutorActorId: executor.actorId,
    externalExecutorRole: executor.role,
    startAuthorizationVerified: true,
    startAuthorizationConsumed: true,
    remainingStarts: 0,
    controlledProofExecutionStarted: true,
    startedAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("controlled_proof_execution_start_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_controlled_proof_execution_start_executor");
  return signature;
}

export function startControlledProofExecution({
  controlledProofExecutionStartAuthorization: startAuthorization,
  controlledProofExecutionStartAuthorizationMemory: authorizationMemory,
  controlledProofExecutionStartPolicy: startPolicy,
  controlledProofExecutionStartMemory: startMemory,
  executionStartId,
  externalExecutorKeyId,
  externalExecutorPrivateKey,
  startedAt,
  nonce,
  ...upstream
}) {
  const context = {
    ...upstream,
    controlledProofExecutionStartAuthorizationPolicy: upstream.controlledProofExecutionStartAuthorizationPolicy,
    controlledProofExecutionStartAuthorizationMemory: authorizationMemory,
    controlledProofExecutionStartPolicy: startPolicy,
    controlledProofExecutionStartMemory: startMemory,
  };
  verifyContext(context);
  const authorizationInspection = inspectControlledProofExecutionStartAuthorization(startAuthorization, {
    ...upstream,
    controlledProofExecutionStartAuthorizationMemory: authorizationMemory,
  });
  if (!authorizationInspection.ok) throw new Error(`controlled_proof_execution_start_authorization_invalid:${authorizationInspection.reason}`);
  assertSlug(executionStartId, "controlled_proof_execution_start_id");
  assertSlug(externalExecutorKeyId, "controlled_proof_execution_start_executor_key_id");
  assertSlug(nonce, "controlled_proof_execution_start_nonce");
  if (startMemory.entries.some((entry) => entry.startAuthorizationHash === startAuthorization.startAuthorizationHash)) throw new Error("controlled_proof_execution_start_authorization_already_consumed");
  if (startMemory.entries.some((entry) => entry.executionStartId === executionStartId)) throw new Error("controlled_proof_execution_start_duplicate_id");
  if (startMemory.entries.some((entry) => entry.nonce === nonce)) throw new Error("controlled_proof_execution_start_duplicate_nonce");
  if (externalExecutorKeyId !== startAuthorization.externalExecutorKeyId) throw new Error("controlled_proof_execution_start_wrong_target_executor");
  const executor = startPolicy.trustedStartExecutors.find((item) => item.keyId === externalExecutorKeyId);
  if (!executor || executor.actorId !== startAuthorization.externalExecutorActorId) throw new Error("controlled_proof_execution_start_executor_untrusted");
  validateStartWindow(startAuthorization, executor, startedAt);
  const executionStartMemoryHashBefore = startMemory.memoryHash;
  const payload = signingPayload({ startAuthorization, authorizationMemory, startPolicy, startMemoryHashBefore: executionStartMemoryHashBefore, executionStartId, executor, startedAt, nonce });
  const signature = signPayload(payload, externalExecutorPrivateKey, executor.publicKeyPem);
  const receiptValue = {
    schema: CONTROLLED_PROOF_EXECUTION_START_RECEIPT_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_START_SIGNATURE_ALGORITHM,
    executionStartRecorded: true,
    controlledProofExecutionObserved: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const executionStartReceipt = { ...receiptValue, executionStartReceiptHash: digest(receiptValue) };
  const entryPayload = {
    schema: CONTROLLED_PROOF_EXECUTION_START_MEMORY_ENTRY_SCHEMA,
    sequence: startMemory.entries.length + 1,
    previousEntryHash: startMemory.entries.at(-1)?.entryHash ?? null,
    executionStartReceiptHash: executionStartReceipt.executionStartReceiptHash,
    executionStartPolicyHash: startPolicy.policyHash,
    executionStartMemoryHashBefore,
    startAuthorizationHash: startAuthorization.startAuthorizationHash,
    startAuthorizationPolicyHash: startAuthorization.startAuthorizationPolicyHash,
    startAuthorizationMemoryHash: authorizationMemory.memoryHash,
    consumptionReceiptHash: startAuthorization.consumptionReceiptHash,
    consumptionMemoryHash: startAuthorization.consumptionMemoryHash,
    permitHash: startAuthorization.permitHash,
    packageSha256: startAuthorization.packageSha256,
    inventoryHash: startAuthorization.inventoryHash,
    executionStartId,
    startAuthorizationId: startAuthorization.startAuthorizationId,
    consumptionId: startAuthorization.consumptionId,
    permitId: startAuthorization.permitId,
    externalExecutorActorId: executor.actorId,
    startAuthorizationVerified: true,
    startAuthorizationConsumed: true,
    remainingStarts: 0,
    executionStartRecorded: true,
    controlledProofExecutionStarted: true,
    controlledProofExecutionObserved: false,
    startedAt,
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
    executionStartReceipt,
    controlledProofExecutionStartMemory: createControlledProofExecutionStartMemory({ policy: startPolicy, entries: [...startMemory.entries, entry] }),
  };
}

export function inspectControlledProofExecutionStartReceipt(receipt, {
  controlledProofExecutionStartAuthorization: startAuthorization,
  controlledProofExecutionStartAuthorizationMemory: authorizationMemory,
  controlledProofExecutionStartPolicy: startPolicy,
  controlledProofExecutionStartMemory: startMemory,
  ...upstream
}) {
  try {
    if (receipt?.schema !== CONTROLLED_PROOF_EXECUTION_START_RECEIPT_SCHEMA) throw new Error("controlled_proof_execution_start_receipt_schema_invalid");
    const context = {
      ...upstream,
      controlledProofExecutionStartAuthorizationPolicy: upstream.controlledProofExecutionStartAuthorizationPolicy,
      controlledProofExecutionStartAuthorizationMemory: authorizationMemory,
      controlledProofExecutionStartPolicy: startPolicy,
      controlledProofExecutionStartMemory: startMemory,
    };
    verifyContext(context);
    const authorizationInspection = inspectControlledProofExecutionStartAuthorization(startAuthorization, {
      ...upstream,
      controlledProofExecutionStartAuthorizationMemory: authorizationMemory,
    });
    if (!authorizationInspection.ok) throw new Error(`controlled_proof_execution_start_authorization_invalid:${authorizationInspection.reason}`);
    const executor = startPolicy.trustedStartExecutors.find((item) => item.keyId === receipt.externalExecutorKeyId);
    if (!executor || executor.actorId !== startAuthorization.externalExecutorActorId || receipt.externalExecutorKeyId !== startAuthorization.externalExecutorKeyId) throw new Error("controlled_proof_execution_start_wrong_target_executor");
    validateStartWindow(startAuthorization, executor, receipt.startedAt);
    const entryIndex = startMemory.entries.findIndex((entry) => entry.executionStartReceiptHash === receipt.executionStartReceiptHash);
    if (entryIndex < 0) throw new Error("controlled_proof_execution_start_not_recorded");
    const executionStartMemoryHashBefore = memoryHashForEntries(startPolicy, startMemory.entries.slice(0, entryIndex));
    const payload = signingPayload({
      startAuthorization,
      authorizationMemory,
      startPolicy,
      startMemoryHashBefore: executionStartMemoryHashBefore,
      executionStartId: receipt.executionStartId,
      executor,
      startedAt: receipt.startedAt,
      nonce: receipt.nonce,
    });
    for (const [key, expected] of Object.entries(payload)) if (JSON.stringify(receipt[key]) !== JSON.stringify(expected)) throw new Error(`controlled_proof_execution_start_${key}_mismatch`);
    if (receipt.signatureAlgorithm !== CONTROLLED_PROOF_EXECUTION_START_SIGNATURE_ALGORITHM || typeof receipt.signature !== "string") throw new Error("controlled_proof_execution_start_signature_invalid");
    if (!cryptoVerify(null, bytes(payload), executor.publicKeyPem, Buffer.from(receipt.signature, "base64url"))) throw new Error("controlled_proof_execution_start_signature_verification_failed");
    if (
      receipt.startAuthorizationVerified !== true || receipt.startAuthorizationConsumed !== true || receipt.remainingStarts !== 0 ||
      receipt.executionStartRecorded !== true || receipt.controlledProofExecutionStarted !== true
    ) throw new Error("controlled_proof_execution_start_receipt_contract_invalid");
    for (const key of ["controlledProofExecutionObserved", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (receipt[key] !== false) throw new Error(`controlled_proof_execution_start_${key}_must_be_false`);
    }
    const hashPayload = { ...receipt };
    delete hashPayload.executionStartReceiptHash;
    if (digest(hashPayload) !== receipt.executionStartReceiptHash) throw new Error("controlled_proof_execution_start_receipt_hash_mismatch");
    const entry = startMemory.entries[entryIndex];
    if (entry.startAuthorizationHash !== startAuthorization.startAuthorizationHash || entry.executionStartMemoryHashBefore !== executionStartMemoryHashBefore || entry.remainingStarts !== 0) {
      throw new Error("controlled_proof_execution_start_memory_entry_mismatch");
    }
    return {
      ok: true,
      executionStartReceiptHash: receipt.executionStartReceiptHash,
      startAuthorizationHash: receipt.startAuthorizationHash,
      startAuthorizationConsumed: true,
      remainingStarts: 0,
      controlledProofExecutionStarted: true,
      controlledProofExecutionObserved: false,
      publicationExecuted: false,
      externalPublicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_start_receipt_invalid" };
  }
}
