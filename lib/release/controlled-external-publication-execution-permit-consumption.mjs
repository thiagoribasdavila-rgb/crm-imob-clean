import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_MEMORY_ENTRY_SCHEMA,
  CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_SCHEMA,
  inspectControlledExternalPublicationExecutionPermit,
  inspectControlledExternalPublicationExecutionPermitGrantPolicy,
  inspectControlledExternalPublicationExecutionPermitMemory,
} from "./controlled-external-publication-execution-permit-grant.mjs";
import {
  CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_RECEIPT_SCHEMA,
  inspectControlledExternalPublicationExecutionAcceptanceMemory,
  inspectControlledExternalPublicationExecutionAcceptancePolicy,
} from "./controlled-external-publication-execution-acceptance.mjs";
import { CONTROLLED_EXTERNAL_PUBLICATION_EXECUTOR_ROLE } from "./controlled-external-publication-execution-handoff.mjs";

export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION_POLICY_SCHEMA = "atlas.controlled-external-publication-execution-permit-consumption-policy.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION_RECEIPT_SCHEMA = "atlas.controlled-external-publication-execution-permit-consumption-receipt.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION_MEMORY_SCHEMA = "atlas.controlled-external-publication-execution-permit-consumption-memory.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION_MEMORY_ENTRY_SCHEMA = "atlas.controlled-external-publication-execution-permit-consumption-memory-entry.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION_SIGNATURE_ALGORITHM = "ed25519";

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

function acceptancePolicyContext(args) {
  return {
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

function normalizeExecutor(executor) {
  if (!executor || typeof executor !== "object" || Array.isArray(executor)) throw new Error("external_publication_execution_permit_consumer_invalid");
  assertSlug(executor.keyId, "external_publication_execution_permit_consumer_key_id");
  assertSlug(executor.actorId, "external_publication_execution_permit_consumer_actor_id");
  if (executor.role !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTOR_ROLE) throw new Error("external_publication_execution_permit_consumer_role_invalid");
  if (!['active', 'inactive'].includes(executor.status)) throw new Error("external_publication_execution_permit_consumer_status_invalid");
  assertIso(executor.validFrom, "external_publication_execution_permit_consumer_valid_from");
  assertIso(executor.validUntil, "external_publication_execution_permit_consumer_valid_until");
  if (Date.parse(executor.validUntil) <= Date.parse(executor.validFrom)) throw new Error("external_publication_execution_permit_consumer_validity_invalid");
  try {
    const key = createPublicKey(executor.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch {
    throw new Error("external_publication_execution_permit_consumer_public_key_invalid");
  }
  return {
    keyId: executor.keyId,
    actorId: executor.actorId,
    role: executor.role,
    publicKeyPem: executor.publicKeyPem,
    validFrom: executor.validFrom,
    validUntil: executor.validUntil,
    status: executor.status,
  };
}

function verifyUpstreamPolicies(permitPolicy, acceptancePolicy, context) {
  const acceptanceInspection = inspectControlledExternalPublicationExecutionAcceptancePolicy(acceptancePolicy, acceptancePolicyContext(context));
  if (!acceptanceInspection.ok) throw new Error(`external_publication_execution_acceptance_policy_invalid:${acceptanceInspection.reason}`);
  const permitInspection = inspectControlledExternalPublicationExecutionPermitGrantPolicy(permitPolicy, {
    controlledExternalPublicationExecutionAcceptancePolicy: acceptancePolicy,
    ...acceptancePolicyContext(context),
  });
  if (!permitInspection.ok) throw new Error(`external_publication_execution_permit_policy_invalid:${permitInspection.reason}`);
}

export function createControlledExternalPublicationExecutionPermitConsumptionPolicy({
  controlledExternalPublicationExecutionPermitGrantPolicy: permitPolicy,
  controlledExternalPublicationExecutionAcceptancePolicy: acceptancePolicy,
  ...upstream
}) {
  verifyUpstreamPolicies(permitPolicy, acceptancePolicy, upstream);
  const consumers = acceptancePolicy.trustedExternalExecutors.map(normalizeExecutor).sort((a, b) => a.keyId.localeCompare(b.keyId));
  const payload = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION_POLICY_SCHEMA,
    compositionId: permitPolicy.compositionId,
    compositionDecisionHash: permitPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: permitPolicy.publicationDecisionPolicyHash,
    authorizationConsumptionPolicyHash: permitPolicy.authorizationConsumptionPolicyHash,
    executionHandoffPolicyHash: permitPolicy.executionHandoffPolicyHash,
    executionAcceptancePolicyHash: permitPolicy.executionAcceptancePolicyHash,
    executionPermitGrantPolicyHash: permitPolicy.policyHash,
    requiredPermitSchema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_SCHEMA,
    requiredPermitMemoryEntrySchema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_MEMORY_ENTRY_SCHEMA,
    requiredAcceptanceReceiptSchema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_RECEIPT_SCHEMA,
    requiredMemoryEntrySchema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION_MEMORY_ENTRY_SCHEMA,
    permitConsumerRole: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTOR_ROLE,
    signatureAlgorithm: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION_SIGNATURE_ALGORITHM,
    trustedPermitConsumers: consumers,
    recordedUnexpiredSingleUsePermitRequired: true,
    exactPermitBindingRequired: true,
    exactPermitMemoryBindingRequired: true,
    exactAcceptanceBindingRequired: true,
    exactHandoffBindingRequired: true,
    exactTargetExecutorBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    signedConsumptionReceiptRequired: true,
    appendOnlyConsumptionMemoryRequired: true,
    duplicatePermitConsumptionRejected: true,
    atomicMemoryHeadBindingRequired: true,
    singleUseConsumptionRequired: true,
    maximumUses: 1,
    permitConsumptionAllowed: true,
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

export function inspectControlledExternalPublicationExecutionPermitConsumptionPolicy(policy, context) {
  try {
    const recreated = createControlledExternalPublicationExecutionPermitConsumptionPolicy(context);
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "external_publication_execution_permit_consumption_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "external_publication_execution_permit_consumption_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedPermitConsumers: recreated.trustedPermitConsumers.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_execution_permit_consumption_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedConsumptions: entries.length,
      consumedSingleUsePermits: entries.filter((entry) => entry.permitConsumed === true).length,
      distinctPermits: new Set(entries.map((entry) => entry.permitHash)).size,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      permitConsumed: entries.length > 0,
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

export function createControlledExternalPublicationExecutionPermitConsumptionMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION_POLICY_SCHEMA) throw new Error("external_publication_execution_permit_consumption_memory_policy_invalid");
  assertHash(policy.policyHash, "external_publication_execution_permit_consumption_memory_policy_hash");
  if (!Array.isArray(entries)) throw new Error("external_publication_execution_permit_consumption_memory_entries_invalid");
  let previousEntryHash = null;
  const permitHashes = new Set();
  const consumptionIds = new Set();
  const nonces = new Set();
  const normalized = [];
  for (const [index, entry] of entries.entries()) {
    if (entry?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION_MEMORY_ENTRY_SCHEMA) throw new Error("external_publication_execution_permit_consumption_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("external_publication_execution_permit_consumption_memory_chain_invalid");
    for (const field of [
      "consumptionReceiptHash", "consumptionPolicyHash", "consumptionMemoryHashBefore", "permitHash", "permitPolicyHash", "permitMemoryHash",
      "acceptanceReceiptHash", "acceptancePolicyHash", "acceptanceMemoryHash", "handoffReceiptHash", "packageSha256", "inventoryHash",
    ]) assertHash(entry[field], `external_publication_execution_permit_consumption_memory_${field}`);
    assertSlug(entry.permitId, "external_publication_execution_permit_consumption_memory_permit_id");
    assertSlug(entry.consumptionId, "external_publication_execution_permit_consumption_memory_consumption_id");
    assertSlug(entry.externalExecutorActorId, "external_publication_execution_permit_consumption_memory_executor_actor_id");
    assertSlug(entry.nonce, "external_publication_execution_permit_consumption_memory_nonce");
    assertIso(entry.consumedAt, "external_publication_execution_permit_consumption_memory_consumed_at");
    if (entry.consumptionPolicyHash !== policy.policyHash) throw new Error("external_publication_execution_permit_consumption_memory_policy_binding_mismatch");
    if (entry.consumptionMemoryHashBefore !== memoryHashForEntries(policy, normalized)) throw new Error("external_publication_execution_permit_consumption_memory_head_binding_mismatch");
    if (permitHashes.has(entry.permitHash)) throw new Error("external_publication_execution_permit_already_consumed");
    if (consumptionIds.has(entry.consumptionId)) throw new Error("external_publication_execution_permit_consumption_duplicate_consumption_id");
    if (nonces.has(entry.nonce)) throw new Error("external_publication_execution_permit_consumption_duplicate_nonce");
    if (
      entry.permitConsumptionVerified !== true || entry.singleUse !== true || entry.maximumUses !== 1 || entry.remainingUses !== 0 ||
      entry.permitConsumed !== true || entry.consumptionRecorded !== true || entry.publicationExecutionPermitted !== false
    ) throw new Error("external_publication_execution_permit_consumption_memory_single_use_contract_invalid");
    for (const key of ["controlledProofExecutionStarted", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`external_publication_execution_permit_consumption_memory_${key}_must_be_false`);
    }
    const entryPayload = { ...entry };
    delete entryPayload.entryHash;
    if (digest(entryPayload) !== entry.entryHash) throw new Error("external_publication_execution_permit_consumption_memory_entry_hash_mismatch");
    normalized.push({ ...entry });
    permitHashes.add(entry.permitHash);
    consumptionIds.add(entry.consumptionId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledExternalPublicationExecutionPermitConsumptionMemory(memory, { policy }) {
  try {
    const recreated = createControlledExternalPublicationExecutionPermitConsumptionMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "external_publication_execution_permit_consumption_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "external_publication_execution_permit_consumption_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, ...recreated.summary };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_execution_permit_consumption_memory_invalid" };
  }
}

function consumptionPolicyContext(args) {
  return {
    controlledExternalPublicationExecutionPermitGrantPolicy: args.controlledExternalPublicationExecutionPermitGrantPolicy,
    controlledExternalPublicationExecutionAcceptancePolicy: args.controlledExternalPublicationExecutionAcceptancePolicy,
    ...acceptancePolicyContext(args),
  };
}

function verifyContext(args) {
  const policyInspection = inspectControlledExternalPublicationExecutionPermitConsumptionPolicy(
    args.controlledExternalPublicationExecutionPermitConsumptionPolicy,
    consumptionPolicyContext(args),
  );
  if (!policyInspection.ok) throw new Error(`external_publication_execution_permit_consumption_policy_invalid:${policyInspection.reason}`);
  const consumptionMemoryInspection = inspectControlledExternalPublicationExecutionPermitConsumptionMemory(
    args.controlledExternalPublicationExecutionPermitConsumptionMemory,
    { policy: args.controlledExternalPublicationExecutionPermitConsumptionPolicy },
  );
  if (!consumptionMemoryInspection.ok) throw new Error(`external_publication_execution_permit_consumption_memory_invalid:${consumptionMemoryInspection.reason}`);
  const permitMemoryInspection = inspectControlledExternalPublicationExecutionPermitMemory(
    args.controlledExternalPublicationExecutionPermitMemory,
    { policy: args.controlledExternalPublicationExecutionPermitGrantPolicy },
  );
  if (!permitMemoryInspection.ok) throw new Error(`external_publication_execution_permit_memory_invalid:${permitMemoryInspection.reason}`);
  const acceptanceMemoryInspection = inspectControlledExternalPublicationExecutionAcceptanceMemory(
    args.controlledExternalPublicationExecutionAcceptanceMemory,
    { policy: args.controlledExternalPublicationExecutionAcceptancePolicy },
  );
  if (!acceptanceMemoryInspection.ok) throw new Error(`external_publication_execution_acceptance_memory_invalid:${acceptanceMemoryInspection.reason}`);
}

function inspectEligiblePermit(permit, args) {
  const inspection = inspectControlledExternalPublicationExecutionPermit(permit, args);
  if (!inspection.ok) throw new Error(`external_publication_execution_permit_invalid:${inspection.reason}`);
  if (
    inspection.publicationExecutionPermitted !== true || inspection.permitConsumed !== false || inspection.remainingUses !== 1 ||
    permit.permitRecorded !== true || permit.singleUse !== true || permit.maximumUses !== 1
  ) throw new Error("recorded_unexpired_single_use_execution_permit_required_for_consumption");
  return inspection;
}

function validateConsumptionWindow(permit, executor, consumedAt) {
  assertIso(consumedAt, "external_publication_execution_permit_consumed_at");
  const consumed = Date.parse(consumedAt);
  if (consumed < Date.parse(permit.grantedAt)) throw new Error("external_publication_execution_permit_consumption_before_grant");
  if (consumed >= Date.parse(permit.expiresAt)) throw new Error("external_publication_execution_permit_consumption_after_expiration");
  if (executor.status !== "active") throw new Error("external_publication_execution_permit_consumer_inactive");
  if (consumed < Date.parse(executor.validFrom) || consumed > Date.parse(executor.validUntil)) throw new Error("external_publication_execution_permit_consumer_key_outside_validity");
}

function signingPayload({ permit, permitMemory, acceptanceReceipt, acceptanceMemory, consumptionPolicy, consumptionMemoryHashBefore, consumptionId, executor, consumedAt, nonce }) {
  if (!permitMemory.entries.some((entry) => entry.permitHash === permit.permitHash && entry.permitConsumed === false && entry.remainingUses === 1)) {
    throw new Error("external_publication_execution_permit_not_recorded");
  }
  if (!acceptanceMemory.entries.some((entry) => entry.acceptanceReceiptHash === acceptanceReceipt.acceptanceReceiptHash && entry.decision === "accepted")) {
    throw new Error("external_publication_execution_acceptance_not_recorded");
  }
  return {
    signingSchema: "atlas.controlled-external-publication-execution-permit-consumption-signing-payload.v1",
    compositionId: permit.compositionId,
    compositionDecisionHash: permit.compositionDecisionHash,
    publicationDecisionHash: permit.publicationDecisionHash,
    evidenceDecisionHash: permit.evidenceDecisionHash,
    authorizationConsumptionReceiptHash: permit.authorizationConsumptionReceiptHash,
    handoffReceiptHash: permit.handoffReceiptHash,
    acceptanceReceiptHash: permit.acceptanceReceiptHash,
    acceptancePolicyHash: permit.acceptancePolicyHash,
    acceptanceMemoryHash: acceptanceMemory.memoryHash,
    packageSha256: permit.packageSha256,
    inventoryHash: permit.inventoryHash,
    permitHash: permit.permitHash,
    permitPolicyHash: permit.permitPolicyHash,
    permitMemoryHash: permitMemory.memoryHash,
    permitId: permit.permitId,
    consumptionPolicyHash: consumptionPolicy.policyHash,
    consumptionMemoryHashBefore,
    consumptionId,
    externalExecutorKeyId: executor.keyId,
    externalExecutorActorId: executor.actorId,
    externalExecutorRole: executor.role,
    permitConsumptionVerified: true,
    singleUse: true,
    maximumUses: 1,
    remainingUses: 0,
    permitConsumed: true,
    publicationExecutionPermitted: false,
    controlledProofExecutionStartAllowed: false,
    consumedAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("external_publication_execution_permit_consumption_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_external_publication_execution_permit_consumer");
  return signature;
}

export function consumeControlledExternalPublicationExecutionPermit({
  controlledExternalPublicationExecutionPermit: permit,
  controlledExternalPublicationExecutionPermitGrantPolicy: permitPolicy,
  controlledExternalPublicationExecutionPermitMemory: permitMemory,
  controlledExternalPublicationExecutionAcceptanceReceipt: acceptanceReceipt,
  controlledExternalPublicationExecutionAcceptanceMemory: acceptanceMemory,
  controlledExternalPublicationExecutionHandoffReceipt: handoffReceipt,
  controlledExternalPublicationExecutionPermitConsumptionPolicy: consumptionPolicy,
  controlledExternalPublicationExecutionPermitConsumptionMemory: consumptionMemory,
  consumptionId,
  externalExecutorKeyId,
  externalExecutorPrivateKey,
  consumedAt,
  nonce,
  ...upstream
}) {
  const context = {
    ...upstream,
    controlledExternalPublicationExecutionPermitGrantPolicy: permitPolicy,
    controlledExternalPublicationExecutionPermitMemory: permitMemory,
    controlledExternalPublicationExecutionAcceptancePolicy: upstream.controlledExternalPublicationExecutionAcceptancePolicy,
    controlledExternalPublicationExecutionAcceptanceMemory: acceptanceMemory,
    controlledExternalPublicationExecutionPermitConsumptionPolicy: consumptionPolicy,
    controlledExternalPublicationExecutionPermitConsumptionMemory: consumptionMemory,
  };
  verifyContext(context);
  inspectEligiblePermit(permit, {
    ...upstream,
    controlledExternalPublicationExecutionAcceptanceReceipt: acceptanceReceipt,
    controlledExternalPublicationExecutionAcceptanceMemory: acceptanceMemory,
    controlledExternalPublicationExecutionHandoffReceipt: handoffReceipt,
    controlledExternalPublicationExecutionPermitGrantPolicy: permitPolicy,
    controlledExternalPublicationExecutionPermitMemory: permitMemory,
  });
  assertSlug(consumptionId, "external_publication_execution_permit_consumption_id");
  assertSlug(externalExecutorKeyId, "external_publication_execution_permit_consumer_key_id");
  assertSlug(nonce, "external_publication_execution_permit_consumption_nonce");
  if (permit.acceptanceReceiptHash !== acceptanceReceipt.acceptanceReceiptHash || permit.handoffReceiptHash !== handoffReceipt.handoffReceiptHash) throw new Error("external_publication_execution_permit_consumption_chain_binding_mismatch");
  if (externalExecutorKeyId !== acceptanceReceipt.externalExecutorKeyId) throw new Error("external_publication_execution_permit_consumption_wrong_target_executor");
  if (consumptionMemory.entries.some((entry) => entry.permitHash === permit.permitHash)) throw new Error("external_publication_execution_permit_already_consumed");
  if (consumptionMemory.entries.some((entry) => entry.consumptionId === consumptionId)) throw new Error("external_publication_execution_permit_consumption_duplicate_consumption_id");
  if (consumptionMemory.entries.some((entry) => entry.nonce === nonce)) throw new Error("external_publication_execution_permit_consumption_duplicate_nonce");
  const executor = consumptionPolicy.trustedPermitConsumers.find((item) => item.keyId === externalExecutorKeyId);
  if (!executor || executor.actorId !== acceptanceReceipt.externalExecutorActorId) throw new Error("external_publication_execution_permit_consumer_untrusted");
  validateConsumptionWindow(permit, executor, consumedAt);
  const consumptionMemoryHashBefore = consumptionMemory.memoryHash;
  const payload = signingPayload({ permit, permitMemory, acceptanceReceipt, acceptanceMemory, consumptionPolicy, consumptionMemoryHashBefore, consumptionId, executor, consumedAt, nonce });
  const signature = signPayload(payload, externalExecutorPrivateKey, executor.publicKeyPem);
  const receiptValue = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION_RECEIPT_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION_SIGNATURE_ALGORITHM,
    consumptionRecorded: true,
    controlledProofExecutionStarted: false,
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
    schema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION_MEMORY_ENTRY_SCHEMA,
    sequence: consumptionMemory.entries.length + 1,
    previousEntryHash: consumptionMemory.entries.at(-1)?.entryHash ?? null,
    consumptionReceiptHash: consumptionReceipt.consumptionReceiptHash,
    consumptionPolicyHash: consumptionPolicy.policyHash,
    consumptionMemoryHashBefore,
    permitHash: permit.permitHash,
    permitPolicyHash: permit.permitPolicyHash,
    permitMemoryHash: permitMemory.memoryHash,
    acceptanceReceiptHash: permit.acceptanceReceiptHash,
    acceptancePolicyHash: permit.acceptancePolicyHash,
    acceptanceMemoryHash: acceptanceMemory.memoryHash,
    handoffReceiptHash: permit.handoffReceiptHash,
    packageSha256: permit.packageSha256,
    inventoryHash: permit.inventoryHash,
    permitId: permit.permitId,
    consumptionId,
    externalExecutorActorId: executor.actorId,
    permitConsumptionVerified: true,
    singleUse: true,
    maximumUses: 1,
    remainingUses: 0,
    permitConsumed: true,
    publicationExecutionPermitted: false,
    consumedAt,
    nonce,
    consumptionRecorded: true,
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
    consumptionReceipt,
    controlledExternalPublicationExecutionPermitConsumptionMemory: createControlledExternalPublicationExecutionPermitConsumptionMemory({
      policy: consumptionPolicy,
      entries: [...consumptionMemory.entries, entry],
    }),
  };
}

export function inspectControlledExternalPublicationExecutionPermitConsumptionReceipt(receipt, {
  controlledExternalPublicationExecutionPermit: permit,
  controlledExternalPublicationExecutionPermitGrantPolicy: permitPolicy,
  controlledExternalPublicationExecutionPermitMemory: permitMemory,
  controlledExternalPublicationExecutionAcceptanceReceipt: acceptanceReceipt,
  controlledExternalPublicationExecutionAcceptanceMemory: acceptanceMemory,
  controlledExternalPublicationExecutionHandoffReceipt: handoffReceipt,
  controlledExternalPublicationExecutionPermitConsumptionPolicy: consumptionPolicy,
  controlledExternalPublicationExecutionPermitConsumptionMemory: consumptionMemory,
  ...upstream
}) {
  try {
    if (receipt?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION_RECEIPT_SCHEMA) throw new Error("external_publication_execution_permit_consumption_receipt_schema_invalid");
    const context = {
      ...upstream,
      controlledExternalPublicationExecutionPermitGrantPolicy: permitPolicy,
      controlledExternalPublicationExecutionPermitMemory: permitMemory,
      controlledExternalPublicationExecutionAcceptancePolicy: upstream.controlledExternalPublicationExecutionAcceptancePolicy,
      controlledExternalPublicationExecutionAcceptanceMemory: acceptanceMemory,
      controlledExternalPublicationExecutionPermitConsumptionPolicy: consumptionPolicy,
      controlledExternalPublicationExecutionPermitConsumptionMemory: consumptionMemory,
    };
    verifyContext(context);
    inspectEligiblePermit(permit, {
      ...upstream,
      controlledExternalPublicationExecutionAcceptanceReceipt: acceptanceReceipt,
      controlledExternalPublicationExecutionAcceptanceMemory: acceptanceMemory,
      controlledExternalPublicationExecutionHandoffReceipt: handoffReceipt,
      controlledExternalPublicationExecutionPermitGrantPolicy: permitPolicy,
      controlledExternalPublicationExecutionPermitMemory: permitMemory,
    });
    if (permit.acceptanceReceiptHash !== acceptanceReceipt.acceptanceReceiptHash || permit.handoffReceiptHash !== handoffReceipt.handoffReceiptHash) throw new Error("external_publication_execution_permit_consumption_chain_binding_mismatch");
    const executor = consumptionPolicy.trustedPermitConsumers.find((item) => item.keyId === receipt.externalExecutorKeyId);
    if (!executor || executor.actorId !== acceptanceReceipt.externalExecutorActorId || receipt.externalExecutorKeyId !== acceptanceReceipt.externalExecutorKeyId) throw new Error("external_publication_execution_permit_consumption_wrong_target_executor");
    validateConsumptionWindow(permit, executor, receipt.consumedAt);
    const entryIndex = consumptionMemory.entries.findIndex((entry) => entry.consumptionReceiptHash === receipt.consumptionReceiptHash);
    if (entryIndex < 0) throw new Error("external_publication_execution_permit_consumption_not_recorded");
    const consumptionMemoryHashBefore = memoryHashForEntries(consumptionPolicy, consumptionMemory.entries.slice(0, entryIndex));
    const payload = signingPayload({ permit, permitMemory, acceptanceReceipt, acceptanceMemory, consumptionPolicy, consumptionMemoryHashBefore, consumptionId: receipt.consumptionId, executor, consumedAt: receipt.consumedAt, nonce: receipt.nonce });
    for (const [key, expected] of Object.entries(payload)) if (JSON.stringify(receipt[key]) !== JSON.stringify(expected)) throw new Error(`external_publication_execution_permit_consumption_${key}_mismatch`);
    if (receipt.signatureAlgorithm !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION_SIGNATURE_ALGORITHM || typeof receipt.signature !== "string") throw new Error("external_publication_execution_permit_consumption_signature_invalid");
    if (!cryptoVerify(null, bytes(payload), executor.publicKeyPem, Buffer.from(receipt.signature, "base64url"))) throw new Error("external_publication_execution_permit_consumption_signature_verification_failed");
    if (
      receipt.consumptionRecorded !== true || receipt.permitConsumptionVerified !== true || receipt.singleUse !== true || receipt.maximumUses !== 1 ||
      receipt.remainingUses !== 0 || receipt.permitConsumed !== true || receipt.publicationExecutionPermitted !== false || receipt.controlledProofExecutionStartAllowed !== false
    ) throw new Error("external_publication_execution_permit_consumption_receipt_contract_invalid");
    for (const key of ["controlledProofExecutionStarted", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (receipt[key] !== false) throw new Error(`external_publication_execution_permit_consumption_${key}_must_be_false`);
    }
    const hashPayload = { ...receipt };
    delete hashPayload.consumptionReceiptHash;
    if (digest(hashPayload) !== receipt.consumptionReceiptHash) throw new Error("external_publication_execution_permit_consumption_receipt_hash_mismatch");
    const entry = consumptionMemory.entries[entryIndex];
    if (entry.permitHash !== permit.permitHash || entry.consumptionMemoryHashBefore !== consumptionMemoryHashBefore || entry.remainingUses !== 0 || entry.permitConsumed !== true) throw new Error("external_publication_execution_permit_consumption_memory_entry_mismatch");
    return {
      ok: true,
      consumptionReceiptHash: receipt.consumptionReceiptHash,
      permitHash: receipt.permitHash,
      permitConsumed: true,
      remainingUses: 0,
      controlledProofExecutionStarted: false,
      publicationExecuted: false,
      externalPublicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_execution_permit_consumption_receipt_invalid" };
  }
}
