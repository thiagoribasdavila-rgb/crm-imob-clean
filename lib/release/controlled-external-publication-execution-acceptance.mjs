import { createHash, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_RECEIPT_SCHEMA,
  CONTROLLED_EXTERNAL_PUBLICATION_EXECUTOR_ROLE,
  inspectControlledExternalPublicationExecutionHandoffMemory,
  inspectControlledExternalPublicationExecutionHandoffPolicy,
  inspectControlledExternalPublicationExecutionHandoffReceipt,
} from "./controlled-external-publication-execution-handoff.mjs";

export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_POLICY_SCHEMA = "atlas.controlled-external-publication-execution-acceptance-policy.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_RECEIPT_SCHEMA = "atlas.controlled-external-publication-execution-acceptance-receipt.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_MEMORY_SCHEMA = "atlas.controlled-external-publication-execution-acceptance-memory.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_MEMORY_ENTRY_SCHEMA = "atlas.controlled-external-publication-execution-acceptance-memory-entry.v1";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_SIGNATURE_ALGORITHM = "ed25519";
export const CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_MAX_DELAY_MS = 300_000;

const DECISIONS = new Set(["accepted", "rejected"]);

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

function upstreamPolicyContext(args) {
  return {
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

function verifyHandoffPolicy(handoffPolicy, context) {
  const inspection = inspectControlledExternalPublicationExecutionHandoffPolicy(handoffPolicy, upstreamPolicyContext(context));
  if (!inspection.ok) throw new Error(`external_publication_execution_handoff_policy_invalid:${inspection.reason}`);
}

export function createControlledExternalPublicationExecutionAcceptancePolicy({
  controlledExternalPublicationExecutionHandoffPolicy: handoffPolicy,
  maximumAcceptanceDelayMs = CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_MAX_DELAY_MS,
  ...upstream
}) {
  verifyHandoffPolicy(handoffPolicy, upstream);
  if (!Number.isSafeInteger(maximumAcceptanceDelayMs) || maximumAcceptanceDelayMs < 1 || maximumAcceptanceDelayMs > CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_MAX_DELAY_MS) {
    throw new Error("external_publication_execution_acceptance_maximum_delay_invalid");
  }
  const payload = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_POLICY_SCHEMA,
    compositionId: handoffPolicy.compositionId,
    compositionDecisionHash: handoffPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: handoffPolicy.publicationDecisionPolicyHash,
    authorizationConsumptionPolicyHash: handoffPolicy.authorizationConsumptionPolicyHash,
    executionHandoffPolicyHash: handoffPolicy.policyHash,
    requiredHandoffReceiptSchema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF_RECEIPT_SCHEMA,
    requiredHandoffMemoryEntrySchema: handoffPolicy.requiredMemoryEntrySchema,
    requiredMemoryEntrySchema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_MEMORY_ENTRY_SCHEMA,
    externalExecutorRole: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTOR_ROLE,
    signatureAlgorithm: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_SIGNATURE_ALGORITHM,
    trustedExternalExecutors: handoffPolicy.trustedExternalExecutors,
    maximumAcceptanceDelayMs,
    recordedExecutionHandoffRequired: true,
    exactHandoffReceiptBindingRequired: true,
    exactHandoffMemoryBindingRequired: true,
    exactTargetExecutorBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    signedAcceptanceDecisionRequired: true,
    appendOnlyAcceptanceMemoryRequired: true,
    duplicateHandoffDecisionRejected: true,
    atomicMemoryHeadBindingRequired: true,
    rejectionIsTerminal: true,
    executionAcceptanceAllowed: true,
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

export function inspectControlledExternalPublicationExecutionAcceptancePolicy(policy, context) {
  try {
    const recreated = createControlledExternalPublicationExecutionAcceptancePolicy({
      ...context,
      maximumAcceptanceDelayMs: policy?.maximumAcceptanceDelayMs,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "external_publication_execution_acceptance_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "external_publication_execution_acceptance_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedExternalExecutors: recreated.trustedExternalExecutors.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_execution_acceptance_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  const accepted = entries.filter((entry) => entry.decision === "accepted").length;
  const rejected = entries.filter((entry) => entry.decision === "rejected").length;
  return {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedDecisions: entries.length,
      accepted,
      rejected,
      distinctHandoffs: new Set(entries.map((entry) => entry.handoffReceiptHash)).size,
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

export function createControlledExternalPublicationExecutionAcceptanceMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_POLICY_SCHEMA) throw new Error("external_publication_execution_acceptance_memory_policy_invalid");
  assertHash(policy.policyHash, "external_publication_execution_acceptance_memory_policy_hash");
  if (!Array.isArray(entries)) throw new Error("external_publication_execution_acceptance_memory_entries_invalid");
  let previousEntryHash = null;
  const handoffs = new Set();
  const acceptanceIds = new Set();
  const nonces = new Set();
  entries.forEach((entry, index) => {
    if (entry?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_MEMORY_ENTRY_SCHEMA) throw new Error("external_publication_execution_acceptance_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("external_publication_execution_acceptance_memory_chain_invalid");
    if (entry.acceptancePolicyHash !== policy.policyHash) throw new Error("external_publication_execution_acceptance_memory_policy_binding_mismatch");
    if (entry.acceptanceMemoryHashBefore !== memoryHashForEntries(policy, entries.slice(0, index))) throw new Error("external_publication_execution_acceptance_memory_head_binding_mismatch");
    if (!DECISIONS.has(entry.decision)) throw new Error("external_publication_execution_acceptance_memory_decision_invalid");
    if (entry.executionAccepted !== (entry.decision === "accepted")) throw new Error("external_publication_execution_acceptance_memory_decision_binding_mismatch");
    for (const key of ["publicationExecutionPermitted", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`external_publication_execution_acceptance_memory_${key}_must_be_false`);
    }
    const entryPayload = { ...entry };
    delete entryPayload.entryHash;
    if (digest(entryPayload) !== entry.entryHash) throw new Error("external_publication_execution_acceptance_memory_entry_hash_mismatch");
    if (handoffs.has(entry.handoffReceiptHash)) throw new Error("external_publication_execution_acceptance_memory_duplicate_handoff");
    if (acceptanceIds.has(entry.acceptanceId)) throw new Error("external_publication_execution_acceptance_memory_duplicate_acceptance_id");
    if (nonces.has(entry.nonce)) throw new Error("external_publication_execution_acceptance_memory_duplicate_nonce");
    handoffs.add(entry.handoffReceiptHash);
    acceptanceIds.add(entry.acceptanceId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
  });
  const payload = memoryPayload({ policy, entries });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledExternalPublicationExecutionAcceptanceMemory(memory, { policy }) {
  try {
    const recreated = createControlledExternalPublicationExecutionAcceptanceMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "external_publication_execution_acceptance_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "external_publication_execution_acceptance_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, ...recreated.summary };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_execution_acceptance_memory_invalid" };
  }
}

function acceptancePolicyContext(args) {
  return {
    controlledExternalPublicationExecutionHandoffPolicy: args.controlledExternalPublicationExecutionHandoffPolicy,
    ...upstreamPolicyContext(args),
  };
}

function verifyContext(args) {
  const policyInspection = inspectControlledExternalPublicationExecutionAcceptancePolicy(args.controlledExternalPublicationExecutionAcceptancePolicy, acceptancePolicyContext(args));
  if (!policyInspection.ok) throw new Error(`external_publication_execution_acceptance_policy_invalid:${policyInspection.reason}`);
  const handoffMemoryInspection = inspectControlledExternalPublicationExecutionHandoffMemory(args.controlledExternalPublicationExecutionHandoffMemory, { policy: args.controlledExternalPublicationExecutionHandoffPolicy });
  if (!handoffMemoryInspection.ok) throw new Error(`external_publication_execution_handoff_memory_invalid:${handoffMemoryInspection.reason}`);
  const acceptanceMemoryInspection = inspectControlledExternalPublicationExecutionAcceptanceMemory(args.controlledExternalPublicationExecutionAcceptanceMemory, { policy: args.controlledExternalPublicationExecutionAcceptancePolicy });
  if (!acceptanceMemoryInspection.ok) throw new Error(`external_publication_execution_acceptance_memory_invalid:${acceptanceMemoryInspection.reason}`);
}

function inspectHandoff(receipt, args) {
  const inspection = inspectControlledExternalPublicationExecutionHandoffReceipt(receipt, args);
  if (!inspection.ok) throw new Error(`external_publication_execution_handoff_receipt_invalid:${inspection.reason}`);
  if (inspection.handoffPrepared !== true || inspection.executionAccepted !== false || inspection.externalPublicationExecuted !== false) throw new Error("recorded_unaccepted_execution_handoff_required");
  return inspection;
}

function validateDecision({ handoffReceipt, executor, decision, reasonCode, decidedAt, maximumAcceptanceDelayMs }) {
  if (!DECISIONS.has(decision)) throw new Error("external_publication_execution_acceptance_decision_invalid");
  assertSlug(reasonCode, "external_publication_execution_acceptance_reason_code");
  assertIso(decidedAt, "external_publication_execution_acceptance_decided_at");
  const decided = Date.parse(decidedAt);
  const issued = Date.parse(handoffReceipt.issuedAt);
  const expires = Date.parse(handoffReceipt.expiresAt);
  if (decided < issued) throw new Error("external_publication_execution_acceptance_before_handoff");
  if (decided > expires || decided - issued > maximumAcceptanceDelayMs) throw new Error("external_publication_execution_acceptance_after_handoff_expiration");
  if (executor.status !== "active") throw new Error("external_publication_execution_acceptance_executor_inactive");
  if (decided < Date.parse(executor.validFrom) || decided > Date.parse(executor.validUntil)) throw new Error("external_publication_execution_acceptance_executor_key_outside_validity");
}

function signingPayload({ handoffReceipt, handoffMemory, acceptancePolicy, acceptanceMemoryHashBefore, acceptanceId, executor, decision, reasonCode, decidedAt, nonce }) {
  if (!handoffMemory.entries.some((entry) => entry.handoffReceiptHash === handoffReceipt.handoffReceiptHash)) throw new Error("external_publication_execution_handoff_not_recorded_for_acceptance");
  return {
    signingSchema: "atlas.controlled-external-publication-execution-acceptance-signing-payload.v1",
    compositionId: handoffReceipt.compositionId,
    compositionDecisionHash: handoffReceipt.compositionDecisionHash,
    publicationDecisionHash: handoffReceipt.publicationDecisionHash,
    evidenceDecisionHash: handoffReceipt.evidenceDecisionHash,
    authorizationConsumptionReceiptHash: handoffReceipt.authorizationConsumptionReceiptHash,
    handoffReceiptHash: handoffReceipt.handoffReceiptHash,
    handoffPolicyHash: handoffReceipt.handoffPolicyHash,
    handoffMemoryHash: handoffMemory.memoryHash,
    packageSha256: handoffReceipt.packageSha256,
    inventoryHash: handoffReceipt.inventoryHash,
    acceptancePolicyHash: acceptancePolicy.policyHash,
    acceptanceMemoryHashBefore,
    acceptanceId,
    handoffId: handoffReceipt.handoffId,
    externalExecutorKeyId: executor.keyId,
    externalExecutorActorId: executor.actorId,
    externalExecutorRole: executor.role,
    decision,
    reasonCode,
    executionAccepted: decision === "accepted",
    publicationExecutionPermitted: false,
    decidedAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("external_publication_execution_acceptance_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_external_publication_executor");
  return signature;
}

export function recordControlledExternalPublicationExecutionAcceptance({
  controlledExternalPublicationExecutionHandoffReceipt: handoffReceipt,
  controlledExternalPublicationExecutionHandoffMemory: handoffMemory,
  controlledExternalPublicationExecutionAcceptancePolicy: acceptancePolicy,
  controlledExternalPublicationExecutionAcceptanceMemory: acceptanceMemory,
  acceptanceId,
  externalExecutorKeyId,
  externalExecutorPrivateKey,
  decision,
  reasonCode,
  decidedAt,
  nonce,
  ...upstream
}) {
  const args = {
    ...upstream,
    controlledExternalPublicationExecutionHandoffMemory: handoffMemory,
    controlledExternalPublicationExecutionAcceptancePolicy: acceptancePolicy,
    controlledExternalPublicationExecutionAcceptanceMemory: acceptanceMemory,
  };
  verifyContext(args);
  inspectHandoff(handoffReceipt, { ...upstream, controlledExternalPublicationExecutionHandoffMemory: handoffMemory });
  assertSlug(acceptanceId, "external_publication_execution_acceptance_id");
  assertSlug(externalExecutorKeyId, "external_publication_execution_acceptance_executor_key_id");
  assertSlug(nonce, "external_publication_execution_acceptance_nonce");
  if (acceptanceMemory.entries.some((entry) => entry.handoffReceiptHash === handoffReceipt.handoffReceiptHash)) throw new Error("external_publication_execution_handoff_decision_already_recorded");
  if (acceptanceMemory.entries.some((entry) => entry.acceptanceId === acceptanceId)) throw new Error("external_publication_execution_acceptance_duplicate_acceptance_id");
  if (acceptanceMemory.entries.some((entry) => entry.nonce === nonce)) throw new Error("external_publication_execution_acceptance_duplicate_nonce");
  if (externalExecutorKeyId !== handoffReceipt.externalExecutorKeyId) throw new Error("external_publication_execution_acceptance_wrong_target_executor");
  const executor = acceptancePolicy.trustedExternalExecutors.find((item) => item.keyId === externalExecutorKeyId);
  if (!executor || executor.actorId !== handoffReceipt.externalExecutorActorId) throw new Error("external_publication_execution_acceptance_executor_untrusted");
  validateDecision({ handoffReceipt, executor, decision, reasonCode, decidedAt, maximumAcceptanceDelayMs: acceptancePolicy.maximumAcceptanceDelayMs });
  const acceptanceMemoryHashBefore = acceptanceMemory.memoryHash;
  const payload = signingPayload({ handoffReceipt, handoffMemory, acceptancePolicy, acceptanceMemoryHashBefore, acceptanceId, executor, decision, reasonCode, decidedAt, nonce });
  const signature = signPayload(payload, externalExecutorPrivateKey, executor.publicKeyPem);
  const receiptValue = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_RECEIPT_SCHEMA,
    ...payload,
    signatureAlgorithm: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_SIGNATURE_ALGORITHM,
    acceptanceRecorded: true,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const acceptanceReceipt = { ...receiptValue, acceptanceReceiptHash: digest(receiptValue) };
  const entryPayload = {
    schema: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_MEMORY_ENTRY_SCHEMA,
    sequence: acceptanceMemory.entries.length + 1,
    previousEntryHash: acceptanceMemory.entries.at(-1)?.entryHash ?? null,
    acceptanceReceiptHash: acceptanceReceipt.acceptanceReceiptHash,
    acceptancePolicyHash: acceptancePolicy.policyHash,
    acceptanceMemoryHashBefore,
    handoffReceiptHash: handoffReceipt.handoffReceiptHash,
    handoffPolicyHash: handoffReceipt.handoffPolicyHash,
    handoffMemoryHash: handoffMemory.memoryHash,
    packageSha256: handoffReceipt.packageSha256,
    inventoryHash: handoffReceipt.inventoryHash,
    acceptanceId,
    handoffId: handoffReceipt.handoffId,
    externalExecutorActorId: executor.actorId,
    decision,
    reasonCode,
    executionAccepted: decision === "accepted",
    acceptanceRecorded: true,
    publicationExecutionPermitted: false,
    decidedAt,
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
    acceptanceReceipt,
    controlledExternalPublicationExecutionAcceptanceMemory: createControlledExternalPublicationExecutionAcceptanceMemory({ policy: acceptancePolicy, entries: [...acceptanceMemory.entries, entry] }),
  };
}

export function inspectControlledExternalPublicationExecutionAcceptanceReceipt(receipt, {
  controlledExternalPublicationExecutionHandoffReceipt: handoffReceipt,
  controlledExternalPublicationExecutionHandoffMemory: handoffMemory,
  controlledExternalPublicationExecutionAcceptancePolicy: acceptancePolicy,
  controlledExternalPublicationExecutionAcceptanceMemory: acceptanceMemory,
  ...upstream
}) {
  try {
    if (receipt?.schema !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_RECEIPT_SCHEMA) throw new Error("external_publication_execution_acceptance_receipt_schema_invalid");
    const args = { ...upstream, controlledExternalPublicationExecutionHandoffMemory: handoffMemory, controlledExternalPublicationExecutionAcceptancePolicy: acceptancePolicy, controlledExternalPublicationExecutionAcceptanceMemory: acceptanceMemory };
    verifyContext(args);
    inspectHandoff(handoffReceipt, { ...upstream, controlledExternalPublicationExecutionHandoffMemory: handoffMemory });
    const executor = acceptancePolicy.trustedExternalExecutors.find((item) => item.keyId === receipt.externalExecutorKeyId);
    if (!executor || executor.actorId !== handoffReceipt.externalExecutorActorId || receipt.externalExecutorKeyId !== handoffReceipt.externalExecutorKeyId) throw new Error("external_publication_execution_acceptance_wrong_target_executor");
    validateDecision({ handoffReceipt, executor, decision: receipt.decision, reasonCode: receipt.reasonCode, decidedAt: receipt.decidedAt, maximumAcceptanceDelayMs: acceptancePolicy.maximumAcceptanceDelayMs });
    const entryIndex = acceptanceMemory.entries.findIndex((entry) => entry.acceptanceReceiptHash === receipt.acceptanceReceiptHash);
    if (entryIndex < 0) throw new Error("external_publication_execution_acceptance_not_recorded");
    const acceptanceMemoryHashBefore = memoryHashForEntries(acceptancePolicy, acceptanceMemory.entries.slice(0, entryIndex));
    const payload = signingPayload({ handoffReceipt, handoffMemory, acceptancePolicy, acceptanceMemoryHashBefore, acceptanceId: receipt.acceptanceId, executor, decision: receipt.decision, reasonCode: receipt.reasonCode, decidedAt: receipt.decidedAt, nonce: receipt.nonce });
    for (const [key, expected] of Object.entries(payload)) if (JSON.stringify(receipt[key]) !== JSON.stringify(expected)) throw new Error(`external_publication_execution_acceptance_${key}_mismatch`);
    if (receipt.signatureAlgorithm !== CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE_SIGNATURE_ALGORITHM || typeof receipt.signature !== "string") throw new Error("external_publication_execution_acceptance_signature_invalid");
    if (!cryptoVerify(null, bytes(payload), executor.publicKeyPem, Buffer.from(receipt.signature, "base64url"))) throw new Error("external_publication_execution_acceptance_signature_verification_failed");
    if (receipt.acceptanceRecorded !== true || receipt.executionAccepted !== (receipt.decision === "accepted") || receipt.publicationExecutionPermitted !== false) throw new Error("external_publication_execution_acceptance_receipt_contract_invalid");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) if (receipt[key] !== false) throw new Error(`external_publication_execution_acceptance_${key}_must_be_false`);
    const hashPayload = { ...receipt };
    delete hashPayload.acceptanceReceiptHash;
    if (digest(hashPayload) !== receipt.acceptanceReceiptHash) throw new Error("external_publication_execution_acceptance_receipt_hash_mismatch");
    const entry = acceptanceMemory.entries[entryIndex];
    if (entry.handoffReceiptHash !== handoffReceipt.handoffReceiptHash || entry.acceptanceMemoryHashBefore !== acceptanceMemoryHashBefore) throw new Error("external_publication_execution_acceptance_memory_entry_mismatch");
    return { ok: true, acceptanceReceiptHash: receipt.acceptanceReceiptHash, handoffReceiptHash: receipt.handoffReceiptHash, decision: receipt.decision, executionAccepted: receipt.executionAccepted, publicationExecutionPermitted: false, externalPublicationExecuted: false };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "external_publication_execution_acceptance_receipt_invalid" };
  }
}
