import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  inspectAuthorizedReleasePackageAssemblyMemory,
  inspectAuthorizedReleasePackageAssemblyPolicy,
  inspectAuthorizedReleasePackageAssemblyReceipt,
} from "./authorized-release-package-assembly.mjs";

export const AUTHORIZED_PACKAGE_EVIDENCE_POLICY_SCHEMA = "atlas.authorized-package-evidence-commitment-policy.v1";
export const AUTHORIZED_PACKAGE_EVIDENCE_SCHEMA = "atlas.authorized-package-evidence-commitment.v1";
export const AUTHORIZED_PACKAGE_EVIDENCE_MEMORY_SCHEMA = "atlas.authorized-package-evidence-memory.v1";
export const AUTHORIZED_PACKAGE_EVIDENCE_MEMORY_ENTRY_SCHEMA = "atlas.authorized-package-evidence-memory-entry.v1";
export const AUTHORIZED_PACKAGE_EVIDENCE_SIGNATURE_ALGORITHM = "ed25519";
export const AUTHORIZED_PACKAGE_EVIDENCE_CUSTODIAN_ROLE = "release-package-evidence-custodian";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function bytes(value) { return Buffer.from(JSON.stringify(canonical(value))); }
function digest(value) { return createHash("sha256").update(bytes(value)).digest("hex"); }
function assertIso(value, field) { if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${field}_invalid`); }
function assertHash(value, field) { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${field}_invalid`); }
function assertSlug(value, field) { if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`${field}_invalid`); }

function normalizeCustodian(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("package_evidence_custodian_invalid");
  assertSlug(value.keyId, "package_evidence_custodian_key_id");
  assertSlug(value.actorId, "package_evidence_custodian_actor_id");
  if (value.role !== AUTHORIZED_PACKAGE_EVIDENCE_CUSTODIAN_ROLE) throw new Error("package_evidence_custodian_role_invalid");
  if (!["active", "inactive"].includes(value.status)) throw new Error("package_evidence_custodian_status_invalid");
  assertIso(value.validFrom, "package_evidence_custodian_valid_from");
  assertIso(value.validUntil, "package_evidence_custodian_valid_until");
  if (Date.parse(value.validUntil) <= Date.parse(value.validFrom)) throw new Error("package_evidence_custodian_validity_invalid");
  try {
    const key = createPublicKey(value.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch {
    throw new Error("package_evidence_custodian_public_key_invalid");
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

export function createAuthorizedPackageEvidenceCommitmentPolicy({
  assemblyPolicy,
  packageAuthorizationPolicy,
  trustedEvidenceCustodians = [],
  maxCommitmentDelaySeconds = 900,
}) {
  if (assemblyPolicy?.schema !== "atlas.authorized-release-package-assembly-policy.v1") throw new Error("package_evidence_assembly_policy_invalid");
  if (packageAuthorizationPolicy?.policyHash !== assemblyPolicy.packageAuthorizationPolicyHash) throw new Error("package_evidence_authorization_policy_mismatch");
  if (!Array.isArray(trustedEvidenceCustodians)) throw new Error("trusted_package_evidence_custodians_invalid");
  const custodians = trustedEvidenceCustodians.map(normalizeCustodian).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(custodians.map((item) => item.keyId)).size !== custodians.length) throw new Error("duplicate_package_evidence_custodian_key_id");
  if (new Set(custodians.map((item) => item.actorId)).size !== custodians.length) throw new Error("duplicate_package_evidence_custodian_actor_id");
  const priorIdentities = new Set((packageAuthorizationPolicy.trustedPackageAuthorizers ?? []).flatMap((item) => [item.keyId, item.actorId]));
  if (custodians.some((item) => priorIdentities.has(item.keyId) || priorIdentities.has(item.actorId))) {
    throw new Error("package_assembler_and_evidence_custodian_must_be_separate");
  }
  if (!Number.isInteger(maxCommitmentDelaySeconds) || maxCommitmentDelaySeconds < 1 || maxCommitmentDelaySeconds > 86_400) {
    throw new Error("max_package_evidence_commitment_delay_invalid");
  }
  const payload = {
    schema: AUTHORIZED_PACKAGE_EVIDENCE_POLICY_SCHEMA,
    compositionId: assemblyPolicy.compositionId,
    compositionDecisionHash: assemblyPolicy.compositionDecisionHash,
    finalApprovalPolicyHash: assemblyPolicy.finalApprovalPolicyHash,
    approvedReleaseMemoryPolicyHash: assemblyPolicy.approvedReleaseMemoryPolicyHash,
    packageAuthorizationPolicyHash: assemblyPolicy.packageAuthorizationPolicyHash,
    packageAssemblyPolicyHash: assemblyPolicy.policyHash,
    requiredAssemblyReceiptSchema: "atlas.authorized-release-package-assembly-receipt.v1",
    requiredMemoryEntrySchema: AUTHORIZED_PACKAGE_EVIDENCE_MEMORY_ENTRY_SCHEMA,
    custodianRole: AUTHORIZED_PACKAGE_EVIDENCE_CUSTODIAN_ROLE,
    signatureAlgorithm: AUTHORIZED_PACKAGE_EVIDENCE_SIGNATURE_ALGORITHM,
    trustedEvidenceCustodians: custodians,
    maxCommitmentDelaySeconds,
    exactReceiptBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    independentCustodianRequired: true,
    signatureRequired: true,
    appendOnlyEvidenceMemoryRequired: true,
    duplicateReceiptRejected: true,
    duplicatePackageRejected: true,
    automaticPackageGeneration: false,
    automaticBuild: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectAuthorizedPackageEvidenceCommitmentPolicy(policy, { assemblyPolicy, packageAuthorizationPolicy }) {
  try {
    const recreated = createAuthorizedPackageEvidenceCommitmentPolicy({
      assemblyPolicy,
      packageAuthorizationPolicy,
      trustedEvidenceCustodians: policy?.trustedEvidenceCustodians,
      maxCommitmentDelaySeconds: policy?.maxCommitmentDelaySeconds,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "package_evidence_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "package_evidence_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedEvidenceCustodians: recreated.trustedEvidenceCustodians.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "package_evidence_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: AUTHORIZED_PACKAGE_EVIDENCE_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      committedPackages: entries.length,
      committedReceipts: entries.length,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      buildExecuted: false,
      deployExecuted: false,
      releasePromoted: false,
    },
  };
}

export function createAuthorizedPackageEvidenceMemory({ policy, entries = [] }) {
  if (policy?.schema !== AUTHORIZED_PACKAGE_EVIDENCE_POLICY_SCHEMA) throw new Error("package_evidence_memory_policy_invalid");
  if (!Array.isArray(entries)) throw new Error("package_evidence_memory_entries_invalid");
  let previousEntryHash = null;
  const receiptHashes = new Set();
  const packageHashes = new Set();
  const evidenceIds = new Set();
  const nonces = new Set();
  const normalized = entries.map((entry, index) => {
    if (entry?.schema !== AUTHORIZED_PACKAGE_EVIDENCE_MEMORY_ENTRY_SCHEMA) throw new Error("package_evidence_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("package_evidence_memory_chain_invalid");
    assertHash(entry.receiptHash, "package_evidence_memory_receipt_hash");
    assertHash(entry.packageSha256, "package_evidence_memory_package_sha256");
    assertHash(entry.commitmentHash, "package_evidence_memory_commitment_hash");
    assertSlug(entry.evidenceId, "package_evidence_memory_evidence_id");
    assertSlug(entry.nonce, "package_evidence_memory_nonce");
    if (receiptHashes.has(entry.receiptHash)) throw new Error("package_evidence_duplicate_receipt");
    if (packageHashes.has(entry.packageSha256)) throw new Error("package_evidence_duplicate_package");
    if (evidenceIds.has(entry.evidenceId) || nonces.has(entry.nonce)) throw new Error("package_evidence_duplicate_identity");
    if (entry.evidenceCommitted !== true || entry.packageGenerated !== true) throw new Error("package_evidence_memory_safety_contract_invalid");
    for (const key of ["buildExecuted", "deployExecuted", "releasePromoted"]) if (entry[key] !== false) throw new Error(`package_evidence_memory_${key}_must_be_false`);
    const hashPayload = { ...entry };
    delete hashPayload.entryHash;
    if (digest(hashPayload) !== entry.entryHash) throw new Error("package_evidence_memory_entry_hash_mismatch");
    receiptHashes.add(entry.receiptHash);
    packageHashes.add(entry.packageSha256);
    evidenceIds.add(entry.evidenceId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
    return { ...entry };
  });
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectAuthorizedPackageEvidenceMemory(memory, { policy }) {
  try {
    const recreated = createAuthorizedPackageEvidenceMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "package_evidence_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "package_evidence_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, committedPackages: recreated.entries.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "package_evidence_memory_invalid" };
  }
}

function validateContext({
  evidencePolicy,
  evidenceMemory,
  assemblyPolicy,
  assemblyMemory,
  packageAuthorizationPolicy,
  approvalPolicy,
  memoryPolicy,
  approvalContext,
}) {
  const evidencePolicyInspection = inspectAuthorizedPackageEvidenceCommitmentPolicy(evidencePolicy, { assemblyPolicy, packageAuthorizationPolicy });
  if (!evidencePolicyInspection.ok) throw new Error(`package_evidence_policy_invalid:${evidencePolicyInspection.reason}`);
  const evidenceMemoryInspection = inspectAuthorizedPackageEvidenceMemory(evidenceMemory, { policy: evidencePolicy });
  if (!evidenceMemoryInspection.ok) throw new Error(`package_evidence_memory_invalid:${evidenceMemoryInspection.reason}`);
  const assemblyPolicyInspection = inspectAuthorizedReleasePackageAssemblyPolicy(assemblyPolicy, {
    packageAuthorizationPolicy,
    approvalPolicy,
    memoryPolicy,
    ...approvalContext,
  });
  if (!assemblyPolicyInspection.ok) throw new Error(`package_assembly_policy_invalid:${assemblyPolicyInspection.reason}`);
  const assemblyMemoryInspection = inspectAuthorizedReleasePackageAssemblyMemory(assemblyMemory, { policy: assemblyPolicy });
  if (!assemblyMemoryInspection.ok) throw new Error(`package_assembly_memory_invalid:${assemblyMemoryInspection.reason}`);
}

function signingPayload({ receipt, assemblyMemory, evidencePolicy, evidenceId, custodian, committedAt, nonce }) {
  const assemblyEntry = assemblyMemory.entries.find((entry) => entry.receiptHash === receipt.receiptHash);
  if (!assemblyEntry) throw new Error("package_evidence_assembly_entry_not_found");
  return {
    signingSchema: "atlas.authorized-package-evidence-commitment-signing-payload.v1",
    compositionId: receipt.compositionId,
    compositionDecisionHash: receipt.compositionDecisionHash,
    finalApprovalPolicyHash: receipt.finalApprovalPolicyHash,
    approvedReleaseMemoryHash: receipt.approvedReleaseMemoryHash,
    packageAuthorizationPolicyHash: receipt.packageAuthorizationPolicyHash,
    packageAssemblyPolicyHash: receipt.packageAssemblyPolicyHash,
    packageAssemblyMemoryHash: assemblyMemory.memoryHash,
    packageAssemblyMemoryEntryHash: assemblyEntry.entryHash,
    receiptHash: receipt.receiptHash,
    authorizationHash: receipt.authorizationHash,
    packageName: receipt.packageName,
    packageSha256: receipt.packageSha256,
    packageSizeBytes: receipt.packageSizeBytes,
    inventoryHash: receipt.inventoryHash,
    inventoryFileCount: receipt.inventoryFileCount,
    inventoryTotalBytes: receipt.inventoryTotalBytes,
    evidencePolicyHash: evidencePolicy.policyHash,
    evidenceId,
    custodianKeyId: custodian.keyId,
    custodianActorId: custodian.actorId,
    custodianRole: custodian.role,
    evidenceScope: "authorized-release-package-integrity-only",
    committedAt,
    nonce,
  };
}

function validateCommitmentWindow({ receipt, evidencePolicy, custodian, committedAt }) {
  assertIso(committedAt, "package_evidence_committed_at");
  const committed = Date.parse(committedAt);
  const assembled = Date.parse(receipt.assembledAt);
  if (committed < assembled) throw new Error("package_evidence_before_assembly");
  if (committed - assembled > evidencePolicy.maxCommitmentDelaySeconds * 1000) throw new Error("package_evidence_commitment_window_expired");
  if (custodian.status !== "active") throw new Error("package_evidence_custodian_inactive");
  if (custodian.role !== evidencePolicy.custodianRole) throw new Error("package_evidence_custodian_role_mismatch");
  if (committed < Date.parse(custodian.validFrom) || committed > Date.parse(custodian.validUntil)) throw new Error("package_evidence_custodian_key_outside_validity");
  if (custodian.actorId === receipt.assemblerActorId || custodian.actorId === receipt.authorizerActorId) throw new Error("package_assembler_and_evidence_custodian_must_be_separate");
}

function verifyAssemblyReceipt(receipt, context) {
  const inspection = inspectAuthorizedReleasePackageAssemblyReceipt(receipt, context);
  if (!inspection.ok) throw new Error(`package_evidence_receipt_invalid:${inspection.reason}`);
}

export function commitAuthorizedPackageEvidence({
  receipt,
  authorization,
  packageAuthorizationPolicy,
  assemblyPolicy,
  assemblyMemory,
  evidencePolicy,
  evidenceMemory,
  memory,
  memoryPolicy,
  approvalPolicy,
  packageBytes,
  inventory,
  evidenceId,
  keyId,
  committedAt,
  nonce,
  privateKey,
  ...approvalContext
}) {
  validateContext({ evidencePolicy, evidenceMemory, assemblyPolicy, assemblyMemory, packageAuthorizationPolicy, approvalPolicy, memoryPolicy, approvalContext });
  verifyAssemblyReceipt(receipt, { authorization, packageAuthorizationPolicy, assemblyPolicy, assemblyMemory, memory, memoryPolicy, approvalPolicy, packageBytes, inventory, ...approvalContext });
  assertSlug(evidenceId, "package_evidence_id");
  assertSlug(keyId, "package_evidence_key_id");
  assertSlug(nonce, "package_evidence_nonce");
  const custodian = evidencePolicy.trustedEvidenceCustodians.find((item) => item.keyId === keyId);
  if (!custodian) throw new Error("package_evidence_custodian_untrusted");
  validateCommitmentWindow({ receipt, evidencePolicy, custodian, committedAt });
  if (evidenceMemory.entries.some((entry) => entry.receiptHash === receipt.receiptHash)) throw new Error("package_evidence_duplicate_receipt");
  if (evidenceMemory.entries.some((entry) => entry.packageSha256 === receipt.packageSha256)) throw new Error("package_evidence_duplicate_package");
  const payload = signingPayload({ receipt, assemblyMemory, evidencePolicy, evidenceId, custodian, committedAt, nonce });
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("package_evidence_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), custodian.publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_package_evidence_custodian");
  const value = {
    schema: AUTHORIZED_PACKAGE_EVIDENCE_SCHEMA,
    ...payload,
    signatureAlgorithm: AUTHORIZED_PACKAGE_EVIDENCE_SIGNATURE_ALGORITHM,
    independentlyVerified: true,
    evidenceCommitted: true,
    packageGenerated: true,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const commitment = { ...value, commitmentHash: digest(value) };
  const entryPayload = {
    schema: AUTHORIZED_PACKAGE_EVIDENCE_MEMORY_ENTRY_SCHEMA,
    sequence: evidenceMemory.entries.length + 1,
    previousEntryHash: evidenceMemory.entries.at(-1)?.entryHash ?? null,
    commitmentHash: commitment.commitmentHash,
    evidenceId: commitment.evidenceId,
    nonce: commitment.nonce,
    receiptHash: commitment.receiptHash,
    packageSha256: commitment.packageSha256,
    inventoryHash: commitment.inventoryHash,
    custodianActorId: commitment.custodianActorId,
    committedAt: commitment.committedAt,
    evidenceCommitted: true,
    packageGenerated: true,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  const entry = { ...entryPayload, entryHash: digest(entryPayload) };
  return {
    commitment,
    evidenceMemory: createAuthorizedPackageEvidenceMemory({ policy: evidencePolicy, entries: [...evidenceMemory.entries, entry] }),
  };
}

export function inspectAuthorizedPackageEvidenceCommitment(commitment, {
  receipt,
  authorization,
  packageAuthorizationPolicy,
  assemblyPolicy,
  assemblyMemory,
  evidencePolicy,
  evidenceMemory,
  memory,
  memoryPolicy,
  approvalPolicy,
  packageBytes,
  inventory,
  ...approvalContext
}) {
  try {
    if (commitment?.schema !== AUTHORIZED_PACKAGE_EVIDENCE_SCHEMA) throw new Error("package_evidence_commitment_schema_invalid");
    validateContext({ evidencePolicy, evidenceMemory, assemblyPolicy, assemblyMemory, packageAuthorizationPolicy, approvalPolicy, memoryPolicy, approvalContext });
    verifyAssemblyReceipt(receipt, { authorization, packageAuthorizationPolicy, assemblyPolicy, assemblyMemory, memory, memoryPolicy, approvalPolicy, packageBytes, inventory, ...approvalContext });
    const custodian = evidencePolicy.trustedEvidenceCustodians.find((item) => item.keyId === commitment.custodianKeyId);
    if (!custodian) throw new Error("package_evidence_custodian_untrusted");
    validateCommitmentWindow({ receipt, evidencePolicy, custodian, committedAt: commitment.committedAt });
    const payload = signingPayload({ receipt, assemblyMemory, evidencePolicy, evidenceId: commitment.evidenceId, custodian, committedAt: commitment.committedAt, nonce: commitment.nonce });
    for (const [key, expected] of Object.entries(payload)) if (JSON.stringify(commitment[key]) !== JSON.stringify(expected)) throw new Error(`package_evidence_${key}_mismatch`);
    if (commitment.signatureAlgorithm !== AUTHORIZED_PACKAGE_EVIDENCE_SIGNATURE_ALGORITHM || typeof commitment.signature !== "string") throw new Error("package_evidence_signature_invalid");
    if (!cryptoVerify(null, bytes(payload), custodian.publicKeyPem, Buffer.from(commitment.signature, "base64url"))) throw new Error("package_evidence_signature_verification_failed");
    if (commitment.independentlyVerified !== true || commitment.evidenceCommitted !== true || commitment.packageGenerated !== true) throw new Error("package_evidence_commitment_safety_contract_invalid");
    for (const key of ["buildExecuted", "deployExecuted", "releasePromoted"]) if (commitment[key] !== false) throw new Error(`package_evidence_${key}_must_be_false`);
    const hashPayload = { ...commitment };
    delete hashPayload.commitmentHash;
    if (digest(hashPayload) !== commitment.commitmentHash) throw new Error("package_evidence_commitment_hash_mismatch");
    if (!evidenceMemory.entries.some((entry) => entry.commitmentHash === commitment.commitmentHash && entry.receiptHash === commitment.receiptHash)) {
      throw new Error("package_evidence_commitment_not_committed");
    }
    return { ok: true, commitmentHash: commitment.commitmentHash, receiptHash: commitment.receiptHash, packageSha256: commitment.packageSha256 };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "package_evidence_commitment_invalid" };
  }
}
