import { createHash } from "node:crypto";
import {
  inspectApprovedReleasePackageAuthorization,
  inspectApprovedReleasePackageAuthorizationPolicy,
} from "./approved-release-package-authorization.mjs";

export const AUTHORIZED_RELEASE_PACKAGE_ASSEMBLY_POLICY_SCHEMA = "atlas.authorized-release-package-assembly-policy.v1";
export const AUTHORIZED_RELEASE_PACKAGE_ASSEMBLY_RECEIPT_SCHEMA = "atlas.authorized-release-package-assembly-receipt.v1";
export const AUTHORIZED_RELEASE_PACKAGE_ASSEMBLY_MEMORY_SCHEMA = "atlas.authorized-release-package-assembly-memory.v1";
export const AUTHORIZED_RELEASE_PACKAGE_ASSEMBLY_MEMORY_ENTRY_SCHEMA = "atlas.authorized-release-package-assembly-memory-entry.v1";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function bytes(value) { return Buffer.from(JSON.stringify(canonical(value))); }
function digest(value) { return createHash("sha256").update(bytes(value)).digest("hex"); }
function digestBuffer(value) { return createHash("sha256").update(value).digest("hex"); }
function assertIso(value, field) { if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${field}_invalid`); }
function assertHash(value, field) { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${field}_invalid`); }
function assertSlug(value, field) { if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`${field}_invalid`); }

function assertPackageBytes(packageBytes, policy) {
  if (!Buffer.isBuffer(packageBytes)) throw new Error("package_bytes_invalid");
  if (packageBytes.length < 22 || packageBytes.length > policy.maxPackageBytes) throw new Error("package_size_invalid");
  const localHeader = packageBytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const emptyArchive = packageBytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (!localHeader && !emptyArchive) throw new Error("package_zip_signature_invalid");
  const eocd = packageBytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || packageBytes.length - eocd > 65_557) throw new Error("package_zip_eocd_invalid");
}

function validateInventoryPath(path) {
  if (
    typeof path !== "string"
    || path.length < 1
    || path.length > 240
    || path.startsWith("/")
    || path.includes("\\")
    || path.includes("//")
    || path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) throw new Error("package_inventory_path_invalid");
  const lower = path.toLowerCase();
  const parts = lower.split("/");
  if (parts.some((part) => [".git", "node_modules", ".next", "dist", "coverage", "logs", "tmp", "temp"].includes(part))) {
    throw new Error("package_inventory_forbidden_path");
  }
  const base = parts.at(-1);
  if ((base === ".env" || base?.startsWith(".env.")) && ![".env.example", ".env.homologation.example"].includes(base)) {
    throw new Error("package_inventory_sensitive_env");
  }
  if (/\.(?:pem|key|p12|pfx|crt|cer|zip)$/i.test(base ?? "")) throw new Error("package_inventory_sensitive_extension");
}

function normalizeInventory(inventory, policy) {
  if (!Array.isArray(inventory) || inventory.length < 1 || inventory.length > policy.maxFileCount) throw new Error("package_inventory_count_invalid");
  const normalized = inventory.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("package_inventory_item_invalid");
    validateInventoryPath(item.path);
    if (!Number.isInteger(item.bytes) || item.bytes < 0 || item.bytes > policy.maxPackageBytes) throw new Error("package_inventory_item_size_invalid");
    assertHash(item.sha256, "package_inventory_item_sha256");
    return { path: item.path, bytes: item.bytes, sha256: item.sha256 };
  }).sort((a, b) => a.path.localeCompare(b.path));
  if (new Set(normalized.map((item) => item.path)).size !== normalized.length) throw new Error("package_inventory_duplicate_path");
  const totalBytes = normalized.reduce((total, item) => total + item.bytes, 0);
  if (totalBytes < 1 || totalBytes > policy.maxUncompressedBytes) throw new Error("package_inventory_total_size_invalid");
  return {
    files: normalized,
    fileCount: normalized.length,
    totalBytes,
    inventoryHash: digest(normalized),
  };
}

function validatePolicyInputs({ packageAuthorizationPolicy, approvalPolicy, memoryPolicy, approvalContext }) {
  const inspection = inspectApprovedReleasePackageAuthorizationPolicy(packageAuthorizationPolicy, {
    approvalPolicy,
    memoryPolicy,
    ...approvalContext,
  });
  if (!inspection.ok) throw new Error(`package_authorization_policy_invalid:${inspection.reason}`);
}

export function createAuthorizedReleasePackageAssemblyPolicy({
  packageAuthorizationPolicy,
  approvalPolicy,
  memoryPolicy,
  maxPackageBytes = 67_108_864,
  maxUncompressedBytes = 268_435_456,
  maxFileCount = 12_000,
  ...approvalContext
}) {
  validatePolicyInputs({ packageAuthorizationPolicy, approvalPolicy, memoryPolicy, approvalContext });
  if (!Number.isInteger(maxPackageBytes) || maxPackageBytes < 1024 || maxPackageBytes > 536_870_912) throw new Error("max_package_bytes_invalid");
  if (!Number.isInteger(maxUncompressedBytes) || maxUncompressedBytes < maxPackageBytes || maxUncompressedBytes > 2_147_483_648) throw new Error("max_uncompressed_bytes_invalid");
  if (!Number.isInteger(maxFileCount) || maxFileCount < 1 || maxFileCount > 100_000) throw new Error("max_package_file_count_invalid");
  const payload = {
    schema: AUTHORIZED_RELEASE_PACKAGE_ASSEMBLY_POLICY_SCHEMA,
    compositionId: packageAuthorizationPolicy.compositionId,
    compositionDecisionHash: packageAuthorizationPolicy.compositionDecisionHash,
    finalApprovalPolicyHash: packageAuthorizationPolicy.finalApprovalPolicyHash,
    approvedReleaseMemoryPolicyHash: packageAuthorizationPolicy.approvedReleaseMemoryPolicyHash,
    packageAuthorizationPolicyHash: packageAuthorizationPolicy.policyHash,
    requiredAuthorizationSchema: "atlas.approved-release-package-authorization.v1",
    requiredMemoryEntrySchema: AUTHORIZED_RELEASE_PACKAGE_ASSEMBLY_MEMORY_ENTRY_SCHEMA,
    maxPackageBytes,
    maxUncompressedBytes,
    maxFileCount,
    exactAuthorizationBindingRequired: true,
    exactApprovedMemoryBindingRequired: true,
    sameActorAsAuthorizerRequired: true,
    authorizationSingleUseRequired: true,
    authorizationUnexpiredRequired: true,
    deterministicInventoryRequired: true,
    zipArchiveRequired: true,
    sha256Required: true,
    sensitiveFilesForbidden: true,
    appendOnlyConsumptionMemoryRequired: true,
    duplicateAuthorizationRejected: true,
    automaticPackageGeneration: false,
    automaticBuild: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectAuthorizedReleasePackageAssemblyPolicy(policy, {
  packageAuthorizationPolicy,
  approvalPolicy,
  memoryPolicy,
  ...approvalContext
}) {
  try {
    const recreated = createAuthorizedReleasePackageAssemblyPolicy({
      packageAuthorizationPolicy,
      approvalPolicy,
      memoryPolicy,
      ...approvalContext,
      maxPackageBytes: policy?.maxPackageBytes,
      maxUncompressedBytes: policy?.maxUncompressedBytes,
      maxFileCount: policy?.maxFileCount,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "package_assembly_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "package_assembly_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "package_assembly_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: AUTHORIZED_RELEASE_PACKAGE_ASSEMBLY_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      assembledPackages: entries.length,
      consumedAuthorizations: entries.length,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      buildExecuted: false,
      deployExecuted: false,
      releasePromoted: false,
    },
  };
}

export function createAuthorizedReleasePackageAssemblyMemory({ policy, entries = [] }) {
  if (policy?.schema !== AUTHORIZED_RELEASE_PACKAGE_ASSEMBLY_POLICY_SCHEMA) throw new Error("package_assembly_memory_policy_invalid");
  if (!Array.isArray(entries)) throw new Error("package_assembly_memory_entries_invalid");
  let previousEntryHash = null;
  const seenAuthorizationHashes = new Set();
  const seenAuthorizationIds = new Set();
  const seenNonces = new Set();
  const seenPackageHashes = new Set();
  const normalized = entries.map((entry, index) => {
    if (entry?.schema !== AUTHORIZED_RELEASE_PACKAGE_ASSEMBLY_MEMORY_ENTRY_SCHEMA) throw new Error("package_assembly_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("package_assembly_memory_chain_invalid");
    assertHash(entry.authorizationHash, "package_assembly_memory_authorization_hash");
    assertHash(entry.packageSha256, "package_assembly_memory_package_sha256");
    assertHash(entry.receiptHash, "package_assembly_memory_receipt_hash");
    assertSlug(entry.authorizationId, "package_assembly_memory_authorization_id");
    assertSlug(entry.authorizationNonce, "package_assembly_memory_authorization_nonce");
    if (seenAuthorizationHashes.has(entry.authorizationHash) || seenAuthorizationIds.has(entry.authorizationId) || seenNonces.has(entry.authorizationNonce)) {
      throw new Error("package_authorization_already_consumed");
    }
    if (seenPackageHashes.has(entry.packageSha256)) throw new Error("package_assembly_duplicate_package_hash");
    const hashPayload = { ...entry };
    delete hashPayload.entryHash;
    if (digest(hashPayload) !== entry.entryHash) throw new Error("package_assembly_memory_entry_hash_mismatch");
    for (const key of ["buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`package_assembly_memory_${key}_must_be_false`);
    }
    if (entry.packageGenerated !== true || entry.authorizationConsumed !== true) throw new Error("package_assembly_memory_entry_safety_contract_invalid");
    seenAuthorizationHashes.add(entry.authorizationHash);
    seenAuthorizationIds.add(entry.authorizationId);
    seenNonces.add(entry.authorizationNonce);
    seenPackageHashes.add(entry.packageSha256);
    previousEntryHash = entry.entryHash;
    return { ...entry };
  });
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectAuthorizedReleasePackageAssemblyMemory(memory, { policy }) {
  try {
    const recreated = createAuthorizedReleasePackageAssemblyMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "package_assembly_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "package_assembly_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, assembledPackages: recreated.entries.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "package_assembly_memory_invalid" };
  }
}

function validateAssemblyContext({
  packageAuthorizationPolicy,
  assemblyPolicy,
  assemblyMemory,
  memory,
  memoryPolicy,
  approvalPolicy,
  authorization,
  inspectedAt,
  approvalContext,
}) {
  const policyInspection = inspectAuthorizedReleasePackageAssemblyPolicy(assemblyPolicy, {
    packageAuthorizationPolicy,
    approvalPolicy,
    memoryPolicy,
    ...approvalContext,
  });
  if (!policyInspection.ok) throw new Error(`package_assembly_policy_invalid:${policyInspection.reason}`);
  const assemblyMemoryInspection = inspectAuthorizedReleasePackageAssemblyMemory(assemblyMemory, { policy: assemblyPolicy });
  if (!assemblyMemoryInspection.ok) throw new Error(`package_assembly_memory_invalid:${assemblyMemoryInspection.reason}`);
  const authorizationInspection = inspectApprovedReleasePackageAuthorization(authorization, {
    memory,
    memoryPolicy,
    approvalPolicy,
    packageAuthorizationPolicy,
    inspectedAt,
    ...approvalContext,
  });
  if (!authorizationInspection.ok) throw new Error(`package_authorization_invalid:${authorizationInspection.reason}`);
}

function receiptPayload({ authorization, assemblyPolicy, inventory, packageBytes, assemblyId, assemblerActorId, assembledAt }) {
  return {
    schema: AUTHORIZED_RELEASE_PACKAGE_ASSEMBLY_RECEIPT_SCHEMA,
    compositionId: authorization.compositionId,
    compositionDecisionHash: authorization.compositionDecisionHash,
    finalApprovalPolicyHash: authorization.finalApprovalPolicyHash,
    finalApprovalDecisionHash: authorization.finalApprovalDecisionHash,
    approvedReleaseMemoryPolicyHash: authorization.approvedReleaseMemoryPolicyHash,
    approvedReleaseMemoryHash: authorization.approvedReleaseMemoryHash,
    approvedReleaseMemoryEntryHash: authorization.approvedReleaseMemoryEntryHash,
    packageAuthorizationPolicyHash: authorization.authorizationPolicyHash,
    packageAssemblyPolicyHash: assemblyPolicy.policyHash,
    authorizationHash: authorization.authorizationHash,
    authorizationId: authorization.authorizationId,
    authorizationNonce: authorization.nonce,
    authorizerActorId: authorization.authorizerActorId,
    assemblyId,
    assemblerActorId,
    packageName: authorization.packageName,
    packageSizeBytes: packageBytes.length,
    packageSha256: digestBuffer(packageBytes),
    inventoryHash: inventory.inventoryHash,
    inventoryFileCount: inventory.fileCount,
    inventoryTotalBytes: inventory.totalBytes,
    assembledAt,
    authorizationConsumed: true,
    packageGenerated: true,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
}

export function assembleAuthorizedReleasePackage({
  authorization,
  packageAuthorizationPolicy,
  assemblyPolicy,
  assemblyMemory,
  memory,
  memoryPolicy,
  approvalPolicy,
  packageBytes,
  inventory,
  assemblyId,
  assemblerActorId,
  assembledAt,
  ...approvalContext
}) {
  validateAssemblyContext({ packageAuthorizationPolicy, assemblyPolicy, assemblyMemory, memory, memoryPolicy, approvalPolicy, authorization, inspectedAt: assembledAt, approvalContext });
  assertSlug(assemblyId, "package_assembly_id");
  assertSlug(assemblerActorId, "package_assembler_actor_id");
  assertIso(assembledAt, "package_assembled_at");
  if (assemblerActorId !== authorization.authorizerActorId) throw new Error("package_assembler_must_match_authorizer");
  if (assemblyMemory.entries.some((entry) => entry.authorizationHash === authorization.authorizationHash || entry.authorizationId === authorization.authorizationId || entry.authorizationNonce === authorization.nonce)) {
    throw new Error("package_authorization_already_consumed");
  }
  assertPackageBytes(packageBytes, assemblyPolicy);
  const normalizedInventory = normalizeInventory(inventory, assemblyPolicy);
  const payload = receiptPayload({ authorization, assemblyPolicy, inventory: normalizedInventory, packageBytes, assemblyId, assemblerActorId, assembledAt });
  const receipt = { ...payload, receiptHash: digest(payload) };
  const entryPayload = {
    schema: AUTHORIZED_RELEASE_PACKAGE_ASSEMBLY_MEMORY_ENTRY_SCHEMA,
    sequence: assemblyMemory.entries.length + 1,
    previousEntryHash: assemblyMemory.entries.at(-1)?.entryHash ?? null,
    receiptHash: receipt.receiptHash,
    authorizationHash: receipt.authorizationHash,
    authorizationId: receipt.authorizationId,
    authorizationNonce: receipt.authorizationNonce,
    packageName: receipt.packageName,
    packageSha256: receipt.packageSha256,
    inventoryHash: receipt.inventoryHash,
    assemblerActorId: receipt.assemblerActorId,
    assembledAt: receipt.assembledAt,
    authorizationConsumed: true,
    packageGenerated: true,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  const entry = { ...entryPayload, entryHash: digest(entryPayload) };
  return {
    receipt,
    assemblyMemory: createAuthorizedReleasePackageAssemblyMemory({ policy: assemblyPolicy, entries: [...assemblyMemory.entries, entry] }),
  };
}

export function inspectAuthorizedReleasePackageAssemblyReceipt(receipt, {
  authorization,
  packageAuthorizationPolicy,
  assemblyPolicy,
  assemblyMemory,
  memory,
  memoryPolicy,
  approvalPolicy,
  packageBytes,
  inventory,
  ...approvalContext
}) {
  try {
    if (receipt?.schema !== AUTHORIZED_RELEASE_PACKAGE_ASSEMBLY_RECEIPT_SCHEMA) throw new Error("package_assembly_receipt_schema_invalid");
    validateAssemblyContext({ packageAuthorizationPolicy, assemblyPolicy, assemblyMemory, memory, memoryPolicy, approvalPolicy, authorization, inspectedAt: receipt.assembledAt, approvalContext });
    assertPackageBytes(packageBytes, assemblyPolicy);
    const normalizedInventory = normalizeInventory(inventory, assemblyPolicy);
    const payload = receiptPayload({
      authorization,
      assemblyPolicy,
      inventory: normalizedInventory,
      packageBytes,
      assemblyId: receipt.assemblyId,
      assemblerActorId: receipt.assemblerActorId,
      assembledAt: receipt.assembledAt,
    });
    if (JSON.stringify(payload) !== JSON.stringify(Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== "receiptHash")))) {
      throw new Error("package_assembly_receipt_contract_mismatch");
    }
    if (digest(payload) !== receipt.receiptHash) throw new Error("package_assembly_receipt_hash_mismatch");
    if (!assemblyMemory.entries.some((entry) => entry.receiptHash === receipt.receiptHash && entry.authorizationHash === receipt.authorizationHash)) {
      throw new Error("package_assembly_receipt_not_committed");
    }
    return { ok: true, receiptHash: receipt.receiptHash, packageSha256: receipt.packageSha256, packageName: receipt.packageName };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "package_assembly_receipt_invalid" };
  }
}
