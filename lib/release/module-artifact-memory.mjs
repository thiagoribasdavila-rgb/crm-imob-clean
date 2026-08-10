import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export const MODULE_ARTIFACT_MEMORY_SCHEMA = "atlas.release-module-artifact-memory.v1";
export const MODULE_ARTIFACT_SNAPSHOT_SCHEMA = "atlas.release-module-artifact-snapshot.v1";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(canonical(value)));
  return createHash("sha256").update(input).digest("hex");
}

function resolveArtifact(rootDir, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.startsWith("/") || relativePath.includes("..")) {
    throw new Error("artifact_path_unsafe");
  }
  const root = realpathSync(rootDir);
  const candidate = resolve(root, relativePath);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) throw new Error("artifact_path_escape");
  const stat = lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("artifact_not_regular_file");
  const realCandidate = realpathSync(candidate);
  if (!realCandidate.startsWith(`${root}${sep}`)) throw new Error("artifact_physical_escape");
  return realCandidate;
}

function artifactInventory(rootDir, entry) {
  const paths = [...new Set([...(entry?.sourcePaths ?? []), ...(entry?.evidencePaths ?? [])])].sort();
  if (paths.length === 0) throw new Error("artifact_paths_empty");
  return paths.map((path) => {
    const content = readFileSync(resolveArtifact(rootDir, path));
    return { path, bytes: content.byteLength, sha256: digest(content) };
  });
}

export function createModuleArtifactSnapshot({ rootDir, entry }) {
  if (!entry?.entryHash || !entry?.moduleId || !Number.isInteger(entry?.revision)) {
    throw new Error("completion_entry_invalid");
  }
  const artifacts = artifactInventory(rootDir, entry);
  const payload = {
    schema: MODULE_ARTIFACT_SNAPSHOT_SCHEMA,
    moduleId: entry.moduleId,
    revision: entry.revision,
    completionEntryHash: entry.entryHash,
    artifactCount: artifacts.length,
    totalBytes: artifacts.reduce((total, artifact) => total + artifact.bytes, 0),
    artifactSetHash: digest(artifacts),
  };
  return { ...payload, snapshotHash: digest(payload) };
}

export function createModuleArtifactMemory(snapshots = []) {
  if (!Array.isArray(snapshots)) throw new Error("snapshots_invalid");
  const payload = { schema: MODULE_ARTIFACT_MEMORY_SCHEMA, snapshots };
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectModuleArtifactSnapshot({ rootDir, entry, snapshot }) {
  if (!snapshot || snapshot.schema !== MODULE_ARTIFACT_SNAPSHOT_SCHEMA) {
    return { ok: false, reason: "snapshot_schema_invalid" };
  }
  if (snapshot.moduleId !== entry?.moduleId || snapshot.revision !== entry?.revision || snapshot.completionEntryHash !== entry?.entryHash) {
    return { ok: false, reason: "completion_entry_mismatch" };
  }
  try {
    const recreated = createModuleArtifactSnapshot({ rootDir, entry });
    if (recreated.snapshotHash !== snapshot.snapshotHash) return { ok: false, reason: "artifact_set_mismatch" };
    return {
      ok: true,
      moduleId: snapshot.moduleId,
      revision: snapshot.revision,
      artifactCount: snapshot.artifactCount,
      totalBytes: snapshot.totalBytes,
      artifactSetHash: snapshot.artifactSetHash,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "artifact_snapshot_invalid" };
  }
}

export function inspectModuleArtifactMemory(memory) {
  if (!memory || memory.schema !== MODULE_ARTIFACT_MEMORY_SCHEMA || !Array.isArray(memory.snapshots)) {
    return { ok: false, reason: "artifact_memory_schema_invalid" };
  }
  const keys = new Set();
  for (const snapshot of memory.snapshots) {
    const key = `${snapshot.moduleId}:${snapshot.revision}`;
    if (keys.has(key)) return { ok: false, reason: "artifact_snapshot_duplicate" };
    keys.add(key);
    const { snapshotHash, ...payload } = snapshot;
    if (snapshotHash !== digest(payload)) return { ok: false, reason: "artifact_snapshot_hash_mismatch" };
  }
  const recreated = createModuleArtifactMemory(memory.snapshots);
  if (recreated.memoryHash !== memory.memoryHash) return { ok: false, reason: "artifact_memory_hash_mismatch" };
  return { ok: true, registeredSnapshots: memory.snapshots.length };
}
