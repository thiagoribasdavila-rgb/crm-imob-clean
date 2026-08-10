import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { scanLocalMigrationCatalog } from "./local-supabase-migration-gate.mjs";

const CURRENT_EVIDENCE_SCHEMA = "atlas.remote_migration_ledger_collection.v1";
const CURRENT_EVIDENCE_STATUS = "remote_ledger_collected_read_only";
const DEFAULT_MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;

function safeBase(status, extra = {}) {
  return {
    schemaVersion: "atlas.migration_reconciliation_plan.v1",
    status,
    operationalEnvironmentTouched: false,
    remoteContacted: false,
    remoteWriteExecuted: false,
    migrationApplied: false,
    migrationHistoryRepaired: false,
    migrationFileRenamed: false,
    databaseReset: false,
    directPushAuthorized: false,
    buildAuthorized: false,
    zipAuthorized: false,
    deployAuthorized: false,
    ...extra,
  };
}

function isMigrationVersion(value) {
  return typeof value === "string" && /^[0-9]{14}$/.test(value);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

export function validateCurrentRemoteLedgerEvidence(
  evidence,
  { now = new Date(), maxAgeMs = DEFAULT_MAX_EVIDENCE_AGE_MS } = {},
) {
  if (!evidence || typeof evidence !== "object") {
    return { valid: false, reason: "current_remote_evidence_missing" };
  }
  if (evidence.schemaVersion !== CURRENT_EVIDENCE_SCHEMA) {
    return { valid: false, reason: "unsupported_or_historical_evidence_schema" };
  }
  if (evidence.status !== CURRENT_EVIDENCE_STATUS || evidence.remoteContacted !== true) {
    return { valid: false, reason: "evidence_does_not_prove_read_only_remote_collection" };
  }
  if (
    evidence.remoteWriteExecuted !== false ||
    evidence.migrationApplied !== false ||
    evidence.migrationHistoryRepaired !== false ||
    evidence.databaseReset !== false
  ) {
    return { valid: false, reason: "evidence_contains_forbidden_remote_mutation" };
  }
  const collectedAt = new Date(evidence.collectedAt);
  const currentTime = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(collectedAt.getTime()) || !Number.isFinite(currentTime.getTime())) {
    return { valid: false, reason: "evidence_timestamp_invalid" };
  }
  const ageMs = currentTime.getTime() - collectedAt.getTime();
  if (ageMs < -5 * 60 * 1000) {
    return { valid: false, reason: "evidence_timestamp_in_future" };
  }
  if (ageMs > maxAgeMs) {
    return { valid: false, reason: "current_remote_evidence_stale" };
  }
  const remoteVersions = evidence.ledger?.remoteVersions;
  if (!Array.isArray(remoteVersions) || remoteVersions.some((value) => !isMigrationVersion(value))) {
    return { valid: false, reason: "remote_version_ledger_invalid" };
  }
  return {
    valid: true,
    ageSeconds: Math.max(0, Math.floor(ageMs / 1000)),
    remoteVersions: uniqueSorted(remoteVersions),
  };
}

export function buildMigrationReconciliationPlan({
  root = process.cwd(),
  evidence = null,
  now = new Date(),
  maxAgeMs = DEFAULT_MAX_EVIDENCE_AGE_MS,
} = {}) {
  const catalog = scanLocalMigrationCatalog(root);
  const validation = validateCurrentRemoteLedgerEvidence(evidence, { now, maxAgeMs });
  const localVersions = uniqueSorted(
    catalog.files.flatMap((filename) => filename.match(/^([0-9]{14})_/)?.[1] ?? []),
  );

  if (!validation.valid) {
    return safeBase("blocked_current_remote_evidence_unavailable", {
      evidenceAccepted: false,
      evidenceReason: validation.reason,
      localCatalog: {
        migrationFileCount: catalog.migrationCount ?? 0,
        uniqueVersionCount: catalog.versionCount ?? 0,
        duplicateVersionCount: catalog.duplicates.length,
      },
      historicalSnapshotAcceptedAsCurrent: false,
      reconciliationComplete: false,
      nextSafeAction: "collect_current_remote_ledger_in_explicitly_authorized_read_only_session",
    });
  }

  const remoteVersions = validation.remoteVersions;
  const localSet = new Set(localVersions);
  const remoteSet = new Set(remoteVersions);
  const localOnlyVersions = localVersions.filter((version) => !remoteSet.has(version));
  const remoteOnlyVersions = remoteVersions.filter((version) => !localSet.has(version));
  const sharedVersions = localVersions.filter((version) => remoteSet.has(version));
  const hasCollisions = catalog.duplicates.length > 0;
  const exactVersionParity = localOnlyVersions.length === 0 && remoteOnlyVersions.length === 0;
  const status = hasCollisions
    ? "blocked_duplicate_versions_require_named_remote_evidence"
    : exactVersionParity
      ? "version_parity_observed_actions_still_blocked"
      : "version_drift_observed_manual_review_required";

  return safeBase(status, {
    evidenceAccepted: true,
    evidenceReason: "current_read_only_evidence_valid",
    evidenceAgeSeconds: validation.ageSeconds,
    historicalSnapshotAcceptedAsCurrent: false,
    comparison: {
      localVersionCount: localVersions.length,
      remoteVersionCount: remoteVersions.length,
      sharedVersionCount: sharedVersions.length,
      localOnlyCount: localOnlyVersions.length,
      remoteOnlyCount: remoteOnlyVersions.length,
      localOnlyVersions,
      remoteOnlyVersions,
      exactVersionParity,
    },
    collisions: catalog.duplicates.map(({ version, files }) => ({
      version,
      fileCount: files.length,
      filenames: [...files].sort(),
      presentRemotelyByVersion: remoteSet.has(version),
      historicalNameMappingRequired: true,
      resolved: false,
    })),
    reconciliationComplete: !hasCollisions && exactVersionParity,
    releaseGateStillBlocked: true,
    nextSafeAction: hasCollisions
      ? "collect_named_remote_history_evidence_without_mutation"
      : exactVersionParity
        ? "perform_local_runtime_rehearsal_before_any_release_decision"
        : "review_version_drift_without_push_or_history_repair",
  });
}

export function loadCurrentRemoteLedgerEvidence(root = process.cwd()) {
  const path = join(
    resolve(root),
    "artifacts",
    "runtime",
    "phase-179",
    "remote-migration-ledger-summary.json",
  );
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { schemaVersion: "invalid_json" };
  }
}

