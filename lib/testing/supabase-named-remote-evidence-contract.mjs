import { createHash } from "node:crypto";
import {
  buildMigrationCollisionLineage,
  loadHistoricalCollisionSnapshot,
} from "./supabase-migration-collision-lineage.mjs";

export const NAMED_REMOTE_EVIDENCE_SCHEMA = "atlas.current_named_remote_migration_evidence.v1";
export const EXPECTED_PROJECT_REF_SHA256 =
  "f37af84c3622f9a4f1b438df087b65d882e37e6f3860718e8f8f7c6cd80f8b87";
const DEFAULT_MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;
const REMOTE_NAME_PATTERN = /^(\d{14})_([a-z0-9][a-z0-9_]*)$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function blockedBase(status, extra = {}) {
  return {
    schemaVersion: "atlas.named_remote_evidence_assessment.v1",
    status,
    evidenceAccepted: false,
    currentRemoteContacted: false,
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
    reconciliationComplete: false,
    ...extra,
  };
}

function currentTime(value) {
  return value instanceof Date ? value : new Date(value);
}

function requestEntries(lineage) {
  return lineage.collisions.flatMap((collision) => collision.files.map((file) => ({
    collisionVersion: collision.version,
    localFilename: file.filename,
    logicalName: file.logicalName,
    localSha256: file.sha256,
    historicalReferencePresent: file.historicalMappingObserved,
  }))).sort((left, right) => left.localFilename.localeCompare(right.localFilename));
}

export function buildNamedRemoteEvidenceRequest({ root = process.cwd(), generatedAt = new Date() } = {}) {
  const lineage = buildMigrationCollisionLineage({
    root,
    historicalSnapshot: loadHistoricalCollisionSnapshot(root),
  });
  const entries = requestEntries(lineage);
  return {
    schemaVersion: "atlas.named_remote_evidence_request.v1",
    generatedAt: currentTime(generatedAt).toISOString(),
    purpose: "resolve_duplicate_authored_migration_versions_with_current_named_remote_metadata",
    targetIdentity: {
      projectRefSha256: EXPECTED_PROJECT_REF_SHA256,
      rawProjectRefIncluded: false,
    },
    requiredCaptureMode: "remote_metadata_read_only",
    requiredEvidenceSchema: NAMED_REMOTE_EVIDENCE_SCHEMA,
    maxEvidenceAgeHours: DEFAULT_MAX_EVIDENCE_AGE_MS / (60 * 60 * 1000),
    requiredMappings: entries,
    requiredMappingCount: entries.length,
    localFingerprintSetSha256: sha256(JSON.stringify(entries)),
    forbiddenOperations: [
      "remote_write",
      "migration_apply",
      "migration_push",
      "migration_history_repair",
      "migration_file_rename",
      "database_reset",
    ],
    sqlBodiesIncluded: false,
    secretsIncluded: false,
  };
}

export function validateNamedRemoteMigrationEvidence(
  evidence,
  { root = process.cwd(), now = new Date(), maxAgeMs = DEFAULT_MAX_EVIDENCE_AGE_MS } = {},
) {
  const request = buildNamedRemoteEvidenceRequest({ root, generatedAt: now });
  if (!evidence || typeof evidence !== "object") {
    return { valid: false, reason: "current_named_remote_evidence_missing", request };
  }
  if (evidence.schemaVersion !== NAMED_REMOTE_EVIDENCE_SCHEMA) {
    return { valid: false, reason: "current_named_remote_evidence_schema_invalid", request };
  }
  if (evidence.captureMode !== request.requiredCaptureMode || evidence.remoteContacted !== true) {
    return { valid: false, reason: "evidence_does_not_prove_current_read_only_remote_capture", request };
  }
  if (evidence.targetIdentity?.projectRefSha256 !== request.targetIdentity.projectRefSha256) {
    return { valid: false, reason: "evidence_target_identity_mismatch", request };
  }
  const execution = evidence.execution ?? {};
  for (const key of [
    "remoteWriteExecuted",
    "migrationApplied",
    "migrationPushExecuted",
    "migrationHistoryRepaired",
    "migrationFileRenamed",
    "databaseReset",
  ]) {
    if (execution[key] !== false) {
      return { valid: false, reason: "evidence_contains_forbidden_or_unproven_mutation", request };
    }
  }
  const capturedAt = new Date(evidence.capturedAt);
  const assessedAt = currentTime(now);
  if (!Number.isFinite(capturedAt.getTime()) || !Number.isFinite(assessedAt.getTime())) {
    return { valid: false, reason: "evidence_timestamp_invalid", request };
  }
  const ageMs = assessedAt.getTime() - capturedAt.getTime();
  if (ageMs < -5 * 60 * 1000) {
    return { valid: false, reason: "evidence_timestamp_in_future", request };
  }
  if (ageMs > maxAgeMs) {
    return { valid: false, reason: "current_named_remote_evidence_stale", request };
  }
  const provenance = evidence.provenance ?? {};
  if (
    typeof provenance.collector !== "string" || provenance.collector.trim() === "" ||
    typeof provenance.cliVersion !== "string" || provenance.cliVersion.trim() === "" ||
    typeof provenance.commandSha256 !== "string" || !/^[a-f0-9]{64}$/.test(provenance.commandSha256)
  ) {
    return { valid: false, reason: "evidence_provenance_incomplete", request };
  }
  if (evidence.localFingerprintSetSha256 !== request.localFingerprintSetSha256) {
    return { valid: false, reason: "local_migration_fingerprint_set_mismatch", request };
  }
  if (!Array.isArray(evidence.mappings) || evidence.mappings.length !== request.requiredMappingCount) {
    return { valid: false, reason: "current_named_remote_mapping_count_invalid", request };
  }

  const expected = new Map(request.requiredMappings.map((entry) => [entry.localFilename, entry]));
  const seenLocal = new Set();
  const seenRemoteNames = new Set();
  for (const mapping of evidence.mappings) {
    const local = expected.get(mapping?.localFilename);
    if (!local || seenLocal.has(mapping.localFilename)) {
      return { valid: false, reason: "current_named_remote_mapping_local_identity_invalid", request };
    }
    seenLocal.add(mapping.localFilename);
    if (mapping.localSha256 !== local.localSha256 || mapping.logicalName !== local.logicalName) {
      return { valid: false, reason: "current_named_remote_mapping_local_fingerprint_mismatch", request };
    }
    const remoteIdentity = String(mapping.remoteName ?? "").match(REMOTE_NAME_PATTERN);
    if (
      !remoteIdentity ||
      mapping.remoteVersion !== remoteIdentity[1] ||
      mapping.logicalName !== remoteIdentity[2] ||
      seenRemoteNames.has(mapping.remoteName)
    ) {
      return { valid: false, reason: "current_named_remote_mapping_remote_identity_invalid", request };
    }
    seenRemoteNames.add(mapping.remoteName);
  }

  return {
    valid: true,
    reason: "current_named_remote_evidence_contract_valid",
    ageSeconds: Math.max(0, Math.floor(ageMs / 1000)),
    mappingCount: seenLocal.size,
    request,
  };
}

export function assessNamedRemoteMigrationEvidence({
  root = process.cwd(),
  evidence = null,
  now = new Date(),
  maxAgeMs = DEFAULT_MAX_EVIDENCE_AGE_MS,
} = {}) {
  const validation = validateNamedRemoteMigrationEvidence(evidence, { root, now, maxAgeMs });
  if (!validation.valid) {
    return blockedBase("blocked_current_named_remote_evidence_unavailable", {
      evidenceReason: validation.reason,
      evidenceRequest: validation.request,
      nextSafeAction: "collect_contract_shaped_named_remote_metadata_in_explicitly_authorized_read_only_session",
    });
  }
  return blockedBase("current_named_evidence_valid_reconciliation_still_requires_human_review", {
    evidenceAccepted: true,
    evidenceReason: validation.reason,
    evidenceAgeSeconds: validation.ageSeconds,
    mappingCount: validation.mappingCount,
    currentRemoteContacted: true,
    evidenceRequest: validation.request,
    nextSafeAction: "perform_human_review_before_any_local_reconciliation_proposal",
  });
}
