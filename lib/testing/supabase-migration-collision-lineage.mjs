import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildMigrationCollisionDossier } from "./supabase-migration-collision-dossier.mjs";

const HISTORICAL_SCHEMA = "atlas.remote_migration_ledger_summary.v1";
const HISTORICAL_CAPTURE_DATE = "2026-07-23";
const MIGRATION_NAME_PATTERN = /^(\d{14})_(.+)\.sql$/;
const REMOTE_NAME_PATTERN = /^(\d{14})_(.+)$/;

function blockedBase(extra = {}) {
  return {
    schemaVersion: "atlas.migration_collision_lineage.v1",
    status: "blocked_current_named_remote_evidence_unavailable",
    generatedFrom: "local_static_evidence_plus_historical_reference",
    currentRemoteContacted: false,
    currentNamedRemoteEvidenceAvailable: false,
    historicalSnapshotAcceptedAsCurrent: false,
    operationalEnvironmentTouched: false,
    remoteWriteExecuted: false,
    migrationApplied: false,
    migrationHistoryRepaired: false,
    migrationFileRenamed: false,
    databaseReset: false,
    directPushAuthorized: false,
    buildAuthorized: false,
    zipAuthorized: false,
    deployAuthorized: false,
    sqlBodiesIncluded: false,
    ...extra,
  };
}

function localIdentity(filename) {
  const match = filename.match(MIGRATION_NAME_PATTERN);
  return match ? { localVersion: match[1], logicalName: match[2] } : null;
}

function historicalIdentity(mapping) {
  const match = mapping?.remote_name?.match(REMOTE_NAME_PATTERN);
  return match ? { historicalNameVersion: match[1], logicalName: match[2] } : null;
}

export function validateHistoricalCollisionSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return { valid: false, reason: "historical_snapshot_missing", mappings: [] };
  }
  if (snapshot.schema_version !== HISTORICAL_SCHEMA) {
    return { valid: false, reason: "historical_snapshot_schema_invalid", mappings: [] };
  }
  if (snapshot.captured_at !== HISTORICAL_CAPTURE_DATE) {
    return { valid: false, reason: "historical_snapshot_capture_date_unexpected", mappings: [] };
  }
  if (snapshot.capture_mode !== "remote_metadata_read_only") {
    return { valid: false, reason: "historical_snapshot_capture_mode_invalid", mappings: [] };
  }
  const execution = snapshot.execution ?? {};
  if (
    execution.remote_write_executed !== false ||
    execution.migration_repair_executed !== false ||
    execution.migration_push_executed !== false ||
    execution.migration_renamed !== false
  ) {
    return { valid: false, reason: "historical_snapshot_mutation_tainted", mappings: [] };
  }
  const mappings = snapshot.confirmed_collision_mappings;
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return { valid: false, reason: "historical_collision_mappings_missing", mappings: [] };
  }
  for (const mapping of mappings) {
    const identity = historicalIdentity(mapping);
    if (
      !identity ||
      !/^\d{14}$/.test(mapping.remote_version ?? "") ||
      !/^\d{14}$/.test(mapping.original_local_version ?? "") ||
      (mapping.canonical_intent_version != null &&
        !/^\d{14}$/.test(mapping.canonical_intent_version))
    ) {
      return { valid: false, reason: "historical_collision_mapping_invalid", mappings: [] };
    }
  }
  return { valid: true, reason: "historical_reference_valid_but_not_current", mappings };
}

export function buildMigrationCollisionLineage({ root = process.cwd(), historicalSnapshot = null } = {}) {
  const dossier = buildMigrationCollisionDossier(root);
  const validation = validateHistoricalCollisionSnapshot(historicalSnapshot);
  const historicalByLogicalName = new Map();
  if (validation.valid) {
    for (const mapping of validation.mappings) {
      const identity = historicalIdentity(mapping);
      historicalByLogicalName.set(identity.logicalName, { mapping, identity });
    }
  }

  let matchedHistoricalMappings = 0;
  const collisions = dossier.collisions.map((collision) => ({
    version: collision.version,
    status: "historical_lineage_observed_current_named_evidence_required",
    currentResolutionCount: 0,
    currentNamedRemoteEvidenceRequired: true,
    safeToRename: false,
    safeToApply: false,
    safeToRepairHistory: false,
    files: collision.files.map((file) => {
      const identity = localIdentity(file.filename);
      const historical = identity ? historicalByLogicalName.get(identity.logicalName) : null;
      if (historical) matchedHistoricalMappings += 1;
      return {
        filename: file.filename,
        localVersion: identity?.localVersion ?? null,
        logicalName: identity?.logicalName ?? null,
        sha256: file.sha256,
        bytes: file.bytes,
        statementEvidence: file.statementEvidence,
        historicalMappingObserved: Boolean(historical),
        historicalRemoteVersion: historical?.mapping.remote_version ?? null,
        historicalRemoteName: historical?.mapping.remote_name ?? null,
        historicalNameVersion: historical?.identity.historicalNameVersion ?? null,
        historicalCanonicalIntentVersion:
          historical?.mapping.canonical_intent_version ?? historical?.identity.historicalNameVersion ?? null,
        historicalReferenceOnly: Boolean(historical),
        currentNamedRemoteEvidenceAvailable: false,
        renameAuthorized: false,
        applyAuthorized: false,
      };
    }),
  }));

  return blockedBase({
    localMigrationFileCount: dossier.migrationCount,
    localUniqueVersionCount: dossier.uniqueVersionCount,
    collisionCount: collisions.length,
    collidingFileCount: collisions.reduce((total, collision) => total + collision.files.length, 0),
    historicalSnapshotValid: validation.valid,
    historicalSnapshotReason: validation.reason,
    historicalMappingCount: validation.valid ? validation.mappings.length : 0,
    matchedHistoricalMappingCount: matchedHistoricalMappings,
    currentResolutionCount: 0,
    reconciliationComplete: false,
    collisions,
    nextSafeAction: "collect_current_named_remote_history_evidence_without_mutation",
  });
}

export function loadHistoricalCollisionSnapshot(root = process.cwd()) {
  const path = join(
    resolve(root),
    "artifacts",
    "runtime",
    "phase-010",
    "remote-migration-ledger-summary.json",
  );
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { schema_version: "invalid_json" };
  }
}
