import { createHash, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_RECEIPT_SCHEMA,
  inspectControlledExternalPublicationExecutionAcceptanceMemory,
  inspectControlledExternalPublicationExecutionAcceptancePolicy,
  inspectControlledExternalPublicationExecutionAcceptanceReceipt,
} from "./controlled-external-publication-execution-acceptance.mjs";

export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_GRANT_POLICY_SCHEMA = "atlas.controlled-external-publication-execution-permit-grant-policy.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_SCHEMA = "atlas.controlled-external-publication-execution-permit.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_MEMORY_SCHEMA = "atlas.controlled-external-publication-execution-permit-memory.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_MEMORY_ENTRY_SCHEMA = "atlas.controlled-external-publication-execution-permit-memory-entry.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_GRANTOR_ROLE = "release-external-publication-execution-permit-grantor";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_SIGNATURE_ALGORITHM = "ed25519";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_MAX_GRANT_DELAY_MS = 300_000;
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_MAX_VALIDITY_MS = 120_000;

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

function normalizeGrantor(grantor) {
  if (!grantor || typeof grantor !== "object") throw new Error("external_publication_execution_permit_grantor_invalid");
  assertSlug(grantor.keyId, "external_publication_execution_permit_grantor_key_id");
  assertSlug(grantor.actorId, "external_publication_execution_permit_grantor_actor_id");
  if (grantor.role !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_GRANTOR_ROLE) throw new Error("external_publication_execution_permit_grantor_role_invalid");
  if (typeof grantor.publicKeyPem !== "string" || !grantor.publicKeyPem.includes("BEGIN PUBLIC KEY")) throw new Error("external_publication_execution_permit_grantor_public_key_invalid");
  assertIso(grantor.validFrom, "external_publication_execution_permit_grantor_valid_from");
  assertIso(grantor.validUntil, "external_publication_execution_permit_grantor_valid_until");
  if (Date.parse(grantor.validUntil) <= Date.parse(grantor.validFrom)) throw new Error("external_publication_execution_permit_grantor_validity_invalid");
  if (grantor.status !== "active") throw new Error("external_publication_execution_permit_grantor_inactive");
  return {
    keyId: grantor.keyId,
    actorId: grantor.actorId,
    role: grantor.role,
    publicKeyPem: grantor.publicKeyPem,
    validFrom: grantor.validFrom,
    validUntil: grantor.validUntil,
    status: grantor.status,
  };
}

function verifyAcceptancePolicy(policy, context) {
  const inspection = inspectControlledExternalPublicationExecutionAcceptancePolicy(policy, acceptancePolicyContext(context));
  if (!inspection.ok) throw new Error(`external_publication_execution_acceptance_policy_invalid:${inspection.reason}`);
}

export function createControlledExternalPublicationExecutionPermitGrantPolicy({
  controlledExternalPublicationExecutionAcceptancePolicy: acceptancePolicy,
  trustedPermitGrantors = [],
  maximumGrantDelayMs = CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_MAX_GRANT_DELAY_MS,
  maximumPermitValidityMs = CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_MAX_VALIDITY_MS,
  ...upstream
}) {
  verifyAcceptancePolicy(acceptancePolicy, upstream);
  if (!Array.isArray(trustedPermitGrantors)) throw new Error("external_publication_execution_permit_grantors_invalid");
  const normalizedGrantors = trustedPermitGrantors.map(normalizeGrantor);
  if (new Set(normalizedGrantors.map((item) => item.keyId)).size !== normalizedGrantors.length) throw new Error("external_publication_execution_permit_duplicate_grantor_key");
  if (new Set(normalizedGrantors.map((item) => item.actorId)).size !== normalizedGrantors.length) throw new Error("external_publication_execution_permit_duplicate_grantor_actor");
  const executorKeys = new Set(acceptancePolicy.trustedExternalExecutors.map((item) => item.keyId));
  const executorActors = new Set(acceptancePolicy.trustedExternalExecutors.map((item) => item.actorId));
  if (normalizedGrantors.some((item) => executorKeys.has(item.keyId) || executorActors.has(item.actorId))) throw new Error("external_publication_execution_permit_grantor_must_be_independent");
  if (!Number.isSafeInteger(maximumGrantDelayMs) || maximumGrantDelayMs < 1 || maximumGrantDelayMs > CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_MAX_GRANT_DELAY_MS) throw new Error("external_publication_execution_permit_maximum_grant_delay_invalid");
  if (!Number.isSafeInteger(maximumPermitValidityMs) || maximumPermitValidityMs < 1 || maximumPermitValidityMs > CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_MAX_VALIDITY_MS) throw new Error("external_publication_execution_permit_maximum_validity_invalid");
  const payload = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_GRANT_POLICY_SCHEMA,
    compositionId: acceptancePolicy.compositionId,
    compositionDecisionHash: acceptancePolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: acceptancePolicy.publicationDecisionPolicyHash,
    authorizationConsumptionPolicyHash: acceptancePolicy.authorizationConsumptionPolicyHash,
    executionHandoffPolicyHash: acceptancePolicy.executionHandoffPolicyHash,
    executionAcceptancePolicyHash: acceptancePolicy.policyHash,
    requiredAcceptanceReceiptSchema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_RECEIPT_SCHEMA,
    requiredAcceptanceMemoryEntrySchema: acceptancePolicy.requiredMemoryEntrySchema,
    requiredMemoryEntrySchema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_MEMORY_ENTRY_SCHEMA,
    permitGrantorRole: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_GRANTOR_ROLE,
    signatureAlgorithm: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_SIGNATURE_ALGORITHM,
    trustedPermitGrantors: normalizedGrantors,
    maximumGrantDelayMs,
    maximumPermitValidityMs,
    eligibleRecordedExecutionAcceptanceRequiredForPermit: true,
    acceptedDecisionRequired: true,
    exactAcceptanceReceiptBindingRequired: true,
    exactAcceptanceMemoryBindingRequired: true,
    exactHandoffBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    independentPermitGrantorRequired: true,
    signedPermitRequired: true,
    appendOnlyPermitMemoryRequired: true,
    duplicateAcceptancePermitRejected: true,
    atomicMemoryHeadBindingRequired: true,
    singleUsePermitRequired: true,
    permitConsumptionRequiredBeforeExecution: true,
    permitGrantAllowed: true,
    permitConsumptionAllowed: false,
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

export function inspectControlledExternalPublicationExecutionPermitGrantPolicy(policy, context) {
  try {
    const recreated = createControlledExternalPublicationExecutionPermitGrantPolicy({
      ...context,
      trustedPermitGrantors: policy?.trustedPermitGrantors,
      maximumGrantDelayMs: policy?.maximumGrantDelayMs,
      maximumPermitValidityMs: policy?.maximumPermitValidityMs,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "external_publication_execution_permit_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "external_publication_execution_permit_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedPermitGrantors: recreated.trustedPermitGrantors.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_execution_permit_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedPermits: entries.length,
      activeUnconsumedPermits: entries.filter((entry) => entry.permitConsumed === false && entry.remainingUses === 1).length,
      consumedPermits: entries.filter((entry) => entry.permitConsumed === true).length,
      distinctAcceptances: new Set(entries.map((entry) => entry.acceptanceReceiptHash)).size,
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

export function createControlledExternalPublicationExecutionPermitMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_GRANT_POLICY_SCHEMA) throw new Error("external_publication_execution_permit_memory_policy_invalid");
  assertHash(policy.policyHash, "external_publication_execution_permit_memory_policy_hash");
  if (!Array.isArray(entries)) throw new Error("external_publication_execution_permit_memory_entries_invalid");
  let previousEntryHash = null;
  const acceptances = new Set();
  const permitIds = new Set();
  const nonces = new Set();
  entries.forEach((entry, index) => {
    if (entry?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_MEMORY_ENTRY_SCHEMA) throw new Error("external_publication_execution_permit_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("external_publication_execution_permit_memory_chain_invalid");
    if (entry.permitPolicyHash !== policy.policyHash) throw new Error("external_publication_execution_permit_memory_policy_binding_mismatch");
    if (entry.permitMemoryHashBefore !== memoryHashForEntries(policy, entries.slice(0, index))) throw new Error("external_publication_execution_permit_memory_head_binding_mismatch");
    if (entry.publicationExecutionPermitted !== true || entry.singleUse !== true || entry.maximumUses !== 1 || entry.remainingUses !== 1 || entry.permitConsumed !== false) throw new Error("external_publication_execution_permit_memory_single_use_contract_invalid");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) if (entry[key] !== false) throw new Error(`external_publication_execution_permit_memory_${key}_must_be_false`);
    const entryPayload = { ...entry };
    delete entryPayload.entryHash;
    if (digest(entryPayload) !== entry.entryHash) throw new Error("external_publication_execution_permit_memory_entry_hash_mismatch");
    if (acceptances.has(entry.acceptanceReceiptHash)) throw new Error("external_publication_execution_permit_memory_duplicate_acceptance");
    if (permitIds.has(entry.permitId)) throw new Error("external_publication_execution_permit_memory_duplicate_permit_id");
    if (nonces.has(entry.nonce)) throw new Error("external_publication_execution_permit_memory_duplicate_nonce");
    acceptances.add(entry.acceptanceReceiptHash);
    permitIds.add(entry.permitId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  });
  const payload = memoryPayload({ policy, entries });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledExternalPublicationExecutionPermitMemory(memory, { policy }) {
  try {
    const recreated = createControlledExternalPublicationExecutionPermitMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "external_publication_execution_permit_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "external_publication_execution_permit_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, ...recreated.summary };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_execution_permit_memory_invalid" };
  }
}

function permitPolicyContext(args) {
  return {
    controlledExternalPublicationExecutionAcceptancePolicy: args.controlledExternalPublicationExecutionAcceptancePolicy,
    ...acceptancePolicyContext(args),
  };
}

function verifyContext(args) {
  const policyInspection = inspectControlledExternalPublicationExecutionPermitGrantPolicy(args.controlledExternalPublicationExecutionPermitGrantPolicy, permitPolicyContext(args));
  if (!policyInspection.ok) throw new Error(`external_publication_execution_permit_policy_invalid:${policyInspection.reason}`);
  const acceptanceMemoryInspection = inspectControlledExternalPublicationExecutionAcceptanceMemory(args.controlledExternalPublicationExecutionAcceptanceMemory, { policy: args.controlledExternalPublicationExecutionAcceptancePolicy });
  if (!acceptanceMemoryInspection.ok) throw new Error(`external_publication_execution_acceptance_memory_invalid:${acceptanceMemoryInspection.reason}`);
  const permitMemoryInspection = inspectControlledExternalPublicationExecutionPermitMemory(args.controlledExternalPublicationExecutionPermitMemory, { policy: args.controlledExternalPublicationExecutionPermitGrantPolicy });
  if (!permitMemoryInspection.ok) throw new Error(`external_publication_execution_permit_memory_invalid:${permitMemoryInspection.reason}`);
}

function inspectEligibleAcceptance(receipt, args) {
  const inspection = inspectControlledExternalPublicationExecutionAcceptanceReceipt(receipt, args);
  if (!inspection.ok) throw new Error(`external_publication_execution_acceptance_receipt_invalid:${inspection.reason}`);
  if (inspection.decision !== "accepted" || inspection.executionAccepted !== true || receipt.acceptanceRecorded !== true || receipt.publicationExecutionPermitted !== false) throw new Error("eligible_recorded_execution_acceptance_required_for_permit");
  return inspection;
}

function validateWindow({ acceptanceReceipt, grantor, grantedAt, expiresAt, policy, handoffReceipt }) {
  assertIso(grantedAt, "external_publication_execution_permit_granted_at");
  assertIso(expiresAt, "external_publication_execution_permit_expires_at");
  const granted = Date.parse(grantedAt);
  const expires = Date.parse(expiresAt);
  const accepted = Date.parse(acceptanceReceipt.decidedAt);
  if (granted < accepted) throw new Error("external_publication_execution_permit_before_acceptance");
  if (granted - accepted > policy.maximumGrantDelayMs) throw new Error("external_publication_execution_permit_grant_delay_exceeded");
  if (expires <= granted || expires - granted > policy.maximumPermitValidityMs) throw new Error("external_publication_execution_permit_validity_invalid");
  if (expires > Date.parse(handoffReceipt.expiresAt)) throw new Error("external_publication_execution_permit_expiration_exceeds_handoff");
  if (granted < Date.parse(grantor.validFrom) || expires > Date.parse(grantor.validUntil)) throw new Error("external_publication_execution_permit_grantor_key_outside_validity");
}

function signingPayload({ acceptanceReceipt, acceptanceMemory, permitPolicy, permitMemoryHashBefore, permitId, grantor, reasonCode, grantedAt, expiresAt, nonce }) {
  if (!acceptanceMemory.entries.some((entry) => entry.acceptanceReceiptHash === acceptanceReceipt.acceptanceReceiptHash && entry.decision === "accepted")) throw new Error("eligible_recorded_execution_acceptance_required_for_permit");
  return {
    signingSchema: "atlas.controlled-external-publication-execution-permit-signing-payload.v1",
    compositionId: acceptanceReceipt.compositionId,
    compositionDecisionHash: acceptanceReceipt.compositionDecisionHash,
    publicationDecisionHash: acceptanceReceipt.publicationDecisionHash,
    evidenceDecisionHash: acceptanceReceipt.evidenceDecisionHash,
    authorizationConsumptionReceiptHash: acceptanceReceipt.authorizationConsumptionReceiptHash,
    handoffReceiptHash: acceptanceReceipt.handoffReceiptHash,
    handoffPolicyHash: acceptanceReceipt.handoffPolicyHash,
    handoffMemoryHash: acceptanceReceipt.handoffMemoryHash,
    acceptanceReceiptHash: acceptanceReceipt.acceptanceReceiptHash,
    acceptancePolicyHash: acceptanceReceipt.acceptancePolicyHash,
    acceptanceMemoryHash: acceptanceMemory.memoryHash,
    packageSha256: acceptanceReceipt.packageSha256,
    inventoryHash: acceptanceReceipt.inventoryHash,
    permitPolicyHash: permitPolicy.policyHash,
    permitMemoryHashBefore,
    permitId,
    acceptanceId: acceptanceReceipt.acceptanceId,
    handoffId: acceptanceReceipt.handoffId,
    permitGrantorKeyId: grantor.keyId,
    permitGrantorActorId: grantor.actorId,
    permitGrantorRole: grantor.role,
    reasonCode,
    singleUse: true,
    maximumUses: 1,
    remainingUses: 1,
    permitConsumed: false,
    publicationExecutionPermitted: true,
    grantedAt,
    expiresAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("external_publication_execution_permit_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_external_publication_execution_permit_grantor");
  return signature;
}

export function grantControlledExternalPublicationExecutionPermit({
  controlledExternalPublicationExecutionAcceptanceReceipt: acceptanceReceipt,
  controlledExternalPublicationExecutionAcceptanceMemory: acceptanceMemory,
  controlledExternalPublicationExecutionHandoffReceipt: handoffReceipt,
  controlledExternalPublicationExecutionPermitGrantPolicy: permitPolicy,
  controlledExternalPublicationExecutionPermitMemory: permitMemory,
  permitId,
  permitGrantorKeyId,
  permitGrantorPrivateKey,
  reasonCode,
  grantedAt,
  expiresAt,
  nonce,
  ...upstream
}) {
  const args = {
    ...upstream,
    controlledExternalPublicationExecutionAcceptanceMemory: acceptanceMemory,
    controlledExternalPublicationExecutionPermitGrantPolicy: permitPolicy,
    controlledExternalPublicationExecutionPermitMemory: permitMemory,
  };
  verifyContext(args);
  inspectEligibleAcceptance(acceptanceReceipt, {
    ...upstream,
    controlledExternalPublicationExecutionHandoffReceipt: handoffReceipt,
    controlledExternalPublicationExecutionAcceptanceMemory: acceptanceMemory,
  });
  assertSlug(permitId, "external_publication_execution_permit_id");
  assertSlug(permitGrantorKeyId, "external_publication_execution_permit_grantor_key_id");
  assertSlug(reasonCode, "external_publication_execution_permit_reason_code");
  assertSlug(nonce, "external_publication_execution_permit_nonce");
  if (handoffReceipt?.handoffReceiptHash !== acceptanceReceipt.handoffReceiptHash) throw new Error("external_publication_execution_permit_handoff_binding_mismatch");
  if (permitMemory.entries.some((entry) => entry.acceptanceReceiptHash === acceptanceReceipt.acceptanceReceiptHash)) throw new Error("external_publication_execution_acceptance_already_permitted");
  if (permitMemory.entries.some((entry) => entry.permitId === permitId)) throw new Error("external_publication_execution_permit_duplicate_permit_id");
  if (permitMemory.entries.some((entry) => entry.nonce === nonce)) throw new Error("external_publication_execution_permit_duplicate_nonce");
  const grantor = permitPolicy.trustedPermitGrantors.find((item) => item.keyId === permitGrantorKeyId);
  if (!grantor) throw new Error("external_publication_execution_permit_grantor_untrusted");
  validateWindow({ acceptanceReceipt, grantor, grantedAt, expiresAt, policy: permitPolicy, handoffReceipt });
  const permitMemoryHashBefore = permitMemory.memoryHash;
  const payload = signingPayload({ acceptanceReceipt, acceptanceMemory, permitPolicy, permitMemoryHashBefore, permitId, grantor, reasonCode, grantedAt, expiresAt, nonce });
  const signature = signPayload(payload, permitGrantorPrivateKey, grantor.publicKeyPem);
  const permitValue = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_SIGNATURE_ALGORITHM,
    permitRecorded: true,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const permit = { ...permitValue, permitHash: digest(permitValue) };
  const entryPayload = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_MEMORY_ENTRY_SCHEMA,
    sequence: permitMemory.entries.length + 1,
    previousEntryHash: permitMemory.entries.at(-1)?.entryHash ?? null,
    permitHash: permit.permitHash,
    permitPolicyHash: permitPolicy.policyHash,
    permitMemoryHashBefore,
    acceptanceReceiptHash: acceptanceReceipt.acceptanceReceiptHash,
    acceptancePolicyHash: acceptanceReceipt.acceptancePolicyHash,
    acceptanceMemoryHash: acceptanceMemory.memoryHash,
    handoffReceiptHash: acceptanceReceipt.handoffReceiptHash,
    packageSha256: acceptanceReceipt.packageSha256,
    inventoryHash: acceptanceReceipt.inventoryHash,
    permitId,
    acceptanceId: acceptanceReceipt.acceptanceId,
    permitGrantorActorId: grantor.actorId,
    reasonCode,
    singleUse: true,
    maximumUses: 1,
    remainingUses: 1,
    permitConsumed: false,
    publicationExecutionPermitted: true,
    permitRecorded: true,
    grantedAt,
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
    permit,
    controlledExternalPublicationExecutionPermitMemory: createControlledExternalPublicationExecutionPermitMemory({ policy: permitPolicy, entries: [...permitMemory.entries, entry] }),
  };
}

export function inspectControlledExternalPublicationExecutionPermit(permit, {
  controlledExternalPublicationExecutionAcceptanceReceipt: acceptanceReceipt,
  controlledExternalPublicationExecutionAcceptanceMemory: acceptanceMemory,
  controlledExternalPublicationExecutionHandoffReceipt: handoffReceipt,
  controlledExternalPublicationExecutionPermitGrantPolicy: permitPolicy,
  controlledExternalPublicationExecutionPermitMemory: permitMemory,
  ...upstream
}) {
  try {
    if (permit?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_SCHEMA) throw new Error("external_publication_execution_permit_schema_invalid");
    const args = { ...upstream, controlledExternalPublicationExecutionAcceptanceMemory: acceptanceMemory, controlledExternalPublicationExecutionPermitGrantPolicy: permitPolicy, controlledExternalPublicationExecutionPermitMemory: permitMemory };
    verifyContext(args);
    inspectEligibleAcceptance(acceptanceReceipt, {
      ...upstream,
      controlledExternalPublicationExecutionHandoffReceipt: handoffReceipt,
      controlledExternalPublicationExecutionAcceptanceMemory: acceptanceMemory,
    });
    if (handoffReceipt?.handoffReceiptHash !== acceptanceReceipt.handoffReceiptHash) throw new Error("external_publication_execution_permit_handoff_binding_mismatch");
    const grantor = permitPolicy.trustedPermitGrantors.find((item) => item.keyId === permit.permitGrantorKeyId);
    if (!grantor) throw new Error("external_publication_execution_permit_grantor_untrusted");
    validateWindow({ acceptanceReceipt, grantor, grantedAt: permit.grantedAt, expiresAt: permit.expiresAt, policy: permitPolicy, handoffReceipt });
    const entryIndex = permitMemory.entries.findIndex((entry) => entry.permitHash === permit.permitHash);
    if (entryIndex < 0) throw new Error("external_publication_execution_permit_not_recorded");
    const permitMemoryHashBefore = memoryHashForEntries(permitPolicy, permitMemory.entries.slice(0, entryIndex));
    const payload = signingPayload({ acceptanceReceipt, acceptanceMemory, permitPolicy, permitMemoryHashBefore, permitId: permit.permitId, grantor, reasonCode: permit.reasonCode, grantedAt: permit.grantedAt, expiresAt: permit.expiresAt, nonce: permit.nonce });
    for (const [key, expected] of Object.entries(payload)) if (JSON.stringify(permit[key]) !== JSON.stringify(expected)) throw new Error(`external_publication_execution_permit_${key}_mismatch`);
    if (permit.signatureAlgorithm !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_SIGNATURE_ALGORITHM || typeof permit.signature !== "string") throw new Error("external_publication_execution_permit_signature_invalid");
    if (!cryptoVerify(null, bytes(payload), grantor.publicKeyPem, Buffer.from(permit.signature, "base64url"))) throw new Error("external_publication_execution_permit_signature_verification_failed");
    if (permit.permitRecorded !== true || permit.publicationExecutionPermitted !== true || permit.singleUse !== true || permit.maximumUses !== 1 || permit.remainingUses !== 1 || permit.permitConsumed !== false) throw new Error("external_publication_execution_permit_contract_invalid");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) if (permit[key] !== false) throw new Error(`external_publication_execution_permit_${key}_must_be_false`);
    const hashPayload = { ...permit };
    delete hashPayload.permitHash;
    if (digest(hashPayload) !== permit.permitHash) throw new Error("external_publication_execution_permit_hash_mismatch");
    const entry = permitMemory.entries[entryIndex];
    if (entry.acceptanceReceiptHash !== acceptanceReceipt.acceptanceReceiptHash || entry.permitMemoryHashBefore !== permitMemoryHashBefore || entry.remainingUses !== 1 || entry.permitConsumed !== false) throw new Error("external_publication_execution_permit_memory_entry_mismatch");
    return { ok: true, permitHash: permit.permitHash, acceptanceReceiptHash: permit.acceptanceReceiptHash, publicationExecutionPermitted: true, permitConsumed: false, remainingUses: 1, externalPublicationExecuted: false };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_execution_permit_invalid" };
  }
}
