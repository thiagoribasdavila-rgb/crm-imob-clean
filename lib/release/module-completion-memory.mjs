import { createHash } from "node:crypto";

export const MODULE_COMPLETION_MEMORY_SCHEMA = "atlas.release-module-memory.v1";
export const MODULE_COMPLETION_ENTRY_SCHEMA = "atlas.release-module-memory-entry.v1";

const COMPLETION_LEVELS = new Set(["locally_verified", "runtime_homologated"]);
const REQUIRED_LOCAL_CHECKS = ["contracts", "typecheck", "lint", "secretScan"];
const FORBIDDEN_PATH_PARTS = [".env", "credential", "secret", "service-role", "service_role"];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function cleanString(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field}_invalid`);
  return value.trim();
}

function cleanPath(path, field) {
  const value = cleanString(path, field).replaceAll("\\", "/");
  const lower = value.toLowerCase();
  if (value.startsWith("/") || value.includes("../") || value === "..") throw new Error(`${field}_unsafe`);
  if (FORBIDDEN_PATH_PARTS.some((part) => lower.includes(part))) throw new Error(`${field}_forbidden`);
  return value;
}

function cleanPaths(paths, field) {
  if (!Array.isArray(paths) || paths.length === 0) throw new Error(`${field}_empty`);
  const values = paths.map((path) => cleanPath(path, field));
  if (new Set(values).size !== values.length) throw new Error(`${field}_duplicate`);
  return values.sort();
}

function validateChecks(checks) {
  if (!checks || typeof checks !== "object") throw new Error("checks_invalid");
  for (const check of REQUIRED_LOCAL_CHECKS) {
    if (checks[check] !== true) throw new Error(`check_${check}_not_verified`);
  }
  return Object.fromEntries(REQUIRED_LOCAL_CHECKS.map((check) => [check, true]));
}

export function createModuleCompletionMemoryEntry(input, previousEntryHash = null) {
  if (!input || typeof input !== "object") throw new Error("module_input_invalid");
  const moduleId = cleanString(input.moduleId, "module_id");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(moduleId)) throw new Error("module_id_invalid");
  const completionLevel = cleanString(input.completionLevel, "completion_level");
  if (!COMPLETION_LEVELS.has(completionLevel)) throw new Error("completion_level_invalid");
  const checks = validateChecks(input.checks);
  const declaredGates = input.releaseGates && typeof input.releaseGates === "object"
    ? input.releaseGates
    : input;
  const runtimeHomologated = declaredGates.runtimeHomologated === true;
  if (completionLevel === "runtime_homologated" && !runtimeHomologated) {
    throw new Error("runtime_homologation_evidence_missing");
  }

  const releaseGates = {
    runtimeHomologated,
    cleanBuildVerified: declaredGates.cleanBuildVerified === true,
    rollbackReady: declaredGates.rollbackReady === true,
    directorApproved: declaredGates.directorApproved === true,
  };
  const zipEligible = Object.values(releaseGates).every(Boolean);
  const payload = {
    schema: MODULE_COMPLETION_ENTRY_SCHEMA,
    moduleId,
    moduleName: cleanString(input.moduleName, "module_name"),
    canonicalOwner: cleanString(input.canonicalOwner, "canonical_owner"),
    revision: Number.isInteger(input.revision) && input.revision > 0 ? input.revision : 1,
    completionLevel,
    outcome: cleanString(input.outcome, "outcome"),
    sourcePaths: cleanPaths(input.sourcePaths, "source_path"),
    evidencePaths: cleanPaths(input.evidencePaths, "evidence_path"),
    checks,
    releaseGates,
    packaging: {
      zipEligible,
      reason: zipEligible ? "all_release_gates_verified" : "release_gates_pending",
    },
    previousEntryHash,
  };
  return { ...payload, entryHash: digest(payload) };
}

export function createModuleCompletionMemory(entries = []) {
  if (!Array.isArray(entries)) throw new Error("entries_invalid");
  let previousEntryHash = null;
  const chained = entries.map((entry) => {
    const created = createModuleCompletionMemoryEntry(entry, previousEntryHash);
    previousEntryHash = created.entryHash;
    return created;
  });
  const payload = {
    schema: MODULE_COMPLETION_MEMORY_SCHEMA,
    entries: chained,
    summary: {
      registered: chained.length,
      locallyVerified: chained.filter((entry) => entry.completionLevel === "locally_verified").length,
      runtimeHomologated: chained.filter((entry) => entry.releaseGates.runtimeHomologated).length,
      zipEligible: chained.filter((entry) => entry.packaging.zipEligible).length,
    },
  };
  return { ...payload, memoryHash: digest(payload) };
}

export function appendModuleCompletionMemory(memory, input) {
  const inspection = inspectModuleCompletionMemory(memory);
  if (!inspection.ok) throw new Error(`memory_not_appendable:${inspection.reason}`);
  const latestRevision = memory.entries
    .filter((entry) => entry.moduleId === input?.moduleId)
    .reduce((latest, entry) => Math.max(latest, entry.revision), 0);
  const expectedRevision = latestRevision + 1;
  if (input?.revision !== expectedRevision) throw new Error("module_revision_invalid");
  return createModuleCompletionMemory([...memory.entries, input]);
}

export function inspectModuleCompletionMemory(memory) {
  if (!memory || memory.schema !== MODULE_COMPLETION_MEMORY_SCHEMA || !Array.isArray(memory.entries)) {
    return { ok: false, reason: "memory_schema_invalid" };
  }
  try {
    let previousEntryHash = null;
    const revisions = new Map();
    for (const entry of memory.entries) {
      const recreated = createModuleCompletionMemoryEntry(entry, previousEntryHash);
      if (recreated.entryHash !== entry.entryHash) return { ok: false, reason: "entry_hash_mismatch" };
      const expectedRevision = (revisions.get(entry.moduleId) ?? 0) + 1;
      if (entry.revision !== expectedRevision) return { ok: false, reason: "module_revision_invalid" };
      revisions.set(entry.moduleId, entry.revision);
      previousEntryHash = entry.entryHash;
    }
    const recreated = createModuleCompletionMemory(memory.entries);
    if (recreated.memoryHash !== memory.memoryHash) return { ok: false, reason: "memory_hash_mismatch" };
    if (JSON.stringify(recreated.summary) !== JSON.stringify(memory.summary)) {
      return { ok: false, reason: "memory_summary_mismatch" };
    }
    return {
      ok: true,
      summary: memory.summary,
      zipEligibleModuleIds: memory.entries.filter((entry) => entry.packaging.zipEligible).map((entry) => entry.moduleId),
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "memory_invalid" };
  }
}
