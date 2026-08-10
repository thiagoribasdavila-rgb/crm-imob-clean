import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION_RECEIPT_SCHEMA,
  inspectControlledExternalPublicationExecutionPermitConsumptionMemory,
  inspectControlledExternalPublicationExecutionPermitConsumptionPolicy,
  inspectControlledExternalPublicationExecutionPermitConsumptionReceipt,
} from "./controlled-external-publication-execution-permit-consumption.mjs";
import { CONTROLLED_EXTERNAL_PUBLICATION_EXECUTOR_ROLE } from "./controlled-external-publication-execution-handoff.mjs";

export const CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION_POLICY_SCHEMA = "atlas.controlled-proof-execution-start-authorization-policy.v1";
export const CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION_SCHEMA = "atlas.controlled-proof-execution-start-authorization.v1";
export const CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION_MEMORY_SCHEMA = "atlas.controlled-proof-execution-start-authorization-memory.v1";
export const CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION_MEMORY_ENTRY_SCHEMA = "atlas.controlled-proof-execution-start-authorization-memory-entry.v1";
export const CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION_SIGNATURE_ALGORITHM = "ed25519";

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

function consumptionPolicyContext(args) {
  return {
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

function normalizeAuthorizer(authorizer) {
  if (!authorizer || typeof authorizer !== "object" || Array.isArray(authorizer)) throw new Error("controlled_proof_execution_start_authorizer_invalid");
  assertSlug(authorizer.keyId, "controlled_proof_execution_start_authorizer_key_id");
  assertSlug(authorizer.actorId, "controlled_proof_execution_start_authorizer_actor_id");
  if (authorizer.role !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTOR_ROLE) throw new Error("controlled_proof_execution_start_authorizer_role_invalid");
  if (!["active", "inactive"].includes(authorizer.status)) throw new Error("controlled_proof_execution_start_authorizer_status_invalid");
  assertIso(authorizer.validFrom, "controlled_proof_execution_start_authorizer_valid_from");
  assertIso(authorizer.validUntil, "controlled_proof_execution_start_authorizer_valid_until");
  if (Date.parse(authorizer.validUntil) <= Date.parse(authorizer.validFrom)) throw new Error("controlled_proof_execution_start_authorizer_validity_invalid");
  try {
    const key = createPublicKey(authorizer.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch {
    throw new Error("controlled_proof_execution_start_authorizer_public_key_invalid");
  }
  return {
    keyId: authorizer.keyId,
    actorId: authorizer.actorId,
    role: authorizer.role,
    publicKeyPem: authorizer.publicKeyPem,
    validFrom: authorizer.validFrom,
    validUntil: authorizer.validUntil,
    status: authorizer.status,
  };
}

function verifyConsumptionPolicy(policy, args) {
  const inspection = inspectControlledExternalPublicationExecutionPermitConsumptionPolicy(policy, consumptionPolicyContext(args));
  if (!inspection.ok) throw new Error(`controlled_proof_execution_start_consumption_policy_invalid:${inspection.reason}`);
}

export function createControlledProofExecutionStartAuthorizationPolicy({
  controlledExternalPublicationExecutionPermitConsumptionPolicy: consumptionPolicy,
  maximumAuthorizationTtlSeconds = 300,
  ...upstream
}) {
  verifyConsumptionPolicy(consumptionPolicy, upstream);
  if (!Number.isInteger(maximumAuthorizationTtlSeconds) || maximumAuthorizationTtlSeconds < 1 || maximumAuthorizationTtlSeconds > 300) {
    throw new Error("controlled_proof_execution_start_authorization_maximum_ttl_invalid");
  }
  const authorizers = consumptionPolicy.trustedPermitConsumers.map(normalizeAuthorizer).sort((a, b) => a.keyId.localeCompare(b.keyId));
  const payload = {
    schema: CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION_POLICY_SCHEMA,
    compositionId: consumptionPolicy.compositionId,
    compositionDecisionHash: consumptionPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: consumptionPolicy.publicationDecisionPolicyHash,
    authorizationConsumptionPolicyHash: consumptionPolicy.authorizationConsumptionPolicyHash,
    executionHandoffPolicyHash: consumptionPolicy.executionHandoffPolicyHash,
    executionAcceptancePolicyHash: consumptionPolicy.executionAcceptancePolicyHash,
    executionPermitGrantPolicyHash: consumptionPolicy.executionPermitGrantPolicyHash,
    executionPermitConsumptionPolicyHash: consumptionPolicy.policyHash,
    requiredConsumptionReceiptSchema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION_RECEIPT_SCHEMA,
    requiredMemoryEntrySchema: CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION_MEMORY_ENTRY_SCHEMA,
    startAuthorizerRole: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTOR_ROLE,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION_SIGNATURE_ALGORITHM,
    trustedStartAuthorizers: authorizers,
    recordedPermitConsumptionRequired: true,
    exactConsumptionBindingRequired: true,
    exactConsumptionMemoryBindingRequired: true,
    exactPermitBindingRequired: true,
    exactAcceptanceBindingRequired: true,
    exactHandoffBindingRequired: true,
    exactTargetExecutorBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    signedStartAuthorizationRequired: true,
    appendOnlyStartAuthorizationMemoryRequired: true,
    duplicateConsumptionAuthorizationRejected: true,
    atomicMemoryHeadBindingRequired: true,
    shortLivedAuthorizationRequired: true,
    maximumAuthorizationTtlSeconds,
    singleUseStartAuthorizationRequired: true,
    maximumStarts: 1,
    controlledProofExecutionStartAuthorizationAllowed: true,
    controlledProofExecutionStartAllowed: false,
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

export function inspectControlledProofExecutionStartAuthorizationPolicy(policy, context) {
  try {
    const recreated = createControlledProofExecutionStartAuthorizationPolicy(context);
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "controlled_proof_execution_start_authorization_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "controlled_proof_execution_start_authorization_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedStartAuthorizers: recreated.trustedStartAuthorizers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_start_authorization_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedStartAuthorizations: entries.length,
      authorizedConsumptions: new Set(entries.map((entry) => entry.consumptionReceiptHash)).size,
      distinctAuthorizations: new Set(entries.map((entry) => entry.startAuthorizationHash)).size,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      controlledProofExecutionStartAuthorized: entries.length > 0,
      controlledProofExecutionStarted: false,
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

export function createControlledProofExecutionStartAuthorizationMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION_POLICY_SCHEMA) throw new Error("controlled_proof_execution_start_authorization_memory_policy_invalid");
  assertHash(policy.policyHash, "controlled_proof_execution_start_authorization_memory_policy_hash");
  if (!Array.isArray(entries)) throw new Error("controlled_proof_execution_start_authorization_memory_entries_invalid");
  let previousEntryHash = null;
  const consumptionHashes = new Set();
  const authorizationIds = new Set();
  const nonces = new Set();
  const normalized = [];
  for (const [index, entry] of entries.entries()) {
    if (entry?.schema !== CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION_MEMORY_ENTRY_SCHEMA) throw new Error("controlled_proof_execution_start_authorization_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("controlled_proof_execution_start_authorization_memory_chain_invalid");
    for (const field of [
      "startAuthorizationHash", "startAuthorizationPolicyHash", "startAuthorizationMemoryHashBefore", "consumptionReceiptHash",
      "consumptionPolicyHash", "consumptionMemoryHash", "permitHash", "permitPolicyHash", "permitMemoryHash", "acceptanceReceiptHash",
      "acceptancePolicyHash", "acceptanceMemoryHash", "handoffReceiptHash", "packageSha256", "inventoryHash",
    ]) assertHash(entry[field], `controlled_proof_execution_start_authorization_memory_${field}`);
    assertSlug(entry.startAuthorizationId, "controlled_proof_execution_start_authorization_memory_authorization_id");
    assertSlug(entry.consumptionId, "controlled_proof_execution_start_authorization_memory_consumption_id");
    assertSlug(entry.permitId, "controlled_proof_execution_start_authorization_memory_permit_id");
    assertSlug(entry.externalExecutorActorId, "controlled_proof_execution_start_authorization_memory_executor_actor_id");
    assertSlug(entry.nonce, "controlled_proof_execution_start_authorization_memory_nonce");
    assertIso(entry.authorizedAt, "controlled_proof_execution_start_authorization_memory_authorized_at");
    assertIso(entry.expiresAt, "controlled_proof_execution_start_authorization_memory_expires_at");
    if (entry.startAuthorizationPolicyHash !== policy.policyHash) throw new Error("controlled_proof_execution_start_authorization_memory_policy_binding_mismatch");
    if (entry.startAuthorizationMemoryHashBefore !== memoryHashForEntries(policy, normalized)) throw new Error("controlled_proof_execution_start_authorization_memory_head_binding_mismatch");
    if (consumptionHashes.has(entry.consumptionReceiptHash)) throw new Error("controlled_proof_execution_start_consumption_already_authorized");
    if (authorizationIds.has(entry.startAuthorizationId)) throw new Error("controlled_proof_execution_start_authorization_duplicate_id");
    if (nonces.has(entry.nonce)) throw new Error("controlled_proof_execution_start_authorization_duplicate_nonce");
    if (
      entry.permitConsumptionVerified !== true || entry.permitConsumed !== true || entry.startAuthorizationRecorded !== true ||
      entry.controlledProofExecutionStartAuthorized !== true || entry.singleUse !== true || entry.maximumStarts !== 1 || entry.remainingStarts !== 1
    ) throw new Error("controlled_proof_execution_start_authorization_memory_contract_invalid");
    for (const key of ["controlledProofExecutionStarted", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`controlled_proof_execution_start_authorization_memory_${key}_must_be_false`);
    }
    const entryPayload = { ...entry };
    delete entryPayload.entryHash;
    if (digest(entryPayload) !== entry.entryHash) throw new Error("controlled_proof_execution_start_authorization_memory_entry_hash_mismatch");
    normalized.push({ ...entry });
    consumptionHashes.add(entry.consumptionReceiptHash);
    authorizationIds.add(entry.startAuthorizationId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledProofExecutionStartAuthorizationMemory(memory, { policy }) {
  try {
    const recreated = createControlledProofExecutionStartAuthorizationMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "controlled_proof_execution_start_authorization_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "controlled_proof_execution_start_authorization_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, ...recreated.summary };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_start_authorization_memory_invalid" };
  }
}

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

function verifyAuthorizationContext(args) {
  const policyInspection = inspectControlledProofExecutionStartAuthorizationPolicy(args.controlledProofExecutionStartAuthorizationPolicy, authorizationPolicyContext(args));
  if (!policyInspection.ok) throw new Error(`controlled_proof_execution_start_authorization_policy_invalid:${policyInspection.reason}`);
  const memoryInspection = inspectControlledProofExecutionStartAuthorizationMemory(args.controlledProofExecutionStartAuthorizationMemory, {
    policy: args.controlledProofExecutionStartAuthorizationPolicy,
  });
  if (!memoryInspection.ok) throw new Error(`controlled_proof_execution_start_authorization_memory_invalid:${memoryInspection.reason}`);
  const consumptionMemoryInspection = inspectControlledExternalPublicationExecutionPermitConsumptionMemory(
    args.controlledExternalPublicationExecutionPermitConsumptionMemory,
    { policy: args.controlledExternalPublicationExecutionPermitConsumptionPolicy },
  );
  if (!consumptionMemoryInspection.ok) throw new Error(`controlled_proof_execution_start_consumption_memory_invalid:${consumptionMemoryInspection.reason}`);
}

function validateAuthorizationWindow(consumptionReceipt, permit, authorizer, policy, authorizedAt, expiresAt) {
  assertIso(authorizedAt, "controlled_proof_execution_start_authorized_at");
  assertIso(expiresAt, "controlled_proof_execution_start_authorization_expires_at");
  const authorized = Date.parse(authorizedAt);
  const expires = Date.parse(expiresAt);
  if (authorized < Date.parse(consumptionReceipt.consumedAt)) throw new Error("controlled_proof_execution_start_authorization_before_permit_consumption");
  if (authorized >= Date.parse(permit.expiresAt)) throw new Error("controlled_proof_execution_start_authorization_after_permit_expiration");
  if (expires <= authorized || expires > Date.parse(permit.expiresAt)) throw new Error("controlled_proof_execution_start_authorization_window_invalid");
  if ((expires - authorized) / 1000 > policy.maximumAuthorizationTtlSeconds) throw new Error("controlled_proof_execution_start_authorization_ttl_exceeded");
  if (authorizer.status !== "active") throw new Error("controlled_proof_execution_start_authorizer_inactive");
  if (authorized < Date.parse(authorizer.validFrom) || expires > Date.parse(authorizer.validUntil)) throw new Error("controlled_proof_execution_start_authorizer_key_outside_validity");
}

function signingPayload({ consumptionReceipt, consumptionMemory, authorizationPolicy, authorizationMemoryHashBefore, startAuthorizationId, authorizer, reasonCode, authorizedAt, expiresAt, nonce }) {
  if (!consumptionMemory.entries.some((entry) => entry.consumptionReceiptHash === consumptionReceipt.consumptionReceiptHash && entry.permitConsumed === true)) {
    throw new Error("controlled_proof_execution_start_consumption_not_recorded");
  }
  return {
    signingSchema: "atlas.controlled-proof-execution-start-authorization-signing-payload.v1",
    compositionId: consumptionReceipt.compositionId,
    compositionDecisionHash: consumptionReceipt.compositionDecisionHash,
    publicationDecisionHash: consumptionReceipt.publicationDecisionHash,
    evidenceDecisionHash: consumptionReceipt.evidenceDecisionHash,
    authorizationConsumptionReceiptHash: consumptionReceipt.authorizationConsumptionReceiptHash,
    handoffReceiptHash: consumptionReceipt.handoffReceiptHash,
    acceptanceReceiptHash: consumptionReceipt.acceptanceReceiptHash,
    acceptancePolicyHash: consumptionReceipt.acceptancePolicyHash,
    acceptanceMemoryHash: consumptionReceipt.acceptanceMemoryHash,
    packageSha256: consumptionReceipt.packageSha256,
    inventoryHash: consumptionReceipt.inventoryHash,
    permitHash: consumptionReceipt.permitHash,
    permitPolicyHash: consumptionReceipt.permitPolicyHash,
    permitMemoryHash: consumptionReceipt.permitMemoryHash,
    permitId: consumptionReceipt.permitId,
    consumptionReceiptHash: consumptionReceipt.consumptionReceiptHash,
    consumptionPolicyHash: consumptionReceipt.consumptionPolicyHash,
    consumptionMemoryHash: consumptionMemory.memoryHash,
    consumptionId: consumptionReceipt.consumptionId,
    startAuthorizationPolicyHash: authorizationPolicy.policyHash,
    startAuthorizationMemoryHashBefore: authorizationMemoryHashBefore,
    startAuthorizationId,
    externalExecutorKeyId: authorizer.keyId,
    externalExecutorActorId: authorizer.actorId,
    externalExecutorRole: authorizer.role,
    reasonCode,
    permitConsumptionVerified: true,
    permitConsumed: true,
    controlledProofExecutionStartAuthorized: true,
    singleUse: true,
    maximumStarts: 1,
    remainingStarts: 1,
    authorizedAt,
    expiresAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("controlled_proof_execution_start_authorization_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_controlled_proof_execution_start_authorizer");
  return signature;
}

export function authorizeControlledProofExecutionStart({
  controlledExternalPublicationExecutionPermitConsumptionReceipt: consumptionReceipt,
  controlledExternalPublicationExecutionPermitConsumptionMemory: consumptionMemory,
  controlledExternalPublicationExecutionPermit: permit,
  controlledProofExecutionStartAuthorizationPolicy: authorizationPolicy,
  controlledProofExecutionStartAuthorizationMemory: authorizationMemory,
  startAuthorizationId,
  startAuthorizerKeyId,
  startAuthorizerPrivateKey,
  reasonCode,
  authorizedAt,
  expiresAt,
  nonce,
  ...upstream
}) {
  const context = {
    ...upstream,
    controlledExternalPublicationExecutionPermitConsumptionMemory: consumptionMemory,
    controlledProofExecutionStartAuthorizationPolicy: authorizationPolicy,
    controlledProofExecutionStartAuthorizationMemory: authorizationMemory,
  };
  verifyAuthorizationContext(context);
  const consumptionInspection = inspectControlledExternalPublicationExecutionPermitConsumptionReceipt(consumptionReceipt, {
    ...upstream,
    controlledExternalPublicationExecutionPermit: permit,
    controlledExternalPublicationExecutionPermitConsumptionMemory: consumptionMemory,
  });
  if (!consumptionInspection.ok) throw new Error(`controlled_proof_execution_start_consumption_receipt_invalid:${consumptionInspection.reason}`);
  assertSlug(startAuthorizationId, "controlled_proof_execution_start_authorization_id");
  assertSlug(startAuthorizerKeyId, "controlled_proof_execution_start_authorizer_key_id");
  assertSlug(reasonCode, "controlled_proof_execution_start_authorization_reason_code");
  assertSlug(nonce, "controlled_proof_execution_start_authorization_nonce");
  if (authorizationMemory.entries.some((entry) => entry.consumptionReceiptHash === consumptionReceipt.consumptionReceiptHash)) throw new Error("controlled_proof_execution_start_consumption_already_authorized");
  if (authorizationMemory.entries.some((entry) => entry.startAuthorizationId === startAuthorizationId)) throw new Error("controlled_proof_execution_start_authorization_duplicate_id");
  if (authorizationMemory.entries.some((entry) => entry.nonce === nonce)) throw new Error("controlled_proof_execution_start_authorization_duplicate_nonce");
  if (startAuthorizerKeyId !== consumptionReceipt.externalExecutorKeyId) throw new Error("controlled_proof_execution_start_authorization_wrong_target_executor");
  const authorizer = authorizationPolicy.trustedStartAuthorizers.find((item) => item.keyId === startAuthorizerKeyId);
  if (!authorizer || authorizer.actorId !== consumptionReceipt.externalExecutorActorId) throw new Error("controlled_proof_execution_start_authorizer_untrusted");
  validateAuthorizationWindow(consumptionReceipt, permit, authorizer, authorizationPolicy, authorizedAt, expiresAt);
  const startAuthorizationMemoryHashBefore = authorizationMemory.memoryHash;
  const payload = signingPayload({ consumptionReceipt, consumptionMemory, permit, authorizationPolicy, authorizationMemoryHashBefore: startAuthorizationMemoryHashBefore, startAuthorizationId, authorizer, reasonCode, authorizedAt, expiresAt, nonce });
  const signature = signPayload(payload, startAuthorizerPrivateKey, authorizer.publicKeyPem);
  const authorizationValue = {
    schema: CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION_SIGNATURE_ALGORITHM,
    startAuthorizationRecorded: true,
    controlledProofExecutionStarted: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const startAuthorization = { ...authorizationValue, startAuthorizationHash: digest(authorizationValue) };
  const entryPayload = {
    schema: CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION_MEMORY_ENTRY_SCHEMA,
    sequence: authorizationMemory.entries.length + 1,
    previousEntryHash: authorizationMemory.entries.at(-1)?.entryHash ?? null,
    startAuthorizationHash: startAuthorization.startAuthorizationHash,
    startAuthorizationPolicyHash: authorizationPolicy.policyHash,
    startAuthorizationMemoryHashBefore,
    consumptionReceiptHash: consumptionReceipt.consumptionReceiptHash,
    consumptionPolicyHash: consumptionReceipt.consumptionPolicyHash,
    consumptionMemoryHash: consumptionMemory.memoryHash,
    permitHash: consumptionReceipt.permitHash,
    permitPolicyHash: consumptionReceipt.permitPolicyHash,
    permitMemoryHash: consumptionReceipt.permitMemoryHash,
    acceptanceReceiptHash: consumptionReceipt.acceptanceReceiptHash,
    acceptancePolicyHash: consumptionReceipt.acceptancePolicyHash,
    acceptanceMemoryHash: consumptionReceipt.acceptanceMemoryHash,
    handoffReceiptHash: consumptionReceipt.handoffReceiptHash,
    packageSha256: consumptionReceipt.packageSha256,
    inventoryHash: consumptionReceipt.inventoryHash,
    permitId: consumptionReceipt.permitId,
    consumptionId: consumptionReceipt.consumptionId,
    startAuthorizationId,
    externalExecutorActorId: authorizer.actorId,
    permitConsumptionVerified: true,
    permitConsumed: true,
    startAuthorizationRecorded: true,
    controlledProofExecutionStartAuthorized: true,
    singleUse: true,
    maximumStarts: 1,
    remainingStarts: 1,
    authorizedAt,
    expiresAt,
    nonce,
    controlledProofExecutionStarted: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  const entry = { ...entryPayload, entryHash: digest(entryPayload) };
  return {
    startAuthorization,
    controlledProofExecutionStartAuthorizationMemory: createControlledProofExecutionStartAuthorizationMemory({
      policy: authorizationPolicy,
      entries: [...authorizationMemory.entries, entry],
    }),
  };
}

export function inspectControlledProofExecutionStartAuthorization(startAuthorization, {
  controlledExternalPublicationExecutionPermitConsumptionReceipt: consumptionReceipt,
  controlledExternalPublicationExecutionPermitConsumptionMemory: consumptionMemory,
  controlledExternalPublicationExecutionPermit: permit,
  controlledProofExecutionStartAuthorizationPolicy: authorizationPolicy,
  controlledProofExecutionStartAuthorizationMemory: authorizationMemory,
  ...upstream
}) {
  try {
    if (startAuthorization?.schema !== CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION_SCHEMA) throw new Error("controlled_proof_execution_start_authorization_schema_invalid");
    const context = {
      ...upstream,
      controlledExternalPublicationExecutionPermitConsumptionMemory: consumptionMemory,
      controlledProofExecutionStartAuthorizationPolicy: authorizationPolicy,
      controlledProofExecutionStartAuthorizationMemory: authorizationMemory,
    };
    verifyAuthorizationContext(context);
    const consumptionInspection = inspectControlledExternalPublicationExecutionPermitConsumptionReceipt(consumptionReceipt, {
      ...upstream,
      controlledExternalPublicationExecutionPermit: permit,
      controlledExternalPublicationExecutionPermitConsumptionMemory: consumptionMemory,
    });
    if (!consumptionInspection.ok) throw new Error(`controlled_proof_execution_start_consumption_receipt_invalid:${consumptionInspection.reason}`);
    const authorizer = authorizationPolicy.trustedStartAuthorizers.find((item) => item.keyId === startAuthorization.externalExecutorKeyId);
    if (!authorizer || authorizer.actorId !== consumptionReceipt.externalExecutorActorId || startAuthorization.externalExecutorKeyId !== consumptionReceipt.externalExecutorKeyId) {
      throw new Error("controlled_proof_execution_start_authorization_wrong_target_executor");
    }
    validateAuthorizationWindow(consumptionReceipt, permit, authorizer, authorizationPolicy, startAuthorization.authorizedAt, startAuthorization.expiresAt);
    const entryIndex = authorizationMemory.entries.findIndex((entry) => entry.startAuthorizationHash === startAuthorization.startAuthorizationHash);
    if (entryIndex < 0) throw new Error("controlled_proof_execution_start_authorization_not_recorded");
    const startAuthorizationMemoryHashBefore = memoryHashForEntries(authorizationPolicy, authorizationMemory.entries.slice(0, entryIndex));
    const payload = signingPayload({
      consumptionReceipt,
      consumptionMemory,
      permit,
      authorizationPolicy,
      authorizationMemoryHashBefore: startAuthorizationMemoryHashBefore,
      startAuthorizationId: startAuthorization.startAuthorizationId,
      authorizer,
      reasonCode: startAuthorization.reasonCode,
      authorizedAt: startAuthorization.authorizedAt,
      expiresAt: startAuthorization.expiresAt,
      nonce: startAuthorization.nonce,
    });
    for (const [key, expected] of Object.entries(payload)) if (JSON.stringify(startAuthorization[key]) !== JSON.stringify(expected)) throw new Error(`controlled_proof_execution_start_authorization_${key}_mismatch`);
    if (startAuthorization.signatureAlgorithm !== CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION_SIGNATURE_ALGORITHM || typeof startAuthorization.signature !== "string") throw new Error("controlled_proof_execution_start_authorization_signature_invalid");
    if (!cryptoVerify(null, bytes(payload), authorizer.publicKeyPem, Buffer.from(startAuthorization.signature, "base64url"))) throw new Error("controlled_proof_execution_start_authorization_signature_verification_failed");
    if (
      startAuthorization.startAuthorizationRecorded !== true || startAuthorization.permitConsumptionVerified !== true || startAuthorization.permitConsumed !== true ||
      startAuthorization.controlledProofExecutionStartAuthorized !== true || startAuthorization.singleUse !== true || startAuthorization.maximumStarts !== 1 || startAuthorization.remainingStarts !== 1
    ) throw new Error("controlled_proof_execution_start_authorization_contract_invalid");
    for (const key of ["controlledProofExecutionStarted", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (startAuthorization[key] !== false) throw new Error(`controlled_proof_execution_start_authorization_${key}_must_be_false`);
    }
    const hashPayload = { ...startAuthorization };
    delete hashPayload.startAuthorizationHash;
    if (digest(hashPayload) !== startAuthorization.startAuthorizationHash) throw new Error("controlled_proof_execution_start_authorization_hash_mismatch");
    const entry = authorizationMemory.entries[entryIndex];
    if (entry.consumptionReceiptHash !== consumptionReceipt.consumptionReceiptHash || entry.startAuthorizationMemoryHashBefore !== startAuthorizationMemoryHashBefore || entry.remainingStarts !== 1) {
      throw new Error("controlled_proof_execution_start_authorization_memory_entry_mismatch");
    }
    return {
      ok: true,
      startAuthorizationHash: startAuthorization.startAuthorizationHash,
      consumptionReceiptHash: startAuthorization.consumptionReceiptHash,
      controlledProofExecutionStartAuthorized: true,
      remainingStarts: 1,
      controlledProofExecutionStarted: false,
      publicationExecuted: false,
      externalPublicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "controlled_proof_execution_start_authorization_invalid" };
  }
}
