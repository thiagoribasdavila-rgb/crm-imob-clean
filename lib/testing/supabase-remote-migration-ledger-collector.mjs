import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const AUTHORIZATION_FLAG = "ATLAS_ALLOW_READ_ONLY_REMOTE_MIGRATION_HISTORY";
const EXPECTED_PROJECT_REF_SHA256 = "f37af84c3622f9a4f1b438df087b65d882e37e6f3860718e8f8f7c6cd80f8b87";
const ALLOWED_ARGUMENT = "--collect";
const COLLISION_VERSIONS = ["20260716235900", "20260717203000", "20260717213000"];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function migrationVersion(value) {
  return String(value ?? "").trim().match(/^([0-9]{14})$/)?.[1] ?? null;
}

export function parseSupabaseMigrationList(rawOutput) {
  const rows = [];
  for (const line of String(rawOutput ?? "").split(/\r?\n/)) {
    const cells = line.split("|");
    if (cells.length < 2) continue;
    const local = migrationVersion(cells[0]);
    const remote = migrationVersion(cells[1]);
    if (!local && !remote) continue;
    rows.push({
      local,
      remote,
      state: local && remote ? "both" : local ? "local_only" : "remote_only",
    });
  }

  const localVersions = [...new Set(rows.flatMap((row) => row.local ? [row.local] : []))].sort();
  const remoteVersions = [...new Set(rows.flatMap((row) => row.remote ? [row.remote] : []))].sort();
  return {
    rows,
    localVersions,
    remoteVersions,
    localOnlyVersions: rows.filter((row) => row.state === "local_only").map((row) => row.local),
    remoteOnlyVersions: rows.filter((row) => row.state === "remote_only").map((row) => row.remote),
  };
}

function safeEnvironment(source) {
  const environment = { ...source };
  for (const key of ["DATABASE_URL", "DIRECT_URL", "SUPABASE_DB_PASSWORD", "PGPASSWORD"]) {
    delete environment[key];
  }
  return environment;
}

function baseResult(status, extra = {}) {
  return {
    schemaVersion: "atlas.remote_migration_ledger_collection.v1",
    status,
    remoteContacted: false,
    remoteWriteExecuted: false,
    migrationApplied: false,
    migrationHistoryRepaired: false,
    databaseReset: false,
    rawOutputPersisted: false,
    credentialsPersisted: false,
    ...extra,
  };
}

export function assessRemoteMigrationLedgerCollection({
  root = process.cwd(),
  argv = [],
  env = process.env,
  spawn = spawnSync,
  now = () => new Date(),
} = {}) {
  const unknownArguments = argv.filter((argument) => argument !== ALLOWED_ARGUMENT);
  if (unknownArguments.length > 0) {
    return baseResult("refused_unrecognized_arguments", { unknownArgumentCount: unknownArguments.length });
  }

  const collectRequested = argv.includes(ALLOWED_ARGUMENT);
  if (!collectRequested) {
    return baseResult("preflight_only_remote_not_contacted", {
      collectRequested: false,
      authorizationPresent: env[AUTHORIZATION_FLAG] === "1",
      nextAction: "run_in_explicitly_authorized_operator_session",
    });
  }
  if (env[AUTHORIZATION_FLAG] !== "1") {
    return baseResult("blocked_missing_explicit_authorization", {
      collectRequested: true,
      authorizationPresent: false,
    });
  }

  const canonicalRoot = resolve(root);
  const markerPath = join(canonicalRoot, "supabase", ".temp", "project-ref");
  if (!existsSync(markerPath)) {
    return baseResult("blocked_project_not_linked", {
      collectRequested: true,
      authorizationPresent: true,
    });
  }
  const projectRefHash = sha256(readFileSync(markerPath, "utf8").trim());
  if (projectRefHash !== EXPECTED_PROJECT_REF_SHA256) {
    return baseResult("blocked_linked_project_mismatch", {
      collectRequested: true,
      authorizationPresent: true,
    });
  }

  const cliPath = join(canonicalRoot, "node_modules", ".bin", "supabase");
  if (!existsSync(cliPath)) {
    return baseResult("blocked_supabase_cli_missing", {
      collectRequested: true,
      authorizationPresent: true,
    });
  }

  const execution = spawn(cliPath, ["migration", "list", "--linked"], {
    cwd: canonicalRoot,
    env: safeEnvironment(env),
    encoding: "utf8",
    shell: false,
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (execution.error || execution.status !== 0) {
    return baseResult("collection_failed_safely", {
      collectRequested: true,
      authorizationPresent: true,
      remoteContacted: true,
      exitCode: Number.isInteger(execution.status) ? execution.status : null,
      failureCategory: execution.error?.code === "ETIMEDOUT" ? "timeout" : "cli_failure",
    });
  }

  const ledger = parseSupabaseMigrationList(execution.stdout);
  return baseResult("remote_ledger_collected_read_only", {
    collectedAt: now().toISOString(),
    collectRequested: true,
    authorizationPresent: true,
    remoteContacted: true,
    ledger: {
      localVersionCount: ledger.localVersions.length,
      remoteVersionCount: ledger.remoteVersions.length,
      localOnlyCount: ledger.localOnlyVersions.length,
      remoteOnlyCount: ledger.remoteOnlyVersions.length,
      localVersions: ledger.localVersions,
      remoteVersions: ledger.remoteVersions,
      localOnlyVersions: ledger.localOnlyVersions,
      remoteOnlyVersions: ledger.remoteOnlyVersions,
      collisionVersions: COLLISION_VERSIONS.map((version) => ({
        version,
        presentLocally: ledger.localVersions.includes(version),
        presentRemotely: ledger.remoteVersions.includes(version),
      })),
    },
    reconciliation: {
      collisionNamesResolved: false,
      directPushAuthorized: false,
      repairAuthorized: false,
      reason: "migration list exposes versions, not the historical names required to resolve duplicate authored versions",
    },
  });
}

