import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT_SCHEMA,
  inspectControlledExternalPublicationAuthorizationGrant,
  inspectControlledExternalPublicationAuthorizationGrantMemory,
  inspectControlledExternalPublicationAuthorizationGrantPolicy,
} from "./controlled-external-publication-authorization-grant.mjs";

export const CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION_POLICY_SCHEMA = "atlas.controlled-external-publication-authorization-consumption-policy.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION_RECEIPT_SCHEMA = "atlas.controlled-external-publication-authorization-consumption-receipt.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION_MEMORY_SCHEMA = "atlas.controlled-external-publication-authorization-consumption-memory.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION_MEMORY_ENTRY_SCHEMA = "atlas.controlled-external-publication-authorization-consumption-memory-entry.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMER_ROLE = "release-external-publication-authorization-consumer";
export const CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION_SIGNATURE_ALGORITHM = "ed25519";

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

function normalizeConsumer(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("external_publication_authorization_consumer_invalid");
  assertSlug(value.keyId, "external_publication_authorization_consumer_key_id");
  assertSlug(value.actorId, "external_publication_authorization_consumer_actor_id");
  if (value.role !== CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMER_ROLE) throw new Error("external_publication_authorization_consumer_role_invalid");
  if (!["active", "inactive"].includes(value.status)) throw new Error("external_publication_authorization_consumer_status_invalid");
  assertIso(value.validFrom, "external_publication_authorization_consumer_valid_from");
  assertIso(value.validUntil, "external_publication_authorization_consumer_valid_until");
  if (Date.parse(value.validUntil) <= Date.parse(value.validFrom)) throw new Error("external_publication_authorization_consumer_validity_invalid");
  try {
    const key = createPublicKey(value.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch {
    throw new Error("external_publication_authorization_consumer_public_key_invalid");
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

function grantPolicyContext(context) {
  return {
    controlledExternalPublicationReviewPolicy: context.controlledExternalPublicationReviewPolicy,
    publicationEvidenceAdjudicationPolicy: context.publicationEvidenceAdjudicationPolicy,
    executionPolicy: context.executionPolicy,
    executionAuthorizationPolicy: context.executionAuthorizationPolicy,
    publicationPolicy: context.publicationPolicy,
    evidencePolicy: context.evidencePolicy,
    assemblyPolicy: context.assemblyPolicy,
    packageAuthorizationPolicy: context.packageAuthorizationPolicy,
  };
}

function priorIdentities({ grantPolicy, reviewPolicy, publicationEvidenceAdjudicationPolicy, executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy }) {
  return new Set([
    ...(grantPolicy.trustedGrantors ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(reviewPolicy.trustedReviewers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(publicationEvidenceAdjudicationPolicy.trustedAdjudicators ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(executionPolicy.trustedExecutors ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(executionAuthorizationPolicy.trustedExecutionAuthorizers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(publicationPolicy.trustedPublicationDirectors ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(evidencePolicy.trustedEvidenceCustodians ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(assemblyPolicy.trustedPackageAssemblers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(packageAuthorizationPolicy.trustedPackageAuthorizers ?? []).flatMap((item) => [item.keyId, item.actorId]),
  ]);
}

function verifyGrantPolicy(grantPolicy, context) {
  const inspection = inspectControlledExternalPublicationAuthorizationGrantPolicy(grantPolicy, grantPolicyContext(context));
  if (!inspection.ok) throw new Error(`external_publication_authorization_grant_policy_invalid:${inspection.reason}`);
}

export function createControlledExternalPublicationAuthorizationConsumptionPolicy({
  controlledExternalPublicationAuthorizationGrantPolicy: grantPolicy,
  controlledExternalPublicationReviewPolicy: reviewPolicy,
  publicationEvidenceAdjudicationPolicy,
  executionPolicy,
  executionAuthorizationPolicy,
  publicationPolicy,
  evidencePolicy,
  assemblyPolicy,
  packageAuthorizationPolicy,
  trustedConsumers = [],
}) {
  const context = { controlledExternalPublicationReviewPolicy: reviewPolicy, publicationEvidenceAdjudicationPolicy, executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy };
  verifyGrantPolicy(grantPolicy, context);
  if (!Array.isArray(trustedConsumers)) throw new Error("trusted_external_publication_authorization_consumers_invalid");
  const consumers = trustedConsumers.map(normalizeConsumer).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(consumers.map((item) => item.keyId)).size !== consumers.length) throw new Error("duplicate_external_publication_authorization_consumer_key_id");
  if (new Set(consumers.map((item) => item.actorId)).size !== consumers.length) throw new Error("duplicate_external_publication_authorization_consumer_actor_id");
  const forbidden = priorIdentities({ grantPolicy, reviewPolicy, publicationEvidenceAdjudicationPolicy, executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy });
  if (consumers.some((item) => forbidden.has(item.keyId) || forbidden.has(item.actorId))) throw new Error("external_publication_authorization_consumer_must_be_independent");
  const payload = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION_POLICY_SCHEMA,
    compositionId: grantPolicy.compositionId,
    compositionDecisionHash: grantPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: grantPolicy.publicationDecisionPolicyHash,
    executionAuthorizationPolicyHash: grantPolicy.executionAuthorizationPolicyHash,
    executionPolicyHash: grantPolicy.executionPolicyHash,
    evidenceAdjudicationPolicyHash: grantPolicy.evidenceAdjudicationPolicyHash,
    authorizationReviewPolicyHash: grantPolicy.authorizationReviewPolicyHash,
    authorizationGrantPolicyHash: grantPolicy.policyHash,
    requiredGrantSchema: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT_SCHEMA,
    requiredGrantMemoryEntrySchema: "atlas.controlled-external-publication-authorization-grant-memory-entry.v1",
    requiredMemoryEntrySchema: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION_MEMORY_ENTRY_SCHEMA,
    consumerRole: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMER_ROLE,
    signatureAlgorithm: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION_SIGNATURE_ALGORITHM,
    trustedConsumers: consumers,
    authorizedRecordedUnexpiredGrantRequired: true,
    exactGrantBindingRequired: true,
    exactGrantMemoryBindingRequired: true,
    exactReviewBindingRequired: true,
    exactEvidenceDecisionBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    independentAuthorizationConsumerRequired: true,
    signedConsumptionReceiptRequired: true,
    appendOnlyConsumptionMemoryRequired: true,
    duplicateGrantConsumptionRejected: true,
    atomicMemoryHeadBindingRequired: true,
    singleUseConsumptionRequired: true,
    maximumUses: 1,
    externalPublicationAuthorizationConsumptionAllowed: true,
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

export function inspectControlledExternalPublicationAuthorizationConsumptionPolicy(policy, context) {
  try {
    const recreated = createControlledExternalPublicationAuthorizationConsumptionPolicy({
      ...context,
      trustedConsumers: policy?.trustedConsumers,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "external_publication_authorization_consumption_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "external_publication_authorization_consumption_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedConsumers: recreated.trustedConsumers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_authorization_consumption_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedConsumptions: entries.length,
      consumedSingleUseGrants: entries.filter((entry) => entry.authorizationConsumed).length,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      authorizationConsumed: entries.length > 0,
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

export function createControlledExternalPublicationAuthorizationConsumptionMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION_POLICY_SCHEMA) throw new Error("external_publication_authorization_consumption_memory_policy_invalid");
  if (!Array.isArray(entries)) throw new Error("external_publication_authorization_consumption_memory_entries_invalid");
  let previousEntryHash = null;
  const grantHashes = new Set();
  const consumptionIds = new Set();
  const nonces = new Set();
  const normalized = [];
  for (const [index, entry] of entries.entries()) {
    if (entry?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION_MEMORY_ENTRY_SCHEMA) throw new Error("external_publication_authorization_consumption_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("external_publication_authorization_consumption_memory_chain_invalid");
    for (const field of ["consumptionReceiptHash", "consumptionPolicyHash", "consumptionMemoryHashBefore", "grantHash", "grantPolicyHash", "grantMemoryHash", "reviewHash", "evidenceDecisionHash", "packageSha256", "inventoryHash"]) assertHash(entry[field], `external_publication_authorization_consumption_memory_${field}`);
    assertSlug(entry.consumptionId, "external_publication_authorization_consumption_memory_consumption_id");
    assertSlug(entry.grantId, "external_publication_authorization_consumption_memory_grant_id");
    assertSlug(entry.nonce, "external_publication_authorization_consumption_memory_nonce");
    assertIso(entry.consumedAt, "external_publication_authorization_consumption_memory_consumed_at");
    if (entry.consumptionPolicyHash !== policy.policyHash) throw new Error("external_publication_authorization_consumption_memory_policy_hash_mismatch");
    if (entry.consumptionMemoryHashBefore !== memoryHashForEntries(policy, normalized)) throw new Error("external_publication_authorization_consumption_memory_head_binding_mismatch");
    if (grantHashes.has(entry.grantHash)) throw new Error("external_publication_authorization_grant_already_consumed");
    if (consumptionIds.has(entry.consumptionId)) throw new Error("external_publication_authorization_consumption_duplicate_consumption_id");
    if (nonces.has(entry.nonce)) throw new Error("external_publication_authorization_consumption_duplicate_nonce");
    if (entry.singleUse !== true || entry.maximumUses !== 1 || entry.remainingUses !== 0 || entry.authorizationConsumed !== true || entry.consumptionRecorded !== true) throw new Error("external_publication_authorization_consumption_memory_single_use_contract_invalid");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`external_publication_authorization_consumption_memory_${key}_must_be_false`);
    }
    const hashPayload = { ...entry };
    delete hashPayload.entryHash;
    if (digest(hashPayload) !== entry.entryHash) throw new Error("external_publication_authorization_consumption_memory_entry_hash_mismatch");
    normalized.push({ ...entry });
    grantHashes.add(entry.grantHash);
    consumptionIds.add(entry.consumptionId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledExternalPublicationAuthorizationConsumptionMemory(memory, { policy }) {
  try {
    const recreated = createControlledExternalPublicationAuthorizationConsumptionMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "external_publication_authorization_consumption_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "external_publication_authorization_consumption_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, recordedConsumptions: recreated.entries.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_authorization_consumption_memory_invalid" };
  }
}

function consumptionPolicyContext({ reviewPolicy, publicationEvidenceAdjudicationPolicy, decisionContext }) {
  return {
    controlledExternalPublicationReviewPolicy: reviewPolicy,
    publicationEvidenceAdjudicationPolicy,
    executionPolicy: decisionContext.authorizedPublicationExecutionPolicy,
    executionAuthorizationPolicy: decisionContext.executionAuthorizationPolicy,
    publicationPolicy: decisionContext.publicationPolicy,
    evidencePolicy: decisionContext.evidencePolicy,
    assemblyPolicy: decisionContext.assemblyPolicy,
    packageAuthorizationPolicy: decisionContext.packageAuthorizationPolicy,
  };
}

function verifyContext({ consumptionPolicy, consumptionMemory, grantPolicy, grantMemory, reviewPolicy, publicationEvidenceAdjudicationPolicy, decisionContext }) {
  const context = consumptionPolicyContext({ reviewPolicy, publicationEvidenceAdjudicationPolicy, decisionContext });
  const policyInspection = inspectControlledExternalPublicationAuthorizationConsumptionPolicy(consumptionPolicy, {
    controlledExternalPublicationAuthorizationGrantPolicy: grantPolicy,
    ...context,
  });
  if (!policyInspection.ok) throw new Error(`external_publication_authorization_consumption_policy_invalid:${policyInspection.reason}`);
  const memoryInspection = inspectControlledExternalPublicationAuthorizationConsumptionMemory(consumptionMemory, { policy: consumptionPolicy });
  if (!memoryInspection.ok) throw new Error(`external_publication_authorization_consumption_memory_invalid:${memoryInspection.reason}`);
  const grantMemoryInspection = inspectControlledExternalPublicationAuthorizationGrantMemory(grantMemory, { policy: grantPolicy });
  if (!grantMemoryInspection.ok) throw new Error(`external_publication_authorization_grant_memory_invalid:${grantMemoryInspection.reason}`);
}

function inspectGrant(grant, args) {
  const inspection = inspectControlledExternalPublicationAuthorizationGrant(grant, args);
  if (!inspection.ok) throw new Error(`external_publication_authorization_grant_invalid:${inspection.reason}`);
  if (inspection.outcome !== "granted" || inspection.externalPublicationAuthorized !== true || inspection.authorizationConsumed !== false || inspection.remainingUses !== 1) throw new Error("authorized_recorded_unexpired_grant_required_for_consumption");
  return inspection;
}

function validateConsumptionWindow(grant, consumer, consumedAt) {
  assertIso(consumedAt, "external_publication_authorization_consumed_at");
  const consumed = Date.parse(consumedAt);
  if (consumed < Date.parse(grant.grantedAt)) throw new Error("external_publication_authorization_consumption_before_grant");
  if (consumed >= Date.parse(grant.expiresAt)) throw new Error("external_publication_authorization_consumption_after_expiration");
  if (consumer.status !== "active") throw new Error("external_publication_authorization_consumer_inactive");
  if (consumed < Date.parse(consumer.validFrom) || consumed > Date.parse(consumer.validUntil)) throw new Error("external_publication_authorization_consumer_key_outside_validity");
}

function signingPayload({ grant, grantMemory, consumptionPolicy, consumptionMemoryHashBefore, consumptionId, consumer, consumedAt, nonce }) {
  if (!grantMemory.entries.some((entry) => entry.grantHash === grant.grantHash && entry.outcome === "granted")) throw new Error("external_publication_authorization_grant_not_recorded");
  return {
    signingSchema: "atlas.controlled-external-publication-authorization-consumption-signing-payload.v1",
    compositionId: grant.compositionId,
    compositionDecisionHash: grant.compositionDecisionHash,
    publicationDecisionHash: grant.publicationDecisionHash,
    evidenceDecisionHash: grant.evidenceDecisionHash,
    receiptHash: grant.receiptHash,
    packageSha256: grant.packageSha256,
    inventoryHash: grant.inventoryHash,
    reviewHash: grant.reviewHash,
    grantPolicyHash: grant.grantPolicyHash,
    grantMemoryHash: grantMemory.memoryHash,
    grantHash: grant.grantHash,
    grantId: grant.grantId,
    consumptionPolicyHash: consumptionPolicy.policyHash,
    consumptionMemoryHashBefore,
    consumptionId,
    consumerKeyId: consumer.keyId,
    consumerActorId: consumer.actorId,
    consumerRole: consumer.role,
    externalPublicationAuthorizationVerified: true,
    singleUse: true,
    maximumUses: 1,
    remainingUses: 0,
    authorizationConsumed: true,
    consumedAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("external_publication_authorization_consumption_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_external_publication_authorization_consumer");
  return signature;
}

export function consumeControlledExternalPublicationAuthorization({
  controlledExternalPublicationAuthorizationGrant: grant,
  controlledExternalPublicationAuthorizationGrantPolicy: grantPolicy,
  controlledExternalPublicationAuthorizationGrantMemory: grantMemory,
  controlledExternalPublicationAuthorizationReview: review,
  controlledExternalPublicationReviewPolicy: reviewPolicy,
  controlledExternalPublicationReviewMemory: reviewMemory,
  publicationEvidenceAdjudicationDecision,
  publicationEvidenceAdjudicationPolicy,
  publicationEvidenceAdjudicationMemory,
  controlledExternalPublicationAuthorizationConsumptionPolicy: consumptionPolicy,
  controlledExternalPublicationAuthorizationConsumptionMemory: consumptionMemory,
  consumptionId,
  consumerKeyId,
  consumerPrivateKey,
  consumedAt,
  nonce,
  ...decisionContext
}) {
  verifyContext({ consumptionPolicy, consumptionMemory, grantPolicy, grantMemory, reviewPolicy, publicationEvidenceAdjudicationPolicy, decisionContext });
  inspectGrant(grant, {
    controlledExternalPublicationAuthorizationReview: review,
    controlledExternalPublicationReviewPolicy: reviewPolicy,
    controlledExternalPublicationReviewMemory: reviewMemory,
    publicationEvidenceAdjudicationDecision,
    publicationEvidenceAdjudicationPolicy,
    publicationEvidenceAdjudicationMemory,
    controlledExternalPublicationAuthorizationGrantPolicy: grantPolicy,
    controlledExternalPublicationAuthorizationGrantMemory: grantMemory,
    ...decisionContext,
  });
  assertSlug(consumptionId, "external_publication_authorization_consumption_id");
  assertSlug(consumerKeyId, "external_publication_authorization_consumer_key_id");
  assertSlug(nonce, "external_publication_authorization_consumption_nonce");
  if (consumptionMemory.entries.some((entry) => entry.grantHash === grant.grantHash)) throw new Error("external_publication_authorization_grant_already_consumed");
  if (consumptionMemory.entries.some((entry) => entry.consumptionId === consumptionId)) throw new Error("external_publication_authorization_consumption_duplicate_consumption_id");
  if (consumptionMemory.entries.some((entry) => entry.nonce === nonce)) throw new Error("external_publication_authorization_consumption_duplicate_nonce");
  const consumer = consumptionPolicy.trustedConsumers.find((item) => item.keyId === consumerKeyId);
  if (!consumer) throw new Error("external_publication_authorization_consumer_untrusted");
  if (consumer.keyId === grant.grantorKeyId || consumer.actorId === grant.grantorActorId) throw new Error("authorization_grantor_cannot_consume_own_grant");
  validateConsumptionWindow(grant, consumer, consumedAt);
  const consumptionMemoryHashBefore = consumptionMemory.memoryHash;
  const payload = signingPayload({ grant, grantMemory, consumptionPolicy, consumptionMemoryHashBefore, consumptionId, consumer, consumedAt, nonce });
  const signature = signPayload(payload, consumerPrivateKey, consumer.publicKeyPem);
  const receiptValue = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION_RECEIPT_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION_SIGNATURE_ALGORITHM,
    consumptionRecorded: true,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const consumptionReceipt = { ...receiptValue, consumptionReceiptHash: digest(receiptValue) };
  const entryPayload = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION_MEMORY_ENTRY_SCHEMA,
    sequence: consumptionMemory.entries.length + 1,
    previousEntryHash: consumptionMemory.entries.at(-1)?.entryHash ?? null,
    consumptionReceiptHash: consumptionReceipt.consumptionReceiptHash,
    consumptionPolicyHash: consumptionPolicy.policyHash,
    consumptionMemoryHashBefore,
    consumptionId,
    nonce,
    grantHash: grant.grantHash,
    grantId: grant.grantId,
    grantPolicyHash: grant.grantPolicyHash,
    grantMemoryHash: grantMemory.memoryHash,
    reviewHash: grant.reviewHash,
    evidenceDecisionHash: grant.evidenceDecisionHash,
    packageSha256: grant.packageSha256,
    inventoryHash: grant.inventoryHash,
    consumerActorId: consumer.actorId,
    externalPublicationAuthorizationVerified: true,
    singleUse: true,
    maximumUses: 1,
    remainingUses: 0,
    authorizationConsumed: true,
    consumedAt,
    consumptionRecorded: true,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  const entry = { ...entryPayload, entryHash: digest(entryPayload) };
  return {
    consumptionReceipt,
    controlledExternalPublicationAuthorizationConsumptionMemory: createControlledExternalPublicationAuthorizationConsumptionMemory({ policy: consumptionPolicy, entries: [...consumptionMemory.entries, entry] }),
  };
}

export function inspectControlledExternalPublicationAuthorizationConsumptionReceipt(receipt, {
  controlledExternalPublicationAuthorizationGrant: grant,
  controlledExternalPublicationAuthorizationGrantPolicy: grantPolicy,
  controlledExternalPublicationAuthorizationGrantMemory: grantMemory,
  controlledExternalPublicationAuthorizationReview: review,
  controlledExternalPublicationReviewPolicy: reviewPolicy,
  controlledExternalPublicationReviewMemory: reviewMemory,
  publicationEvidenceAdjudicationDecision,
  publicationEvidenceAdjudicationPolicy,
  publicationEvidenceAdjudicationMemory,
  controlledExternalPublicationAuthorizationConsumptionPolicy: consumptionPolicy,
  controlledExternalPublicationAuthorizationConsumptionMemory: consumptionMemory,
  ...decisionContext
}) {
  try {
    if (receipt?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION_RECEIPT_SCHEMA) throw new Error("external_publication_authorization_consumption_receipt_schema_invalid");
    verifyContext({ consumptionPolicy, consumptionMemory, grantPolicy, grantMemory, reviewPolicy, publicationEvidenceAdjudicationPolicy, decisionContext });
    inspectGrant(grant, {
      controlledExternalPublicationAuthorizationReview: review,
      controlledExternalPublicationReviewPolicy: reviewPolicy,
      controlledExternalPublicationReviewMemory: reviewMemory,
      publicationEvidenceAdjudicationDecision,
      publicationEvidenceAdjudicationPolicy,
      publicationEvidenceAdjudicationMemory,
      controlledExternalPublicationAuthorizationGrantPolicy: grantPolicy,
      controlledExternalPublicationAuthorizationGrantMemory: grantMemory,
      ...decisionContext,
    });
    const consumer = consumptionPolicy.trustedConsumers.find((item) => item.keyId === receipt.consumerKeyId);
    if (!consumer) throw new Error("external_publication_authorization_consumer_untrusted");
    if (consumer.keyId === grant.grantorKeyId || consumer.actorId === grant.grantorActorId) throw new Error("authorization_grantor_cannot_consume_own_grant");
    validateConsumptionWindow(grant, consumer, receipt.consumedAt);
    const entryIndex = consumptionMemory.entries.findIndex((entry) => entry.consumptionReceiptHash === receipt.consumptionReceiptHash);
    if (entryIndex < 0) throw new Error("external_publication_authorization_consumption_not_recorded");
    const consumptionMemoryHashBefore = memoryHashForEntries(consumptionPolicy, consumptionMemory.entries.slice(0, entryIndex));
    const payload = signingPayload({ grant, grantMemory, consumptionPolicy, consumptionMemoryHashBefore, consumptionId: receipt.consumptionId, consumer, consumedAt: receipt.consumedAt, nonce: receipt.nonce });
    for (const [key, expected] of Object.entries(payload)) if (JSON.stringify(receipt[key]) !== JSON.stringify(expected)) throw new Error(`external_publication_authorization_consumption_${key}_mismatch`);
    if (receipt.signatureAlgorithm !== CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION_SIGNATURE_ALGORITHM || typeof receipt.signature !== "string") throw new Error("external_publication_authorization_consumption_signature_invalid");
    if (!cryptoVerify(null, bytes(payload), consumer.publicKeyPem, Buffer.from(receipt.signature, "base64url"))) throw new Error("external_publication_authorization_consumption_signature_verification_failed");
    if (receipt.consumptionRecorded !== true || receipt.externalPublicationAuthorizationVerified !== true || receipt.singleUse !== true || receipt.maximumUses !== 1 || receipt.remainingUses !== 0 || receipt.authorizationConsumed !== true) throw new Error("external_publication_authorization_consumption_receipt_contract_invalid");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (receipt[key] !== false) throw new Error(`external_publication_authorization_consumption_${key}_must_be_false`);
    }
    const hashPayload = { ...receipt };
    delete hashPayload.consumptionReceiptHash;
    if (digest(hashPayload) !== receipt.consumptionReceiptHash) throw new Error("external_publication_authorization_consumption_receipt_hash_mismatch");
    const entry = consumptionMemory.entries[entryIndex];
    if (entry.grantHash !== grant.grantHash || entry.consumptionMemoryHashBefore !== consumptionMemoryHashBefore) throw new Error("external_publication_authorization_consumption_memory_entry_mismatch");
    return {
      ok: true,
      consumptionReceiptHash: receipt.consumptionReceiptHash,
      grantHash: receipt.grantHash,
      authorizationConsumed: true,
      remainingUses: 0,
      publicationExecuted: false,
      externalPublicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_authorization_consumption_receipt_invalid" };
  }
}
