import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  inspectAuthorizedPublicationExecutionMemory,
  inspectAuthorizedPublicationExecutionPolicy,
  inspectAuthorizedPublicationExecutionReceipt,
} from "./authorized-publication-execution.mjs";

export const PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATION_POLICY_SCHEMA = "atlas.publication-execution-evidence-adjudication-policy.v1";
export const PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATION_DECISION_SCHEMA = "atlas.publication-execution-evidence-adjudication-decision.v1";
export const PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATION_MEMORY_SCHEMA = "atlas.publication-execution-evidence-adjudication-memory.v1";
export const PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATION_MEMORY_ENTRY_SCHEMA = "atlas.publication-execution-evidence-adjudication-memory-entry.v1";
export const PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATOR_ROLE = "release-publication-evidence-adjudicator";
export const PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATION_SIGNATURE_ALGORITHM = "ed25519";

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

function normalizeAdjudicator(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("publication_evidence_adjudicator_invalid");
  assertSlug(value.keyId, "publication_evidence_adjudicator_key_id");
  assertSlug(value.actorId, "publication_evidence_adjudicator_actor_id");
  if (value.role !== PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATOR_ROLE) throw new Error("publication_evidence_adjudicator_role_invalid");
  if (!["active", "inactive"].includes(value.status)) throw new Error("publication_evidence_adjudicator_status_invalid");
  assertIso(value.validFrom, "publication_evidence_adjudicator_valid_from");
  assertIso(value.validUntil, "publication_evidence_adjudicator_valid_until");
  if (Date.parse(value.validUntil) <= Date.parse(value.validFrom)) throw new Error("publication_evidence_adjudicator_validity_invalid");
  try {
    const key = createPublicKey(value.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch {
    throw new Error("publication_evidence_adjudicator_public_key_invalid");
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

function priorIdentities({ executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy }) {
  return new Set([
    ...(publicationPolicy.trustedPublicationDirectors ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(evidencePolicy.trustedEvidenceCustodians ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(assemblyPolicy.trustedPackageAssemblers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(packageAuthorizationPolicy.trustedPackageAuthorizers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(executionAuthorizationPolicy.trustedExecutionAuthorizers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(executionPolicy.trustedExecutors ?? []).flatMap((item) => [item.keyId, item.actorId]),
  ]);
}

function verifyExecutionPolicy(executionPolicy, context) {
  const inspection = inspectAuthorizedPublicationExecutionPolicy(executionPolicy, context);
  if (!inspection.ok) throw new Error(`publication_execution_policy_invalid:${inspection.reason}`);
}

export function createPublicationExecutionEvidenceAdjudicationPolicy({
  executionPolicy,
  executionAuthorizationPolicy,
  publicationPolicy,
  evidencePolicy,
  assemblyPolicy,
  packageAuthorizationPolicy,
  trustedAdjudicators = [],
  maxDecisionDelaySeconds = 900,
  minReasonLength = 12,
  minimumEvidenceItems = 1,
}) {
  const priorContext = { executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy };
  verifyExecutionPolicy(executionPolicy, priorContext);
  if (!Array.isArray(trustedAdjudicators)) throw new Error("trusted_publication_evidence_adjudicators_invalid");
  const adjudicators = trustedAdjudicators.map(normalizeAdjudicator).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(adjudicators.map((item) => item.keyId)).size !== adjudicators.length) throw new Error("duplicate_publication_evidence_adjudicator_key_id");
  if (new Set(adjudicators.map((item) => item.actorId)).size !== adjudicators.length) throw new Error("duplicate_publication_evidence_adjudicator_actor_id");
  const forbidden = priorIdentities({ executionPolicy, ...priorContext });
  if (adjudicators.some((item) => forbidden.has(item.keyId) || forbidden.has(item.actorId))) {
    throw new Error("publication_evidence_adjudicator_must_be_independent");
  }
  if (!Number.isInteger(maxDecisionDelaySeconds) || maxDecisionDelaySeconds < 1 || maxDecisionDelaySeconds > 86400) throw new Error("publication_evidence_max_decision_delay_invalid");
  if (!Number.isInteger(minReasonLength) || minReasonLength < 8 || minReasonLength > 500) throw new Error("publication_evidence_min_reason_length_invalid");
  if (!Number.isInteger(minimumEvidenceItems) || minimumEvidenceItems < 1 || minimumEvidenceItems > executionPolicy.maxEvidenceItems) throw new Error("publication_evidence_minimum_items_invalid");
  const payload = {
    schema: PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATION_POLICY_SCHEMA,
    compositionId: executionPolicy.compositionId,
    compositionDecisionHash: executionPolicy.compositionDecisionHash,
    publicationDecisionPolicyHash: executionPolicy.publicationDecisionPolicyHash,
    executionAuthorizationPolicyHash: executionPolicy.executionAuthorizationPolicyHash,
    packageAuthorizationPolicyHash: executionPolicy.packageAuthorizationPolicyHash,
    packageAssemblyPolicyHash: executionPolicy.packageAssemblyPolicyHash,
    packageEvidencePolicyHash: executionPolicy.packageEvidencePolicyHash,
    executionPolicyHash: executionPolicy.policyHash,
    requiredReceiptSchema: "atlas.authorized-publication-execution-receipt.v1",
    requiredMemoryEntrySchema: PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATION_MEMORY_ENTRY_SCHEMA,
    adjudicatorRole: PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATOR_ROLE,
    signatureAlgorithm: PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATION_SIGNATURE_ALGORITHM,
    trustedAdjudicators: adjudicators,
    allowedOutcomes: ["accepted", "rejected"],
    maxDecisionDelaySeconds,
    minReasonLength,
    minimumEvidenceItems,
    exactReceiptBindingRequired: true,
    exactExecutionMemoryBindingRequired: true,
    exactAuthorizationBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    independentEvidenceAdjudicatorRequired: true,
    signedDecisionRequired: true,
    appendOnlyAdjudicationMemoryRequired: true,
    duplicateReceiptAdjudicationRejected: true,
    successfulRecordedProofRequiredForAcceptance: true,
    externalPublicationAuthorizationAllowed: false,
    networkAccessAllowed: false,
    databaseMutationAllowed: false,
    externalPublicationAllowed: false,
    automaticPackageGeneration: false,
    automaticBuild: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectPublicationExecutionEvidenceAdjudicationPolicy(policy, context) {
  try {
    const recreated = createPublicationExecutionEvidenceAdjudicationPolicy({
      ...context,
      trustedAdjudicators: policy?.trustedAdjudicators,
      maxDecisionDelaySeconds: policy?.maxDecisionDelaySeconds,
      minReasonLength: policy?.minReasonLength,
      minimumEvidenceItems: policy?.minimumEvidenceItems,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "publication_evidence_adjudication_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "publication_evidence_adjudication_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedAdjudicators: recreated.trustedAdjudicators.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "publication_evidence_adjudication_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATION_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedDecisions: entries.length,
      acceptedEvidence: entries.filter((entry) => entry.outcome === "accepted").length,
      rejectedEvidence: entries.filter((entry) => entry.outcome === "rejected").length,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      evidenceAccepted: entries.some((entry) => entry.outcome === "accepted"),
      externalPublicationAuthorized: false,
      publicationExecuted: false,
      externalPublicationExecuted: false,
      buildExecuted: false,
      deployExecuted: false,
      releasePromoted: false,
    },
  };
}

export function createPublicationExecutionEvidenceAdjudicationMemory({ policy, entries = [] }) {
  if (policy?.schema !== PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATION_POLICY_SCHEMA) throw new Error("publication_evidence_adjudication_memory_policy_invalid");
  if (!Array.isArray(entries)) throw new Error("publication_evidence_adjudication_memory_entries_invalid");
  let previousEntryHash = null;
  const receiptHashes = new Set();
  const decisionIds = new Set();
  const nonces = new Set();
  const normalized = entries.map((entry, index) => {
    if (entry?.schema !== PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATION_MEMORY_ENTRY_SCHEMA) throw new Error("publication_evidence_adjudication_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("publication_evidence_adjudication_memory_chain_invalid");
    for (const field of ["decisionHash", "receiptHash", "authorizationHash", "publicationDecisionHash", "packageSha256", "inventoryHash", "executionPolicyHash", "executionMemoryHash", "executionMemoryEntryHash"]) assertHash(entry[field], `publication_evidence_adjudication_memory_${field}`);
    assertSlug(entry.decisionId, "publication_evidence_adjudication_memory_decision_id");
    assertSlug(entry.executionId, "publication_evidence_adjudication_memory_execution_id");
    assertSlug(entry.nonce, "publication_evidence_adjudication_memory_nonce");
    if (!policy.allowedOutcomes.includes(entry.outcome)) throw new Error("publication_evidence_adjudication_memory_outcome_invalid");
    if (receiptHashes.has(entry.receiptHash)) throw new Error("publication_execution_evidence_already_adjudicated");
    if (decisionIds.has(entry.decisionId)) throw new Error("publication_evidence_adjudication_duplicate_decision_id");
    if (nonces.has(entry.nonce)) throw new Error("publication_evidence_adjudication_duplicate_nonce");
    if (entry.decisionRecorded !== true || entry.publicationProofVerified !== true || entry.evidenceAccepted !== (entry.outcome === "accepted")) throw new Error("publication_evidence_adjudication_memory_safety_contract_invalid");
    for (const key of ["externalPublicationAuthorized", "publicationExecuted", "externalPublicationExecuted", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`publication_evidence_adjudication_memory_${key}_must_be_false`);
    }
    const hashPayload = { ...entry };
    delete hashPayload.entryHash;
    if (digest(hashPayload) !== entry.entryHash) throw new Error("publication_evidence_adjudication_memory_entry_hash_mismatch");
    receiptHashes.add(entry.receiptHash);
    decisionIds.add(entry.decisionId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
    return { ...entry };
  });
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectPublicationExecutionEvidenceAdjudicationMemory(memory, { policy }) {
  try {
    const recreated = createPublicationExecutionEvidenceAdjudicationMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "publication_evidence_adjudication_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "publication_evidence_adjudication_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, recordedDecisions: recreated.entries.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "publication_evidence_adjudication_memory_invalid" };
  }
}

function verifyAdjudicationContext({ publicationEvidenceAdjudicationPolicy, publicationEvidenceAdjudicationMemory, executionPolicy, executionMemory, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy }) {
  const context = { executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy };
  const policyInspection = inspectPublicationExecutionEvidenceAdjudicationPolicy(publicationEvidenceAdjudicationPolicy, context);
  if (!policyInspection.ok) throw new Error(`publication_evidence_adjudication_policy_invalid:${policyInspection.reason}`);
  const memoryInspection = inspectPublicationExecutionEvidenceAdjudicationMemory(publicationEvidenceAdjudicationMemory, { policy: publicationEvidenceAdjudicationPolicy });
  if (!memoryInspection.ok) throw new Error(`publication_evidence_adjudication_memory_invalid:${memoryInspection.reason}`);
  const executionMemoryInspection = inspectAuthorizedPublicationExecutionMemory(executionMemory, { policy: executionPolicy });
  if (!executionMemoryInspection.ok) throw new Error(`publication_execution_memory_invalid:${executionMemoryInspection.reason}`);
}

function validateDecisionWindow(receipt, adjudicator, policy, decidedAt) {
  assertIso(decidedAt, "publication_evidence_adjudication_decided_at");
  const decided = Date.parse(decidedAt);
  const completed = Date.parse(receipt.completedAt);
  if (decided < completed) throw new Error("publication_evidence_adjudication_before_execution_completed");
  if (decided - completed > policy.maxDecisionDelaySeconds * 1000) throw new Error("publication_evidence_adjudication_delay_exceeded");
  if (adjudicator.status !== "active") throw new Error("publication_evidence_adjudicator_inactive");
  if (adjudicator.role !== policy.adjudicatorRole) throw new Error("publication_evidence_adjudicator_role_mismatch");
  if (decided < Date.parse(adjudicator.validFrom) || decided > Date.parse(adjudicator.validUntil)) throw new Error("publication_evidence_adjudicator_key_outside_validity");
}

function validateOutcome(receipt, policy, outcome, reasonCode, reason) {
  if (!policy.allowedOutcomes.includes(outcome)) throw new Error("publication_evidence_adjudication_outcome_invalid");
  const expectedOutcome = receipt.status === "passed" && receipt.exitCode === 0 && receipt.evidence.length >= policy.minimumEvidenceItems ? "accepted" : "rejected";
  if (outcome !== expectedOutcome) throw new Error(expectedOutcome === "accepted" ? "valid_publication_execution_evidence_cannot_be_rejected" : "failed_publication_execution_evidence_cannot_be_accepted");
  const expectedReasonCode = outcome === "accepted" ? "local-proof-accepted" : (receipt.status === "failed" ? "execution-failed" : "evidence-insufficient");
  if (reasonCode !== expectedReasonCode) throw new Error("publication_evidence_adjudication_reason_code_invalid");
  if (typeof reason !== "string" || reason.trim().length < policy.minReasonLength || reason.trim().length > 2000) throw new Error("publication_evidence_adjudication_reason_invalid");
  return { outcome, reasonCode, reason: reason.trim(), evidenceAccepted: outcome === "accepted" };
}

function decisionSigningPayload({ receipt, authorization, executionPolicy, executionMemory, adjudicationPolicy, decisionId, adjudicator, verdict, decidedAt, nonce }) {
  const executionMemoryEntry = executionMemory.entries.find((entry) => entry.receiptHash === receipt.receiptHash);
  if (!executionMemoryEntry) throw new Error("publication_execution_receipt_not_recorded");
  return {
    signingSchema: "atlas.publication-execution-evidence-adjudication-signing-payload.v1",
    compositionId: receipt.compositionId,
    compositionDecisionHash: receipt.compositionDecisionHash,
    authorizationHash: authorization.authorizationHash,
    authorizationId: authorization.authorizationId,
    publicationDecisionHash: receipt.publicationDecisionHash,
    packageName: receipt.packageName,
    packageSha256: receipt.packageSha256,
    packageSizeBytes: receipt.packageSizeBytes,
    inventoryHash: receipt.inventoryHash,
    inventoryFileCount: receipt.inventoryFileCount,
    inventoryTotalBytes: receipt.inventoryTotalBytes,
    executionPolicyHash: executionPolicy.policyHash,
    executionMemoryHash: executionMemory.memoryHash,
    executionMemoryEntryHash: executionMemoryEntry.entryHash,
    receiptHash: receipt.receiptHash,
    executionId: receipt.executionId,
    executorKeyId: receipt.executorKeyId,
    executorActorId: receipt.executorActorId,
    handlerId: receipt.handlerId,
    handlerDigest: receipt.handlerDigest,
    adjudicationPolicyHash: adjudicationPolicy.policyHash,
    decisionId,
    adjudicatorKeyId: adjudicator.keyId,
    adjudicatorActorId: adjudicator.actorId,
    adjudicatorRole: adjudicator.role,
    outcome: verdict.outcome,
    reasonCode: verdict.reasonCode,
    reason: verdict.reason,
    evidenceAccepted: verdict.evidenceAccepted,
    decidedAt,
    nonce,
  };
}

function signPayload(payload, privateKey, publicKeyPem) {
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("publication_evidence_adjudication_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_publication_evidence_adjudicator");
  return signature;
}

function inspectReceipt(receipt, context) {
  const inspection = inspectAuthorizedPublicationExecutionReceipt(receipt, context);
  if (!inspection.ok) throw new Error(`publication_execution_receipt_invalid:${inspection.reason}`);
  return inspection;
}

export function adjudicatePublicationExecutionEvidence({
  publicationExecutionReceipt: receipt,
  publicationExecutionAuthorization: authorization,
  authorizedPublicationExecutionPolicy: executionPolicy,
  executionMemory,
  publicationEvidenceAdjudicationPolicy,
  publicationEvidenceAdjudicationMemory,
  decisionId,
  adjudicatorKeyId,
  adjudicatorPrivateKey,
  outcome,
  reasonCode,
  reason,
  decidedAt,
  nonce,
  ...authorizationContext
}) {
  const { executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy } = authorizationContext;
  verifyAdjudicationContext({ publicationEvidenceAdjudicationPolicy, publicationEvidenceAdjudicationMemory, executionPolicy, executionMemory, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy });
  inspectReceipt(receipt, { ...authorizationContext, publicationExecutionAuthorization: authorization, authorizedPublicationExecutionPolicy: executionPolicy, executionMemory });
  assertSlug(decisionId, "publication_evidence_adjudication_decision_id");
  assertSlug(adjudicatorKeyId, "publication_evidence_adjudicator_key_id");
  assertSlug(nonce, "publication_evidence_adjudication_nonce");
  if (publicationEvidenceAdjudicationMemory.entries.some((entry) => entry.receiptHash === receipt.receiptHash)) throw new Error("publication_execution_evidence_already_adjudicated");
  if (publicationEvidenceAdjudicationMemory.entries.some((entry) => entry.decisionId === decisionId)) throw new Error("publication_evidence_adjudication_duplicate_decision_id");
  if (publicationEvidenceAdjudicationMemory.entries.some((entry) => entry.nonce === nonce)) throw new Error("publication_evidence_adjudication_duplicate_nonce");
  const adjudicator = publicationEvidenceAdjudicationPolicy.trustedAdjudicators.find((item) => item.keyId === adjudicatorKeyId);
  if (!adjudicator) throw new Error("publication_evidence_adjudicator_untrusted");
  if (adjudicator.keyId === receipt.executorKeyId || adjudicator.actorId === receipt.executorActorId) throw new Error("executor_cannot_adjudicate_own_publication_proof");
  validateDecisionWindow(receipt, adjudicator, publicationEvidenceAdjudicationPolicy, decidedAt);
  const verdict = validateOutcome(receipt, publicationEvidenceAdjudicationPolicy, outcome, reasonCode, reason);
  const payload = decisionSigningPayload({ receipt, authorization, executionPolicy, executionMemory, adjudicationPolicy: publicationEvidenceAdjudicationPolicy, decisionId, adjudicator, verdict, decidedAt, nonce });
  const signature = signPayload(payload, adjudicatorPrivateKey, adjudicator.publicKeyPem);
  const decisionValue = {
    schema: PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATION_DECISION_SCHEMA,
    ...payload,
    signatureAlgorithm: PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATION_SIGNATURE_ALGORITHM,
    decisionRecorded: true,
    publicationProofVerified: true,
    externalPublicationAuthorized: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const decision = { ...decisionValue, decisionHash: digest(decisionValue) };
  const entryPayload = {
    schema: PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATION_MEMORY_ENTRY_SCHEMA,
    sequence: publicationEvidenceAdjudicationMemory.entries.length + 1,
    previousEntryHash: publicationEvidenceAdjudicationMemory.entries.at(-1)?.entryHash ?? null,
    decisionHash: decision.decisionHash,
    decisionId,
    nonce,
    receiptHash: receipt.receiptHash,
    executionId: receipt.executionId,
    authorizationHash: authorization.authorizationHash,
    publicationDecisionHash: receipt.publicationDecisionHash,
    packageSha256: receipt.packageSha256,
    inventoryHash: receipt.inventoryHash,
    executionPolicyHash: executionPolicy.policyHash,
    executionMemoryHash: executionMemory.memoryHash,
    executionMemoryEntryHash: payload.executionMemoryEntryHash,
    adjudicatorActorId: adjudicator.actorId,
    outcome: verdict.outcome,
    reasonCode: verdict.reasonCode,
    evidenceAccepted: verdict.evidenceAccepted,
    decidedAt,
    decisionRecorded: true,
    publicationProofVerified: true,
    externalPublicationAuthorized: false,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  const entry = { ...entryPayload, entryHash: digest(entryPayload) };
  return {
    decision,
    publicationEvidenceAdjudicationMemory: createPublicationExecutionEvidenceAdjudicationMemory({ policy: publicationEvidenceAdjudicationPolicy, entries: [...publicationEvidenceAdjudicationMemory.entries, entry] }),
  };
}

export function inspectPublicationExecutionEvidenceAdjudicationDecision(decision, {
  publicationExecutionReceipt: receipt,
  publicationExecutionAuthorization: authorization,
  authorizedPublicationExecutionPolicy: executionPolicy,
  executionMemory,
  publicationEvidenceAdjudicationPolicy,
  publicationEvidenceAdjudicationMemory,
  ...authorizationContext
}) {
  try {
    if (decision?.schema !== PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATION_DECISION_SCHEMA) throw new Error("publication_evidence_adjudication_decision_schema_invalid");
    const { executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy } = authorizationContext;
    verifyAdjudicationContext({ publicationEvidenceAdjudicationPolicy, publicationEvidenceAdjudicationMemory, executionPolicy, executionMemory, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy });
    inspectReceipt(receipt, { ...authorizationContext, publicationExecutionAuthorization: authorization, authorizedPublicationExecutionPolicy: executionPolicy, executionMemory });
    const adjudicator = publicationEvidenceAdjudicationPolicy.trustedAdjudicators.find((item) => item.keyId === decision.adjudicatorKeyId);
    if (!adjudicator) throw new Error("publication_evidence_adjudicator_untrusted");
    if (adjudicator.keyId === receipt.executorKeyId || adjudicator.actorId === receipt.executorActorId) throw new Error("executor_cannot_adjudicate_own_publication_proof");
    validateDecisionWindow(receipt, adjudicator, publicationEvidenceAdjudicationPolicy, decision.decidedAt);
    const verdict = validateOutcome(receipt, publicationEvidenceAdjudicationPolicy, decision.outcome, decision.reasonCode, decision.reason);
    const payload = decisionSigningPayload({ receipt, authorization, executionPolicy, executionMemory, adjudicationPolicy: publicationEvidenceAdjudicationPolicy, decisionId: decision.decisionId, adjudicator, verdict, decidedAt: decision.decidedAt, nonce: decision.nonce });
    for (const [key, expected] of Object.entries(payload)) {
      if (JSON.stringify(decision[key]) !== JSON.stringify(expected)) throw new Error(`publication_evidence_adjudication_decision_${key}_mismatch`);
    }
    if (decision.signatureAlgorithm !== PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATION_SIGNATURE_ALGORITHM || typeof decision.signature !== "string") throw new Error("publication_evidence_adjudication_decision_signature_invalid");
    if (!cryptoVerify(null, bytes(payload), adjudicator.publicKeyPem, Buffer.from(decision.signature, "base64url"))) throw new Error("publication_evidence_adjudication_decision_signature_verification_failed");
    if (decision.decisionRecorded !== true || decision.publicationProofVerified !== true || decision.evidenceAccepted !== verdict.evidenceAccepted) throw new Error("publication_evidence_adjudication_decision_contract_invalid");
    for (const key of ["externalPublicationAuthorized", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (decision[key] !== false) throw new Error(`publication_evidence_adjudication_decision_${key}_must_be_false`);
    }
    const hashPayload = { ...decision };
    delete hashPayload.decisionHash;
    if (digest(hashPayload) !== decision.decisionHash) throw new Error("publication_evidence_adjudication_decision_hash_mismatch");
    if (!publicationEvidenceAdjudicationMemory.entries.some((entry) => entry.decisionHash === decision.decisionHash && entry.receiptHash === receipt.receiptHash)) throw new Error("publication_evidence_adjudication_decision_not_recorded");
    return { ok: true, decisionHash: decision.decisionHash, outcome: decision.outcome, evidenceAccepted: verdict.evidenceAccepted, externalPublicationAuthorized: false };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "publication_evidence_adjudication_decision_invalid" };
  }
}
