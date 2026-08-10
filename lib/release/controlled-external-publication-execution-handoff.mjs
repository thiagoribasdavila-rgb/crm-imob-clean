import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION_RECEIPT_SCHEMA,
  inspectControlledExternalPublicationAuthorizationConsumptionMemory,
  inspectControlledExternalPublicationAuthorizationConsumptionPolicy,
  inspectControlledExternalPublicationAuthorizationConsumptionReceipt,
} from "./controlled-external-publication-authorization-consumption.mjs";

export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_POLICY_SCHEMA = "atlas.controlled-external-publication-execution-handoff-policy.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_RECEIPT_SCHEMA = "atlas.controlled-external-publication-execution-handoff-receipt.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_MEMORY_SCHEMA = "atlas.controlled-external-publication-execution-handoff-memory.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_MEMORY_ENTRY_SCHEMA = "atlas.controlled-external-publication-execution-handoff-memory-entry.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_ISSUER_ROLE = "release-external-publication-execution-handoff-issuer";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTOR_ROLE = "release-external-publication-executor";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_SIGNATURE_ALGORITHM = "ed25519";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_MAX_LIFETIME_MS = 300_000;

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

function normalizeActor(value, { kind, role }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`external_publication_execution_${kind}_invalid`);
  assertSlug(value.keyId, `external_publication_execution_${kind}_key_id`);
  assertSlug(value.actorId, `external_publication_execution_${kind}_actor_id`);
  if (value.role !== role) throw new Error(`external_publication_execution_${kind}_role_invalid`);
  if (!["active", "inactive"].includes(value.status)) throw new Error(`external_publication_execution_${kind}_status_invalid`);
  assertIso(value.validFrom, `external_publication_execution_${kind}_valid_from`);
  assertIso(value.validUntil, `external_publication_execution_${kind}_valid_until`);
  if (Date.parse(value.validUntil) <= Date.parse(value.validFrom)) throw new Error(`external_publication_execution_${kind}_validity_invalid`);
  try {
    const key = createPublicKey(value.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch {
    throw new Error(`external_publication_execution_${kind}_public_key_invalid`);
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

function consumptionPolicyContext({ grantPolicy, reviewPolicy, publicationEvidenceAdjudicationPolicy, decisionContext }) {
  return {
    controlledExternalPublicationAuthorizationGrantPolicy: grantPolicy,
    controlledExternalPublicationReviewPolicy: reviewPolicy,
    publicationEvidenceAdjudicationPolicy,
    executionPolicy: decisionContext.executionPolicy,
    executionAuthorizationPolicy: decisionContext.executionAuthorizationPolicy,
    publicationPolicy: decisionContext.publicationPolicy,
    evidencePolicy: decisionContext.evidencePolicy,
    assemblyPolicy: decisionContext.assemblyPolicy,
    packageAuthorizationPolicy: decisionContext.packageAuthorizationPolicy,
  };
}

function priorIdentities({ consumptionPolicy, grantPolicy, reviewPolicy, publicationEvidenceAdjudicationPolicy, decisionContext }) {
  return new Set([
    ...(consumptionPolicy.trustedConsumers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(grantPolicy.trustedGrantors ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(reviewPolicy.trustedReviewers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(publicationEvidenceAdjudicationPolicy.trustedAdjudicators ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(decisionContext.executionPolicy.trustedExecutors ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(decisionContext.executionAuthorizationPolicy.trustedExecutionAuthorizers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(decisionContext.publicationPolicy.trustedPublicationDirectors ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(decisionContext.evidencePolicy.trustedEvidenceCustodians ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(decisionContext.assemblyPolicy.trustedPackageAssemblers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(decisionContext.packageAuthorizationPolicy.trustedPackageAuthorizers ?? []).flatMap((item) => [item.keyId, item.actorId]),
  ]);
}

function verifyConsumptionPolicy({ consumptionPolicy, grantPolicy, reviewPolicy, publicationEvidenceAdjudicationPolicy, decisionContext }) {
  const inspection = inspectControlledExternalPublicationAuthorizationConsumptionPolicy(consumptionPolicy, consumptionPolicyContext({ grantPolicy, reviewPolicy, publicationEvidenceAdjudicationPolicy, decisionContext }));
  if (!inspection.ok) throw new Error(`external_publication_authorization_consumption_policy_invalid:${inspection.reason}`);
}

export function createControlledExternalPublicationExecutionHandoffPolicy({
  controlledExternalPublicationAuthorizationConsumptionPolicy: consumptionPolicy,
  controlledExternalPublicationAuthorizationGrantPolicy: grantPolicy,
  controlledExternalPublicationReviewPolicy: reviewPolicy,
  publicationEvidenceAdjudicationPolicy,
  executionPolicy,
  executionAuthorizationPolicy,
  publicationPolicy,
  evidencePolicy,
  assemblyPolicy,
  packageAuthorizationPolicy,
  trustedHandoffIssuers = [],
  trustedExternalExecutors = [],
  maximumHandoffLifetimeMs = CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_MAX_LIFETIME_MS,
}) {
  const decisionContext = { executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy };
  verifyConsumptionPolicy({ consumptionPolicy, grantPolicy, reviewPolicy, publicationEvidenceAdjudicationPolicy, decisionContext });
  if (!Array.isArray(trustedHandoffIssuers)) throw new Error("trusted_external_publication_execution_handoff_issuers_invalid");
  if (!Array.isArray(trustedExternalExecutors)) throw new Error("trusted_external_publication_executors_invalid");
  if (!Number.isSafeInteger(maximumHandoffLifetimeMs) || maximumHandoffLifetimeMs < 1 || maximumHandoffLifetimeMs > CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_MAX_LIFETIME_MS) throw new Error("external_publication_execution_handoff_maximum_lifetime_invalid");
  const issuers = trustedHandoffIssuers.map((item) => normalizeActor(item, { kind: "handoff_issuer", role: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_ISSUER_ROLE })).sort((a, b) => a.keyId.localeCompare(b.keyId));
  const executors = trustedExternalExecutors.map((item) => normalizeActor(item, { kind: "executor", role: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTOR_ROLE })).sort((a, b) => a.keyId.localeCompare(b.keyId));
  for (const [items, kind] of [[issuers, "handoff_issuer"], [executors, "executor"]]) {
    if (new Set(items.map((item) => item.keyId)).size !== items.length) throw new Error(`duplicate_external_publication_execution_${kind}_key_id`);
    if (new Set(items.map((item) => item.actorId)).size !== items.length) throw new Error(`duplicate_external_publication_execution_${kind}_actor_id`);
  }
  const forbidden = priorIdentities({ consumptionPolicy, grantPolicy, reviewPolicy, publicationEvidenceAdjudicationPolicy, decisionContext });
  if ([...issuers, ...executors].some((item) => forbidden.has(item.keyId) || forbidden.has(item.actorId))) throw new Error("external_publication_execution_handoff_actors_must_be_independent");
  const issuerIdentities = new Set(issuers.flatMap((item) => [item.keyId, item.actorId]));
  if (executors.some((item) => issuerIdentities.has(item.keyId) || issuerIdentities.has(item.actorId))) throw new Error("handoff_issuer_and_external_executor_must_be_independent");
  const payload = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_POLICY_SCHEMA,
    compositionId: consumptionPolicy.compositionId,
    compositionDecisionHash: consumptionPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: consumptionPolicy.publicationDecisionPolicyHash,
    executionAuthorizationPolicyHash: consumptionPolicy.executionAuthorizationPolicyHash,
    executionPolicyHash: consumptionPolicy.executionPolicyHash,
    evidenceAdjudicationPolicyHash: consumptionPolicy.evidenceAdjudicationPolicyHash,
    authorizationReviewPolicyHash: consumptionPolicy.authorizationReviewPolicyHash,
    authorizationGrantPolicyHash: consumptionPolicy.authorizationGrantPolicyHash,
    authorizationConsumptionPolicyHash: consumptionPolicy.policyHash,
    requiredConsumptionReceiptSchema: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION_RECEIPT_SCHEMA,
    requiredConsumptionMemoryEntrySchema: "atlas.controlled-external-publication-authorization-consumption-memory-entry.v1",
    requiredMemoryEntrySchema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_MEMORY_ENTRY_SCHEMA,
    handoffIssuerRole: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_ISSUER_ROLE,
    externalExecutorRole: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTOR_ROLE,
    signatureAlgorithm: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_SIGNATURE_ALGORITHM,
    trustedHandoffIssuers: issuers,
    trustedExternalExecutors: executors,
    maximumHandoffLifetimeMs,
    recordedConsumedAuthorizationRequired: true,
    exactConsumptionReceiptBindingRequired: true,
    exactConsumptionMemoryBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    independentHandoffIssuerRequired: true,
    independentExternalExecutorRequired: true,
    signedExecutionHandoffRequired: true,
    appendOnlyHandoffMemoryRequired: true,
    duplicateConsumptionHandoffRejected: true,
    atomicMemoryHeadBindingRequired: true,
    executionHandoffPreparationAllowed: true,
    executionAcceptanceAllowed: false,
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

export function inspectControlledExternalPublicationExecutionHandoffPolicy(policy, context) {
  try {
    const recreated = createControlledExternalPublicationExecutionHandoffPolicy({
      ...context,
      trustedHandoffIssuers: policy?.trustedHandoffIssuers,
      trustedExternalExecutors: policy?.trustedExternalExecutors,
      maximumHandoffLifetimeMs: policy?.maximumHandoffLifetimeMs,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "external_publication_execution_handoff_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "external_publication_execution_handoff_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedHandoffIssuers: recreated.trustedHandoffIssuers.length, trustedExternalExecutors: recreated.trustedExternalExecutors.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_execution_handoff_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedHandoffs: entries.length,
      distinctConsumedAuthorizations: new Set(entries.map((entry) => entry.consumptionReceiptHash)).size,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      handoffPrepared: entries.length > 0,
      executionAccepted: false,
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

export function createControlledExternalPublicationExecutionHandoffMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_POLICY_SCHEMA) throw new Error("external_publication_execution_handoff_memory_policy_invalid");
  if (!Array.isArray(entries)) throw new Error("external_publication_execution_handoff_memory_entries_invalid");
  let previousEntryHash = null;
  const receiptHashes = new Set();
  const handoffIds = new Set();
  const nonces = new Set();
  const normalized = [];
  for (const [index, entry] of entries.entries()) {
    if (entry?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_MEMORY_ENTRY_SCHEMA) throw new Error("external_publication_execution_handoff_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("external_publication_execution_handoff_memory_chain_invalid");
    for (const field of ["handoffReceiptHash", "handoffPolicyHash", "handoffMemoryHashBefore", "consumptionReceiptHash", "consumptionPolicyHash", "consumptionMemoryHash", "grantHash", "packageSha256", "inventoryHash"]) assertHash(entry[field], `external_publication_execution_handoff_memory_${field}`);
    assertSlug(entry.handoffId, "external_publication_execution_handoff_memory_handoff_id");
    assertSlug(entry.nonce, "external_publication_execution_handoff_memory_nonce");
    assertIso(entry.issuedAt, "external_publication_execution_handoff_memory_issued_at");
    assertIso(entry.expiresAt, "external_publication_execution_handoff_memory_expires_at");
    if (entry.handoffPolicyHash !== policy.policyHash) throw new Error("external_publication_execution_handoff_memory_policy_hash_mismatch");
    if (entry.handoffMemoryHashBefore !== memoryHashForEntries(policy, normalized)) throw new Error("external_publication_execution_handoff_memory_head_binding_mismatch");
    if (receiptHashes.has(entry.consumptionReceiptHash)) throw new Error("external_publication_execution_consumption_handoff_already_recorded");
    if (handoffIds.has(entry.handoffId)) throw new Error("external_publication_execution_handoff_duplicate_handoff_id");
    if (nonces.has(entry.nonce)) throw new Error("external_publication_execution_handoff_duplicate_nonce");
    if (entry.authorizationConsumed !== true || entry.handoffPrepared !== true || entry.handoffRecorded !== true || entry.executionAccepted !== false) throw new Error("external_publication_execution_handoff_memory_contract_invalid");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) if (entry[key] !== false) throw new Error(`external_publication_execution_handoff_memory_${key}_must_be_false`);
    const hashPayload = { ...entry };
    delete hashPayload.entryHash;
    if (digest(hashPayload) !== entry.entryHash) throw new Error("external_publication_execution_handoff_memory_entry_hash_mismatch");
    normalized.push({ ...entry });
    receiptHashes.add(entry.consumptionReceiptHash);
    handoffIds.add(entry.handoffId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledExternalPublicationExecutionHandoffMemory(memory, { policy }) {
  try {
    const recreated = createControlledExternalPublicationExecutionHandoffMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "external_publication_execution_handoff_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "external_publication_execution_handoff_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, recordedHandoffs: recreated.entries.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_execution_handoff_memory_invalid" };
  }
}

function policyContextFromArguments(args) {
  return {
    controlledExternalPublicationAuthorizationConsumptionPolicy: args.controlledExternalPublicationAuthorizationConsumptionPolicy,
    controlledExternalPublicationAuthorizationGrantPolicy: args.controlledExternalPublicationAuthorizationGrantPolicy,
    controlledExternalPublicationReviewPolicy: args.controlledExternalPublicationReviewPolicy,
    publicationEvidenceAdjudicationPolicy: args.publicationEvidenceAdjudicationPolicy,
    // The upstream chain still uses `executionPolicy` for the original gate
    // executor.  The publication executor policy is carried explicitly as
    // `authorizedPublicationExecutionPolicy`; keeping both identities intact
    // prevents the handoff verifier from corrupting the earlier trust chain.
    executionPolicy: args.authorizedPublicationExecutionPolicy,
    executionAuthorizationPolicy: args.executionAuthorizationPolicy,
    publicationPolicy: args.publicationPolicy,
    evidencePolicy: args.evidencePolicy,
    assemblyPolicy: args.assemblyPolicy,
    packageAuthorizationPolicy: args.packageAuthorizationPolicy,
  };
}

function verifyContext(args) {
  const policyInspection = inspectControlledExternalPublicationExecutionHandoffPolicy(args.controlledExternalPublicationExecutionHandoffPolicy, policyContextFromArguments(args));
  if (!policyInspection.ok) throw new Error(`external_publication_execution_handoff_policy_invalid:${policyInspection.reason}`);
  const handoffMemoryInspection = inspectControlledExternalPublicationExecutionHandoffMemory(args.controlledExternalPublicationExecutionHandoffMemory, { policy: args.controlledExternalPublicationExecutionHandoffPolicy });
  if (!handoffMemoryInspection.ok) throw new Error(`external_publication_execution_handoff_memory_invalid:${handoffMemoryInspection.reason}`);
  const consumptionMemoryInspection = inspectControlledExternalPublicationAuthorizationConsumptionMemory(args.controlledExternalPublicationAuthorizationConsumptionMemory, { policy: args.controlledExternalPublicationAuthorizationConsumptionPolicy });
  if (!consumptionMemoryInspection.ok) throw new Error(`external_publication_authorization_consumption_memory_invalid:${consumptionMemoryInspection.reason}`);
}

function inspectConsumption(receipt, args) {
  const inspection = inspectControlledExternalPublicationAuthorizationConsumptionReceipt(receipt, args);
  if (!inspection.ok) throw new Error(`external_publication_authorization_consumption_receipt_invalid:${inspection.reason}`);
  if (inspection.authorizationConsumed !== true || inspection.remainingUses !== 0 || inspection.externalPublicationExecuted !== false) throw new Error("recorded_consumed_authorization_required_for_handoff");
  return inspection;
}

function validateWindow({ receipt, issuer, executor, issuedAt, expiresAt, maximumHandoffLifetimeMs }) {
  assertIso(issuedAt, "external_publication_execution_handoff_issued_at");
  assertIso(expiresAt, "external_publication_execution_handoff_expires_at");
  const issued = Date.parse(issuedAt);
  const expires = Date.parse(expiresAt);
  if (issued < Date.parse(receipt.consumedAt)) throw new Error("external_publication_execution_handoff_before_authorization_consumption");
  if (expires <= issued || expires - issued > maximumHandoffLifetimeMs) throw new Error("external_publication_execution_handoff_expiration_invalid");
  for (const [actor, kind] of [[issuer, "handoff_issuer"], [executor, "executor"]]) {
    if (actor.status !== "active") throw new Error(`external_publication_execution_${kind}_inactive`);
    if (issued < Date.parse(actor.validFrom) || expires > Date.parse(actor.validUntil)) throw new Error(`external_publication_execution_${kind}_key_outside_validity`);
  }
}

function signingPayload({ receipt, consumptionMemory, handoffPolicy, handoffMemoryHashBefore, handoffId, issuer, executor, issuedAt, expiresAt, nonce }) {
  if (!consumptionMemory.entries.some((entry) => entry.consumptionReceiptHash === receipt.consumptionReceiptHash)) throw new Error("external_publication_authorization_consumption_not_recorded_for_handoff");
  return {
    signingSchema: "atlas.controlled-external-publication-execution-handoff-signing-payload.v1",
    compositionId: receipt.compositionId,
    compositionDecisionHash: receipt.compositionDecisionHash,
    publicationDecisionHash: receipt.publicationDecisionHash,
    evidenceDecisionHash: receipt.evidenceDecisionHash,
    authorizationGrantHash: receipt.grantHash,
    authorizationConsumptionReceiptHash: receipt.consumptionReceiptHash,
    authorizationConsumptionPolicyHash: receipt.consumptionPolicyHash,
    authorizationConsumptionMemoryHash: consumptionMemory.memoryHash,
    packageSha256: receipt.packageSha256,
    inventoryHash: receipt.inventoryHash,
    handoffPolicyHash: handoffPolicy.policyHash,
    handoffMemoryHashBefore,
    handoffId,
    handoffIssuerKeyId: issuer.keyId,
    handoffIssuerActorId: issuer.actorId,
    handoffIssuerRole: issuer.role,
    externalExecutorKeyId: executor.keyId,
    externalExecutorActorId: executor.actorId,
    externalExecutorRole: executor.role,
    authorizationConsumed: true,
    handoffPrepared: true,
    executionAccepted: false,
    issuedAt,
    expiresAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("external_publication_execution_handoff_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_external_publication_execution_handoff_issuer");
  return signature;
}

export function createControlledExternalPublicationExecutionHandoff({
  controlledExternalPublicationAuthorizationConsumptionReceipt: receipt,
  controlledExternalPublicationAuthorizationConsumptionMemory: consumptionMemory,
  controlledExternalPublicationExecutionHandoffPolicy: handoffPolicy,
  controlledExternalPublicationExecutionHandoffMemory: handoffMemory,
  handoffId,
  handoffIssuerKeyId,
  handoffIssuerPrivateKey,
  externalExecutorKeyId,
  issuedAt,
  expiresAt,
  nonce,
  ...upstream
}) {
  const args = { ...upstream, controlledExternalPublicationAuthorizationConsumptionMemory: consumptionMemory, controlledExternalPublicationExecutionHandoffPolicy: handoffPolicy, controlledExternalPublicationExecutionHandoffMemory: handoffMemory };
  verifyContext(args);
  inspectConsumption(receipt, { ...upstream, controlledExternalPublicationAuthorizationConsumptionMemory: consumptionMemory });
  assertSlug(handoffId, "external_publication_execution_handoff_id");
  assertSlug(handoffIssuerKeyId, "external_publication_execution_handoff_issuer_key_id");
  assertSlug(externalExecutorKeyId, "external_publication_execution_executor_key_id");
  assertSlug(nonce, "external_publication_execution_handoff_nonce");
  if (handoffMemory.entries.some((entry) => entry.consumptionReceiptHash === receipt.consumptionReceiptHash)) throw new Error("external_publication_execution_consumption_handoff_already_recorded");
  if (handoffMemory.entries.some((entry) => entry.handoffId === handoffId)) throw new Error("external_publication_execution_handoff_duplicate_handoff_id");
  if (handoffMemory.entries.some((entry) => entry.nonce === nonce)) throw new Error("external_publication_execution_handoff_duplicate_nonce");
  const issuer = handoffPolicy.trustedHandoffIssuers.find((item) => item.keyId === handoffIssuerKeyId);
  const executor = handoffPolicy.trustedExternalExecutors.find((item) => item.keyId === externalExecutorKeyId);
  if (!issuer) throw new Error("external_publication_execution_handoff_issuer_untrusted");
  if (!executor) throw new Error("external_publication_execution_executor_untrusted");
  if (issuer.keyId === executor.keyId || issuer.actorId === executor.actorId) throw new Error("handoff_issuer_and_external_executor_must_be_independent");
  validateWindow({ receipt, issuer, executor, issuedAt, expiresAt, maximumHandoffLifetimeMs: handoffPolicy.maximumHandoffLifetimeMs });
  const handoffMemoryHashBefore = handoffMemory.memoryHash;
  const payload = signingPayload({ receipt, consumptionMemory, handoffPolicy, handoffMemoryHashBefore, handoffId, issuer, executor, issuedAt, expiresAt, nonce });
  const signature = signPayload(payload, handoffIssuerPrivateKey, issuer.publicKeyPem);
  const receiptValue = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_RECEIPT_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_SIGNATURE_ALGORITHM,
    handoffRecorded: true,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const handoffReceipt = { ...receiptValue, handoffReceiptHash: digest(receiptValue) };
  const entryPayload = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_MEMORY_ENTRY_SCHEMA,
    sequence: handoffMemory.entries.length + 1,
    previousEntryHash: handoffMemory.entries.at(-1)?.entryHash ?? null,
    handoffReceiptHash: handoffReceipt.handoffReceiptHash,
    handoffPolicyHash: handoffPolicy.policyHash,
    handoffMemoryHashBefore,
    consumptionReceiptHash: receipt.consumptionReceiptHash,
    consumptionPolicyHash: receipt.consumptionPolicyHash,
    consumptionMemoryHash: consumptionMemory.memoryHash,
    grantHash: receipt.grantHash,
    packageSha256: receipt.packageSha256,
    inventoryHash: receipt.inventoryHash,
    handoffId,
    handoffIssuerActorId: issuer.actorId,
    externalExecutorActorId: executor.actorId,
    authorizationConsumed: true,
    handoffPrepared: true,
    handoffRecorded: true,
    executionAccepted: false,
    issuedAt,
    expiresAt,
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
    handoffReceipt,
    controlledExternalPublicationExecutionHandoffMemory: createControlledExternalPublicationExecutionHandoffMemory({ policy: handoffPolicy, entries: [...handoffMemory.entries, entry] }),
  };
}

export function inspectControlledExternalPublicationExecutionHandoffReceipt(receipt, {
  controlledExternalPublicationAuthorizationConsumptionReceipt: consumptionReceipt,
  controlledExternalPublicationAuthorizationConsumptionMemory: consumptionMemory,
  controlledExternalPublicationExecutionHandoffPolicy: handoffPolicy,
  controlledExternalPublicationExecutionHandoffMemory: handoffMemory,
  ...upstream
}) {
  try {
    if (receipt?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_RECEIPT_SCHEMA) throw new Error("external_publication_execution_handoff_receipt_schema_invalid");
    const args = { ...upstream, controlledExternalPublicationAuthorizationConsumptionMemory: consumptionMemory, controlledExternalPublicationExecutionHandoffPolicy: handoffPolicy, controlledExternalPublicationExecutionHandoffMemory: handoffMemory };
    verifyContext(args);
    inspectConsumption(consumptionReceipt, { ...upstream, controlledExternalPublicationAuthorizationConsumptionMemory: consumptionMemory });
    const issuer = handoffPolicy.trustedHandoffIssuers.find((item) => item.keyId === receipt.handoffIssuerKeyId);
    const executor = handoffPolicy.trustedExternalExecutors.find((item) => item.keyId === receipt.externalExecutorKeyId);
    if (!issuer) throw new Error("external_publication_execution_handoff_issuer_untrusted");
    if (!executor) throw new Error("external_publication_execution_executor_untrusted");
    validateWindow({ receipt: consumptionReceipt, issuer, executor, issuedAt: receipt.issuedAt, expiresAt: receipt.expiresAt, maximumHandoffLifetimeMs: handoffPolicy.maximumHandoffLifetimeMs });
    const entryIndex = handoffMemory.entries.findIndex((entry) => entry.handoffReceiptHash === receipt.handoffReceiptHash);
    if (entryIndex < 0) throw new Error("external_publication_execution_handoff_not_recorded");
    const handoffMemoryHashBefore = memoryHashForEntries(handoffPolicy, handoffMemory.entries.slice(0, entryIndex));
    const payload = signingPayload({ receipt: consumptionReceipt, consumptionMemory, handoffPolicy, handoffMemoryHashBefore, handoffId: receipt.handoffId, issuer, executor, issuedAt: receipt.issuedAt, expiresAt: receipt.expiresAt, nonce: receipt.nonce });
    for (const [key, expected] of Object.entries(payload)) if (JSON.stringify(receipt[key]) !== JSON.stringify(expected)) throw new Error(`external_publication_execution_handoff_${key}_mismatch`);
    if (receipt.signatureAlgorithm !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_SIGNATURE_ALGORITHM || typeof receipt.signature !== "string") throw new Error("external_publication_execution_handoff_signature_invalid");
    if (!cryptoVerify(null, bytes(payload), issuer.publicKeyPem, Buffer.from(receipt.signature, "base64url"))) throw new Error("external_publication_execution_handoff_signature_verification_failed");
    if (receipt.authorizationConsumed !== true || receipt.handoffPrepared !== true || receipt.handoffRecorded !== true || receipt.executionAccepted !== false) throw new Error("external_publication_execution_handoff_receipt_contract_invalid");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) if (receipt[key] !== false) throw new Error(`external_publication_execution_handoff_${key}_must_be_false`);
    const hashPayload = { ...receipt };
    delete hashPayload.handoffReceiptHash;
    if (digest(hashPayload) !== receipt.handoffReceiptHash) throw new Error("external_publication_execution_handoff_receipt_hash_mismatch");
    const entry = handoffMemory.entries[entryIndex];
    if (entry.consumptionReceiptHash !== consumptionReceipt.consumptionReceiptHash || entry.handoffMemoryHashBefore !== handoffMemoryHashBefore) throw new Error("external_publication_execution_handoff_memory_entry_mismatch");
    return { ok: true, handoffReceiptHash: receipt.handoffReceiptHash, consumptionReceiptHash: receipt.authorizationConsumptionReceiptHash, handoffPrepared: true, executionAccepted: false, externalPublicationExecuted: false };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_execution_handoff_receipt_invalid" };
  }
}
