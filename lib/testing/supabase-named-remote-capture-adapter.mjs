import { createHash } from "node:crypto";
import {
  buildNamedRemoteEvidenceRequest,
  EXPECTED_PROJECT_REF_SHA256,
  NAMED_REMOTE_EVIDENCE_SCHEMA,
  validateNamedRemoteMigrationEvidence,
} from "./supabase-named-remote-evidence-contract.mjs";

export const NAMED_REMOTE_CAPTURE_SCHEMA = "atlas.read_only_named_migration_metadata_capture.v1";
export const NAMED_REMOTE_CAPTURE_ADAPTER_VERSION = "atlas.named_remote_capture_adapter.v1";
const REMOTE_NAME_PATTERN = /^(\d{14})_([a-z0-9][a-z0-9_]*)$/;
const EXECUTION_KEYS = [
  "remoteWriteExecuted",
  "migrationApplied",
  "migrationPushExecuted",
  "migrationHistoryRepaired",
  "migrationFileRenamed",
  "databaseReset",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fail(reason, request) {
  return {
    ok: false,
    reason,
    evidence: null,
    request,
    remoteWriteExecuted: false,
    migrationApplied: false,
    migrationHistoryRepaired: false,
    migrationFileRenamed: false,
    databaseReset: false,
    buildAuthorized: false,
    zipAuthorized: false,
    deployAuthorized: false,
  };
}

function exactKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function normalizedMigrations(migrations) {
  return [...migrations]
    .map(({ version, name }) => ({ version, name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function buildNamedRemoteCaptureTemplate({ root = process.cwd(), generatedAt = new Date() } = {}) {
  const request = buildNamedRemoteEvidenceRequest({ root, generatedAt });
  return {
    schemaVersion: NAMED_REMOTE_CAPTURE_SCHEMA,
    capturedAt: null,
    captureMode: request.requiredCaptureMode,
    remoteContacted: false,
    targetIdentity: { projectRefSha256: request.targetIdentity.projectRefSha256 },
    provenance: {
      collector: null,
      cliVersion: null,
      commandSha256: null,
    },
    execution: Object.fromEntries(EXECUTION_KEYS.map((key) => [key, false])),
    sqlBodiesIncluded: false,
    secretsIncluded: false,
    migrations: [],
    requiredLogicalNames: request.requiredMappings.map(({ logicalName }) => logicalName),
    operatorNotice:
      "Preencher somente a partir de captura remota explicitamente autorizada e somente leitura; nunca incluir SQL, project ref em claro ou segredos.",
  };
}

export function adaptNamedRemoteMetadataCapture(
  capture,
  { root = process.cwd(), now = new Date() } = {},
) {
  const request = buildNamedRemoteEvidenceRequest({ root, generatedAt: now });
  if (!capture || typeof capture !== "object" || Array.isArray(capture)) {
    return fail("named_remote_capture_missing", request);
  }
  if (capture.schemaVersion !== NAMED_REMOTE_CAPTURE_SCHEMA) {
    return fail("named_remote_capture_schema_invalid", request);
  }
  if (capture.sqlBodiesIncluded !== false || capture.secretsIncluded !== false) {
    return fail("named_remote_capture_contains_prohibited_content", request);
  }
  if (capture.captureMode !== request.requiredCaptureMode || capture.remoteContacted !== true) {
    return fail("named_remote_capture_not_current_read_only_remote_metadata", request);
  }
  if (
    capture.targetIdentity?.projectRefSha256 !== EXPECTED_PROJECT_REF_SHA256 ||
    !exactKeys(capture.targetIdentity ?? {}, ["projectRefSha256"])
  ) {
    return fail("named_remote_capture_target_identity_invalid", request);
  }
  const execution = capture.execution ?? {};
  if (!exactKeys(execution, EXECUTION_KEYS) || EXECUTION_KEYS.some((key) => execution[key] !== false)) {
    return fail("named_remote_capture_mutation_tainted_or_ambiguous", request);
  }
  const provenance = capture.provenance ?? {};
  if (
    !exactKeys(provenance, ["collector", "cliVersion", "commandSha256"]) ||
    typeof provenance.collector !== "string" || provenance.collector.trim() === "" ||
    typeof provenance.cliVersion !== "string" || provenance.cliVersion.trim() === "" ||
    typeof provenance.commandSha256 !== "string" || !/^[a-f0-9]{64}$/.test(provenance.commandSha256)
  ) {
    return fail("named_remote_capture_provenance_invalid", request);
  }
  if (!Array.isArray(capture.migrations)) {
    return fail("named_remote_capture_migrations_invalid", request);
  }

  const byLogicalName = new Map();
  const seenRemoteNames = new Set();
  for (const migration of capture.migrations) {
    if (
      !migration || typeof migration !== "object" || Array.isArray(migration) ||
      !exactKeys(migration, ["version", "name"]) ||
      typeof migration.version !== "string" || typeof migration.name !== "string"
    ) {
      return fail("named_remote_capture_migration_record_invalid", request);
    }
    const identity = migration.name.match(REMOTE_NAME_PATTERN);
    if (!identity || identity[1] !== migration.version || seenRemoteNames.has(migration.name)) {
      return fail("named_remote_capture_migration_identity_invalid", request);
    }
    seenRemoteNames.add(migration.name);
    const logicalName = identity[2];
    const existing = byLogicalName.get(logicalName) ?? [];
    existing.push(migration);
    byLogicalName.set(logicalName, existing);
  }

  const mappings = [];
  for (const local of request.requiredMappings) {
    const matches = byLogicalName.get(local.logicalName) ?? [];
    if (matches.length === 0) {
      return fail("named_remote_capture_required_mapping_missing", request);
    }
    if (matches.length > 1) {
      return fail("named_remote_capture_required_mapping_ambiguous", request);
    }
    const remote = matches[0];
    mappings.push({
      localFilename: local.localFilename,
      localSha256: local.localSha256,
      logicalName: local.logicalName,
      remoteVersion: remote.version,
      remoteName: remote.name,
    });
  }

  const sourceMetadata = normalizedMigrations(capture.migrations);
  const evidence = {
    schemaVersion: NAMED_REMOTE_EVIDENCE_SCHEMA,
    capturedAt: capture.capturedAt,
    captureMode: capture.captureMode,
    remoteContacted: true,
    targetIdentity: { projectRefSha256: capture.targetIdentity.projectRefSha256 },
    provenance: {
      collector: capture.provenance.collector.trim(),
      cliVersion: capture.provenance.cliVersion.trim(),
      commandSha256: capture.provenance.commandSha256,
    },
    execution: Object.fromEntries(EXECUTION_KEYS.map((key) => [key, false])),
    localFingerprintSetSha256: request.localFingerprintSetSha256,
    mappings,
    adapterVersion: NAMED_REMOTE_CAPTURE_ADAPTER_VERSION,
    sourceMetadataSha256: sha256(JSON.stringify(sourceMetadata)),
    sqlBodiesIncluded: false,
    secretsIncluded: false,
  };
  const validation = validateNamedRemoteMigrationEvidence(evidence, { root, now });
  if (!validation.valid) {
    return fail(validation.reason, request);
  }
  return {
    ok: true,
    reason: "named_remote_capture_adapted_and_contract_valid",
    evidence,
    validation: {
      reason: validation.reason,
      mappingCount: validation.mappingCount,
      ageSeconds: validation.ageSeconds,
    },
    remoteWriteExecuted: false,
    migrationApplied: false,
    migrationHistoryRepaired: false,
    migrationFileRenamed: false,
    databaseReset: false,
    buildAuthorized: false,
    zipAuthorized: false,
    deployAuthorized: false,
  };
}

