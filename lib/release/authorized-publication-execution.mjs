import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  inspectAuthorizedPublicationExecutionAuthorization,
  inspectAuthorizedPublicationExecutionAuthorizationPolicy,
} from "./authorized-publication-execution-authorization.mjs";

export const AUTHORIZED_PUBLICATION_EXECUTION_POLICY_SCHEMA = "atlas.authorized-publication-execution-policy.v1";
export const AUTHORIZED_PUBLICATION_EXECUTION_RECEIPT_SCHEMA = "atlas.authorized-publication-execution-receipt.v1";
export const AUTHORIZED_PUBLICATION_EXECUTION_MEMORY_SCHEMA = "atlas.authorized-publication-execution-memory.v1";
export const AUTHORIZED_PUBLICATION_EXECUTION_MEMORY_ENTRY_SCHEMA = "atlas.authorized-publication-execution-memory-entry.v1";
export const AUTHORIZED_PUBLICATION_EXECUTION_SIGNATURE_ALGORITHM = "ed25519";
export const AUTHORIZED_PUBLICATION_EXECUTOR_ROLE = "release-publication-executor";
export const AUTHORIZED_PUBLICATION_EXECUTION_ISOLATION_MODE = "isolated-local-publication-proof";

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

function normalizeExecutor(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("publication_executor_invalid");
  assertSlug(value.keyId, "publication_executor_key_id");
  assertSlug(value.actorId, "publication_executor_actor_id");
  if (value.role !== AUTHORIZED_PUBLICATION_EXECUTOR_ROLE) throw new Error("publication_executor_role_invalid");
  if (!["active", "inactive"].includes(value.status)) throw new Error("publication_executor_status_invalid");
  assertIso(value.validFrom, "publication_executor_valid_from");
  assertIso(value.validUntil, "publication_executor_valid_until");
  if (Date.parse(value.validUntil) <= Date.parse(value.validFrom)) throw new Error("publication_executor_validity_invalid");
  try {
    const key = createPublicKey(value.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch {
    throw new Error("publication_executor_public_key_invalid");
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

function normalizeHandlerDescriptor(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("publication_handler_descriptor_invalid");
  assertSlug(value.handlerId, "publication_handler_id");
  assertHash(value.handlerDigest, "publication_handler_digest");
  return { handlerId: value.handlerId, handlerDigest: value.handlerDigest };
}

function priorIdentities({ publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy, executionAuthorizationPolicy }) {
  return new Set([
    ...(publicationPolicy.trustedPublicationDirectors ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(evidencePolicy.trustedEvidenceCustodians ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(assemblyPolicy.trustedPackageAssemblers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(packageAuthorizationPolicy.trustedPackageAuthorizers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(executionAuthorizationPolicy.trustedExecutionAuthorizers ?? []).flatMap((item) => [item.keyId, item.actorId]),
  ]);
}

function verifyAuthorizationPolicy({ executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy }) {
  const inspection = inspectAuthorizedPublicationExecutionAuthorizationPolicy(executionAuthorizationPolicy, {
    publicationPolicy,
    evidencePolicy,
    assemblyPolicy,
    packageAuthorizationPolicy,
  });
  if (!inspection.ok) throw new Error(`publication_execution_authorization_policy_invalid:${inspection.reason}`);
}

export function createAuthorizedPublicationExecutionPolicy({
  executionAuthorizationPolicy,
  publicationPolicy,
  evidencePolicy,
  assemblyPolicy,
  packageAuthorizationPolicy,
  trustedExecutors = [],
  trustedPublicationHandlers = [],
  maxExecutionDurationSeconds = 900,
  maxEvidenceItems = 20,
}) {
  verifyAuthorizationPolicy({ executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy });
  if (!Array.isArray(trustedExecutors)) throw new Error("trusted_publication_executors_invalid");
  if (!Array.isArray(trustedPublicationHandlers)) throw new Error("trusted_publication_handlers_invalid");
  const executors = trustedExecutors.map(normalizeExecutor).sort((a, b) => a.keyId.localeCompare(b.keyId));
  const handlers = trustedPublicationHandlers.map(normalizeHandlerDescriptor).sort((a, b) => a.handlerId.localeCompare(b.handlerId));
  if (new Set(executors.map((item) => item.keyId)).size !== executors.length) throw new Error("duplicate_publication_executor_key_id");
  if (new Set(executors.map((item) => item.actorId)).size !== executors.length) throw new Error("duplicate_publication_executor_actor_id");
  if (new Set(handlers.map((item) => item.handlerId)).size !== handlers.length) throw new Error("duplicate_publication_handler_id");
  const forbidden = priorIdentities({ publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy, executionAuthorizationPolicy });
  if (executors.some((item) => forbidden.has(item.keyId) || forbidden.has(item.actorId))) {
    throw new Error("publication_executor_must_be_independent");
  }
  if (!Number.isInteger(maxExecutionDurationSeconds) || maxExecutionDurationSeconds < 1 || maxExecutionDurationSeconds > 3600) {
    throw new Error("max_publication_execution_duration_invalid");
  }
  if (!Number.isInteger(maxEvidenceItems) || maxEvidenceItems < 1 || maxEvidenceItems > 100) {
    throw new Error("max_publication_execution_evidence_items_invalid");
  }
  const payload = {
    schema: AUTHORIZED_PUBLICATION_EXECUTION_POLICY_SCHEMA,
    compositionId: executionAuthorizationPolicy.compositionId,
    compositionDecisionHash: executionAuthorizationPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: executionAuthorizationPolicy.publicationDecisionPolicyHash,
    executionAuthorizationPolicyHash: executionAuthorizationPolicy.policyHash,
    packageAuthorizationPolicyHash: executionAuthorizationPolicy.packageAuthorizationPolicyHash,
    packageAssemblyPolicyHash: executionAuthorizationPolicy.packageAssemblyPolicyHash,
    packageEvidencePolicyHash: executionAuthorizationPolicy.packageEvidencePolicyHash,
    requiredAuthorizationSchema: "atlas.authorized-publication-execution-authorization.v1",
    requiredMemoryEntrySchema: AUTHORIZED_PUBLICATION_EXECUTION_MEMORY_ENTRY_SCHEMA,
    executorRole: AUTHORIZED_PUBLICATION_EXECUTOR_ROLE,
    signatureAlgorithm: AUTHORIZED_PUBLICATION_EXECUTION_SIGNATURE_ALGORITHM,
    isolationMode: AUTHORIZED_PUBLICATION_EXECUTION_ISOLATION_MODE,
    trustedExecutors: executors,
    trustedPublicationHandlers: handlers,
    maxExecutionDurationSeconds,
    maxEvidenceItems,
    exactExecutionAuthorizationBindingRequired: true,
    exactPublicationDecisionBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    independentPublicationExecutorRequired: true,
    trustedPublicationHandlerRequired: true,
    atomicAuthorizationClaimRequired: true,
    signatureRequired: true,
    appendOnlyExecutionMemoryRequired: true,
    duplicateAuthorizationExecutionRejected: true,
    networkAccessAllowed: false,
    databaseMutationAllowed: false,
    arbitraryCommandExecutionAllowed: false,
    externalPublicationAllowed: false,
    automaticPackageGeneration: false,
    automaticBuild: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectAuthorizedPublicationExecutionPolicy(policy, context) {
  try {
    const recreated = createAuthorizedPublicationExecutionPolicy({
      ...context,
      trustedExecutors: policy?.trustedExecutors,
      trustedPublicationHandlers: policy?.trustedPublicationHandlers,
      maxExecutionDurationSeconds: policy?.maxExecutionDurationSeconds,
      maxEvidenceItems: policy?.maxEvidenceItems,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "publication_execution_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "publication_execution_policy_contract_mismatch" };
    return {
      ok: true,
      policyHash: recreated.policyHash,
      trustedExecutors: recreated.trustedExecutors.length,
      trustedPublicationHandlers: recreated.trustedPublicationHandlers.length,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "publication_execution_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: AUTHORIZED_PUBLICATION_EXECUTION_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedExecutions: entries.length,
      successfulLocalProofs: entries.filter((entry) => entry.status === "passed").length,
      failedLocalProofs: entries.filter((entry) => entry.status === "failed").length,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      publicationExecuted: false,
      externalPublicationExecuted: false,
      buildExecuted: false,
      deployExecuted: false,
      releasePromoted: false,
    },
  };
}

export function createAuthorizedPublicationExecutionMemory({ policy, entries = [] }) {
  if (policy?.schema !== AUTHORIZED_PUBLICATION_EXECUTION_POLICY_SCHEMA) throw new Error("publication_execution_memory_policy_invalid");
  if (!Array.isArray(entries)) throw new Error("publication_execution_memory_entries_invalid");
  let previousEntryHash = null;
  const authorizationHashes = new Set();
  const executionIds = new Set();
  const normalized = entries.map((entry, index) => {
    if (entry?.schema !== AUTHORIZED_PUBLICATION_EXECUTION_MEMORY_ENTRY_SCHEMA) throw new Error("publication_execution_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("publication_execution_memory_chain_invalid");
    assertHash(entry.authorizationHash, "publication_execution_memory_authorization_hash");
    assertHash(entry.publicationDecisionHash, "publication_execution_memory_publication_decision_hash");
    assertHash(entry.packageSha256, "publication_execution_memory_package_sha256");
    assertHash(entry.inventoryHash, "publication_execution_memory_inventory_hash");
    assertHash(entry.receiptHash, "publication_execution_memory_receipt_hash");
    assertSlug(entry.executionId, "publication_execution_memory_execution_id");
    if (!["passed", "failed"].includes(entry.status)) throw new Error("publication_execution_memory_status_invalid");
    if (authorizationHashes.has(entry.authorizationHash)) throw new Error("publication_execution_authorization_already_consumed");
    if (executionIds.has(entry.executionId)) throw new Error("publication_execution_duplicate_execution_id");
    if (entry.authorizationConsumed !== true || entry.publicationProofExecuted !== true) throw new Error("publication_execution_memory_safety_contract_invalid");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`publication_execution_memory_${key}_must_be_false`);
    }
    const hashPayload = { ...entry };
    delete hashPayload.entryHash;
    if (digest(hashPayload) !== entry.entryHash) throw new Error("publication_execution_memory_entry_hash_mismatch");
    authorizationHashes.add(entry.authorizationHash);
    executionIds.add(entry.executionId);
    previousEntryHash = entry.entryHash;
    return { ...entry };
  });
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectAuthorizedPublicationExecutionMemory(memory, { policy }) {
  try {
    const recreated = createAuthorizedPublicationExecutionMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "publication_execution_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "publication_execution_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, recordedExecutions: recreated.entries.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "publication_execution_memory_invalid" };
  }
}

function verifyExecutionContext({
  executionPolicy,
  executionMemory,
  executionAuthorizationPolicy,
  publicationPolicy,
  evidencePolicy,
  assemblyPolicy,
  packageAuthorizationPolicy,
}) {
  const policyInspection = inspectAuthorizedPublicationExecutionPolicy(executionPolicy, {
    executionAuthorizationPolicy,
    publicationPolicy,
    evidencePolicy,
    assemblyPolicy,
    packageAuthorizationPolicy,
  });
  if (!policyInspection.ok) throw new Error(`publication_execution_policy_invalid:${policyInspection.reason}`);
  const memoryInspection = inspectAuthorizedPublicationExecutionMemory(executionMemory, { policy: executionPolicy });
  if (!memoryInspection.ok) throw new Error(`publication_execution_memory_invalid:${memoryInspection.reason}`);
}

function normalizeEvidence(evidence, maximum) {
  if (!Array.isArray(evidence) || evidence.length < 1 || evidence.length > maximum) throw new Error("publication_execution_evidence_invalid");
  return evidence.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("publication_execution_evidence_item_invalid");
    assertSlug(item.type, "publication_execution_evidence_type");
    if (typeof item.artifactPath !== "string" || item.artifactPath.length < 3 || item.artifactPath.length > 500 || item.artifactPath.startsWith("/") || item.artifactPath.includes("..")) {
      throw new Error("publication_execution_evidence_path_invalid");
    }
    assertHash(item.artifactHash, "publication_execution_evidence_hash");
    return { type: item.type, artifactPath: item.artifactPath, artifactHash: item.artifactHash };
  }).sort((a, b) => `${a.type}:${a.artifactPath}`.localeCompare(`${b.type}:${b.artifactPath}`));
}

function normalizeHandlerResult(value, policy) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("publication_handler_result_invalid");
  if (!["passed", "failed"].includes(value.status)) throw new Error("publication_handler_status_invalid");
  if (!Number.isInteger(value.exitCode) || value.exitCode < 0 || value.exitCode > 255) throw new Error("publication_handler_exit_code_invalid");
  if ((value.status === "passed") !== (value.exitCode === 0)) throw new Error("publication_handler_status_exit_code_mismatch");
  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  if (summary.length < 8 || summary.length > 2000) throw new Error("publication_handler_summary_invalid");
  return { status: value.status, exitCode: value.exitCode, summary, evidence: normalizeEvidence(value.evidence, policy.maxEvidenceItems) };
}

function validateExecutionWindow({ authorization, executor, policy, startedAt, completedAt }) {
  assertIso(startedAt, "publication_execution_started_at");
  assertIso(completedAt, "publication_execution_completed_at");
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (completed < started) throw new Error("publication_execution_time_order_invalid");
  if (completed - started > policy.maxExecutionDurationSeconds * 1000) throw new Error("publication_execution_duration_exceeded");
  if (started < Date.parse(authorization.authorizedAt) || completed > Date.parse(authorization.expiresAt)) throw new Error("publication_execution_authorization_expired");
  if (executor.status !== "active") throw new Error("publication_executor_inactive");
  if (executor.role !== policy.executorRole) throw new Error("publication_executor_role_mismatch");
  if (started < Date.parse(executor.validFrom) || completed > Date.parse(executor.validUntil)) throw new Error("publication_executor_key_outside_validity");
}

function verifyIndependentExecutor(executor, context) {
  const forbidden = priorIdentities(context);
  if (forbidden.has(executor.keyId) || forbidden.has(executor.actorId)) throw new Error("publication_executor_must_be_independent");
}

function validateRuntimeHandler(handler, policy) {
  if (!handler || typeof handler !== "object" || Array.isArray(handler) || typeof handler.execute !== "function") throw new Error("publication_handler_invalid");
  assertSlug(handler.handlerId, "publication_handler_id");
  assertHash(handler.handlerDigest, "publication_handler_digest");
  const trusted = policy.trustedPublicationHandlers.find((item) => item.handlerId === handler.handlerId);
  if (!trusted || trusted.handlerDigest !== handler.handlerDigest) throw new Error("publication_handler_untrusted");
  return trusted;
}

function receiptSigningPayload({ authorization, executionPolicy, executionId, executor, handler, result, startedAt, completedAt }) {
  return {
    signingSchema: "atlas.authorized-publication-execution-receipt-signing-payload.v1",
    compositionId: authorization.compositionId,
    compositionDecisionHash: authorization.compositionDecisionHash,
    authorizationHash: authorization.authorizationHash,
    authorizationId: authorization.authorizationId,
    publicationDecisionHash: authorization.publicationDecisionHash,
    packageName: authorization.packageName,
    packageSha256: authorization.packageSha256,
    packageSizeBytes: authorization.packageSizeBytes,
    inventoryHash: authorization.inventoryHash,
    inventoryFileCount: authorization.inventoryFileCount,
    inventoryTotalBytes: authorization.inventoryTotalBytes,
    executionPolicyHash: executionPolicy.policyHash,
    executionId,
    executorKeyId: executor.keyId,
    executorActorId: executor.actorId,
    executorRole: executor.role,
    handlerId: handler.handlerId,
    handlerDigest: handler.handlerDigest,
    isolationMode: AUTHORIZED_PUBLICATION_EXECUTION_ISOLATION_MODE,
    networkAccess: false,
    databaseMutation: false,
    externalPublication: false,
    status: result.status,
    exitCode: result.exitCode,
    summary: result.summary,
    evidence: result.evidence,
    startedAt,
    completedAt,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("publication_execution_receipt_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_publication_executor");
  return signature;
}

function verifyAuthorization(authorization, context) {
  const inspection = inspectAuthorizedPublicationExecutionAuthorization(authorization, context);
  if (!inspection.ok) throw new Error(`publication_execution_authorization_invalid:${inspection.reason}`);
  if (inspection.executionAuthorized !== true || inspection.publicationExecuted !== false) throw new Error("publication_execution_authorization_contract_invalid");
}

export async function executeAuthorizedPublication({
  publicationExecutionAuthorization: authorization,
  authorizedPublicationExecutionPolicy: executionPolicy,
  executionMemory,
  executionId,
  executorKeyId,
  executorPrivateKey,
  publicationHandler,
  consumptionStore,
  startedAt,
  completedAt,
  ...authorizationContext
}) {
  const {
    executionAuthorizationPolicy,
    publicationPolicy,
    evidencePolicy,
    assemblyPolicy,
    packageAuthorizationPolicy,
  } = authorizationContext;
  verifyExecutionContext({ executionPolicy, executionMemory, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy });
  verifyAuthorization(authorization, authorizationContext);
  assertSlug(executionId, "publication_execution_id");
  assertSlug(executorKeyId, "publication_executor_key_id");
  const executor = executionPolicy.trustedExecutors.find((item) => item.keyId === executorKeyId);
  if (!executor) throw new Error("publication_executor_untrusted");
  verifyIndependentExecutor(executor, { publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy, executionAuthorizationPolicy });
  validateExecutionWindow({ authorization, executor, policy: executionPolicy, startedAt, completedAt });
  const handler = validateRuntimeHandler(publicationHandler, executionPolicy);
  if (executionMemory.entries.some((entry) => entry.authorizationHash === authorization.authorizationHash)) throw new Error("publication_execution_authorization_already_consumed");
  if (executionMemory.entries.some((entry) => entry.executionId === executionId)) throw new Error("publication_execution_duplicate_execution_id");
  if (!consumptionStore || typeof consumptionStore.claim !== "function") throw new Error("publication_execution_consumption_store_invalid");
  const claimed = await consumptionStore.claim(authorization.authorizationHash);
  if (claimed !== true) throw new Error("publication_execution_authorization_claim_failed");

  let result;
  try {
    result = normalizeHandlerResult(await publicationHandler.execute(Object.freeze({
      executionId,
      authorizationHash: authorization.authorizationHash,
      publicationDecisionHash: authorization.publicationDecisionHash,
      packageName: authorization.packageName,
      packageSha256: authorization.packageSha256,
      packageSizeBytes: authorization.packageSizeBytes,
      inventoryHash: authorization.inventoryHash,
      inventoryFileCount: authorization.inventoryFileCount,
      inventoryTotalBytes: authorization.inventoryTotalBytes,
      isolationMode: AUTHORIZED_PUBLICATION_EXECUTION_ISOLATION_MODE,
      networkAccess: false,
      databaseMutation: false,
      externalPublication: false,
    })), executionPolicy);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "publication_handler_failed";
    result = {
      status: "failed",
      exitCode: 1,
      summary: `Handler local falhou de forma controlada: ${reason}`.slice(0, 2000),
      evidence: [{
        type: "handler-failure",
        artifactPath: `evidence/publication/${executionId}/failure.json`,
        artifactHash: digest({ executionId, reason }),
      }],
    };
  }

  const payload = receiptSigningPayload({ authorization, executionPolicy, executionId, executor, handler, result, startedAt, completedAt });
  const signature = signPayload(payload, executorPrivateKey, executor.publicKeyPem);
  const receiptValue = {
    schema: AUTHORIZED_PUBLICATION_EXECUTION_RECEIPT_SCHEMA,
    ...payload,
    signatureAlgorithm: AUTHORIZED_PUBLICATION_EXECUTION_SIGNATURE_ALGORITHM,
    authorizationConsumed: true,
    publicationProofExecuted: true,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: true,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const receipt = { ...receiptValue, receiptHash: digest(receiptValue) };
  const entryPayload = {
    schema: AUTHORIZED_PUBLICATION_EXECUTION_MEMORY_ENTRY_SCHEMA,
    sequence: executionMemory.entries.length + 1,
    previousEntryHash: executionMemory.entries.at(-1)?.entryHash ?? null,
    executionId,
    authorizationHash: authorization.authorizationHash,
    publicationDecisionHash: authorization.publicationDecisionHash,
    packageSha256: authorization.packageSha256,
    inventoryHash: authorization.inventoryHash,
    receiptHash: receipt.receiptHash,
    executorActorId: executor.actorId,
    status: result.status,
    startedAt,
    completedAt,
    authorizationConsumed: true,
    publicationProofExecuted: true,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  const entry = { ...entryPayload, entryHash: digest(entryPayload) };
  return {
    receipt,
    executionMemory: createAuthorizedPublicationExecutionMemory({ policy: executionPolicy, entries: [...executionMemory.entries, entry] }),
  };
}

export function inspectAuthorizedPublicationExecutionReceipt(receipt, {
  publicationExecutionAuthorization: authorization,
  authorizedPublicationExecutionPolicy: executionPolicy,
  executionMemory,
  ...authorizationContext
}) {
  try {
    if (receipt?.schema !== AUTHORIZED_PUBLICATION_EXECUTION_RECEIPT_SCHEMA) throw new Error("publication_execution_receipt_schema_invalid");
    const {
      executionAuthorizationPolicy,
      publicationPolicy,
      evidencePolicy,
      assemblyPolicy,
      packageAuthorizationPolicy,
    } = authorizationContext;
    verifyExecutionContext({ executionPolicy, executionMemory, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy });
    verifyAuthorization(authorization, authorizationContext);
    const executor = executionPolicy.trustedExecutors.find((item) => item.keyId === receipt.executorKeyId);
    if (!executor) throw new Error("publication_executor_untrusted");
    verifyIndependentExecutor(executor, { publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy, executionAuthorizationPolicy });
    validateExecutionWindow({ authorization, executor, policy: executionPolicy, startedAt: receipt.startedAt, completedAt: receipt.completedAt });
    const trustedHandler = executionPolicy.trustedPublicationHandlers.find((item) => item.handlerId === receipt.handlerId);
    if (!trustedHandler || trustedHandler.handlerDigest !== receipt.handlerDigest) throw new Error("publication_handler_untrusted");
    const result = normalizeHandlerResult(receipt, executionPolicy);
    const payload = receiptSigningPayload({
      authorization,
      executionPolicy,
      executionId: receipt.executionId,
      executor,
      handler: trustedHandler,
      result,
      startedAt: receipt.startedAt,
      completedAt: receipt.completedAt,
    });
    for (const [key, expected] of Object.entries(payload)) {
      if (JSON.stringify(receipt[key]) !== JSON.stringify(expected)) throw new Error(`publication_execution_receipt_${key}_mismatch`);
    }
    if (receipt.signatureAlgorithm !== AUTHORIZED_PUBLICATION_EXECUTION_SIGNATURE_ALGORITHM || typeof receipt.signature !== "string") throw new Error("publication_execution_receipt_signature_invalid");
    if (!cryptoVerify(null, bytes(payload), executor.publicKeyPem, Buffer.from(receipt.signature, "base64url"))) throw new Error("publication_execution_receipt_signature_verification_failed");
    if (receipt.authorizationConsumed !== true || receipt.publicationProofExecuted !== true || receipt.packageGenerated !== true) throw new Error("publication_execution_receipt_contract_invalid");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (receipt[key] !== false) throw new Error(`publication_execution_receipt_${key}_must_be_false`);
    }
    const hashPayload = { ...receipt };
    delete hashPayload.receiptHash;
    if (digest(hashPayload) !== receipt.receiptHash) throw new Error("publication_execution_receipt_hash_mismatch");
    if (!executionMemory.entries.some((entry) => entry.receiptHash === receipt.receiptHash && entry.authorizationHash === authorization.authorizationHash)) {
      throw new Error("publication_execution_receipt_not_recorded");
    }
    return {
      ok: true,
      receiptHash: receipt.receiptHash,
      status: receipt.status,
      authorizationConsumed: true,
      publicationProofExecuted: true,
      publicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "publication_execution_receipt_invalid" };
  }
}
