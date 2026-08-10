import { createHash, randomUUID } from "node:crypto";
import { createReadStream, chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE36_APPROVAL, scanPhase36LogicalBackupText, validatePhase36ExecutionRequest } from "./preflight-meta-repeatability-sample-02-ephemeral-restore-execution.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (file) => readFileSync(resolve(root, file), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-ephemeral-restore-execution-gate.json"));
const maximumJsonBytes = 1024 * 1024;
const approval = process.env.ATLAS_PHASE36_HUMAN_APPROVAL ?? "";
const contractInput = process.env.ATLAS_PHASE35_REHEARSAL_CONTRACT_FILE;
const readinessInput = process.env.ATLAS_PHASE34_READINESS_FILE;
const manifestInput = process.env.ATLAS_PHASE35_BACKUP_MANIFEST_FILE;
const backupInput = process.env.ATLAS_PHASE36_LOGICAL_BACKUP_FILE;
const evidenceInput = process.env.ATLAS_PHASE36_RESTORE_EVIDENCE_FILE ?? "artifacts/meta-phase36-local-restore-evidence.json";
const composeFile = resolve(root, gate.runtime.composeFile);
const ephemeralPassword = "atlas_phase36_ephemeral_only";
const withinWorkspace = (file) => file === root || file.startsWith(`${root}${sep}`);
const resolveWorkspaceFile = (input) => isAbsolute(input) ? resolve(input) : resolve(root, input);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

if (!contractInput || !readinessInput || !manifestInput || !backupInput) {
  console.error("phase36_contract_readiness_manifest_and_backup_paths_required");
  process.exit(1);
}
if (approval !== PHASE36_APPROVAL) {
  console.error("phase36_explicit_human_approval_required");
  process.exit(1);
}

const jsonFiles = [contractInput, readinessInput, manifestInput].map(resolveWorkspaceFile);
const backupFile = resolveWorkspaceFile(backupInput);
const evidenceFile = resolveWorkspaceFile(evidenceInput);
if ([...jsonFiles, backupFile, evidenceFile, composeFile].some((file) => !withinWorkspace(file))) {
  console.error("phase36_path_outside_workspace");
  process.exit(1);
}
for (const file of jsonFiles) {
  if (!existsSync(file) || lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile() || lstatSync(file).size > maximumJsonBytes || !withinWorkspace(realpathSync(file))) {
    console.error("phase36_json_source_file_unsafe");
    process.exit(1);
  }
}
if (!existsSync(backupFile) || lstatSync(backupFile).isSymbolicLink() || !lstatSync(backupFile).isFile() || !withinWorkspace(realpathSync(backupFile))) {
  console.error("phase36_backup_file_unsafe");
  process.exit(1);
}
if (lstatSync(backupFile).size > gate.backup.maximumSizeBytes) {
  console.error("phase36_backup_size_limit_exceeded");
  process.exit(1);
}
if (existsSync(evidenceFile) && lstatSync(evidenceFile).isSymbolicLink()) {
  console.error("phase36_evidence_symlink_rejected");
  process.exit(1);
}

const [rawContract, rawReadiness, rawBackupManifest] = jsonFiles.map((file) => readFileSync(file, "utf8"));
let sourceContract;
let readinessReceipt;
let backupManifest;
try {
  sourceContract = JSON.parse(rawContract);
  readinessReceipt = JSON.parse(rawReadiness);
  backupManifest = JSON.parse(rawBackupManifest);
} catch {
  console.error("phase36_source_json_invalid");
  process.exit(1);
}

async function inspectLogicalBackup(file) {
  const hash = createHash("sha256");
  const issues = new Set();
  let sizeBytes = 0;
  let tail = "";
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk);
    sizeBytes += chunk.length;
    const text = `${tail}${chunk.toString("utf8")}`;
    scanPhase36LogicalBackupText(text).forEach((issue) => issues.add(issue));
    tail = text.slice(-512);
  }
  return { sha256: hash.digest("hex"), sizeBytes, issues: [...issues] };
}

const backupInspection = await inspectLogicalBackup(backupFile);
if (backupInspection.issues.length) {
  console.error(`phase36_logical_backup_safety_rejected:${backupInspection.issues.join(",")}`);
  process.exit(1);
}

const request = validatePhase36ExecutionRequest({
  sourceContract,
  readinessReceipt,
  backupManifest,
  rawReadiness,
  rawBackupManifest,
  approval,
  runtime: gate.runtime,
  backupDescriptor: {
    regularFile: true,
    symbolicLink: false,
    withinWorkspace: true,
    sha256: backupInspection.sha256,
    sizeBytes: backupInspection.sizeBytes
  }
});
if (!request.approved) {
  console.error(`phase36_preflight_rejected:${request.issues.join(",")}`);
  process.exit(1);
}

const dockerVersion = spawnSync("docker", ["compose", "version"], { encoding: "utf8" });
if (dockerVersion.status !== 0) {
  console.error("phase36_isolated_runtime_unavailable:docker_compose_required");
  process.exit(1);
}

const composeArgs = ["compose", "-p", gate.runtime.composeProject, "-f", composeFile];
const compose = (args, options = {}) => spawnSync("docker", [...composeArgs, ...args], { cwd: root, encoding: "utf8", ...options });
const assertCommand = (result, code) => {
  if (result.status !== 0) throw new Error(code);
  return result;
};
const query = (sql, code) => assertCommand(compose([
  "exec", "-T", "-e", `PGPASSWORD=${ephemeralPassword}`, "postgres", "psql", "-U", "postgres",
  "-d", gate.runtime.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql
]), code).stdout.trim();
const queryCount = (sql, code) => {
  const value = Number(query(sql, code));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${code}_invalid_count`);
  return value;
};

const restoreBackup = (file) => new Promise((resolveRestore, rejectRestore) => {
  const child = spawn("docker", [...composeArgs, "exec", "-T", "-e", `PGPASSWORD=${ephemeralPassword}`,
    "-e", "PGOPTIONS=-c session_replication_role=replica", "postgres", "psql", "-U", "postgres",
    "-d", gate.runtime.database, "--single-transaction", "--set", "ON_ERROR_STOP=on", "--file", "-"],
  { cwd: root, stdio: ["pipe", "ignore", "pipe"] });
  const errorHash = createHash("sha256");
  child.stderr.on("data", (chunk) => errorHash.update(chunk));
  child.on("error", () => rejectRestore(new Error("phase36_restore_process_failed")));
  child.on("close", (code) => code === 0
    ? resolveRestore()
    : rejectRestore(new Error(`phase36_restore_failed:${errorHash.digest("hex")}`)));
  const input = createReadStream(file);
  input.on("error", () => child.kill("SIGTERM"));
  input.pipe(child.stdin);
});

const expected = backupManifest.validationExpectations;
const startedAt = new Date().toISOString();
const evidence = {
  schemaVersion: "phase36.local-restore-evidence.v1",
  phase: 36,
  sourcePhase: 35,
  status: "failed",
  runId: randomUUID(),
  startedAt,
  finishedAt: null,
  sourceContractFingerprint: sha256(rawContract),
  sourceReadinessFingerprint: sha256(rawReadiness),
  backupManifestFingerprint: sha256(rawBackupManifest),
  backupContentFingerprint: backupInspection.sha256,
  environment: gate.environment,
  runtime: {
    engine: gate.runtime.engine,
    networkMode: gate.runtime.networkMode,
    publishedPorts: gate.runtime.publishedPorts,
    databaseHealthy: false,
    imageFingerprint: null,
    postgresVersion: null,
    targetFingerprint: sha256(`${gate.runtime.composeProject}:${gate.runtime.database}:network-none`)
  },
  validation: {
    backupHashVerified: true,
    backupSizeVerified: true,
    logicalBackupSafetyApproved: true,
    postgresMajorMatches: false,
    catalogFingerprintMatches: false,
    catalogCountsMatch: false,
    securityApproved: false,
    authCountsMatch: false,
    storageMetadataCountsMatch: false,
    migrationCountMatches: false,
    restoreDurationWithinLimit: false,
    targetDestructionVerified: false
  },
  metrics: { expected, actual: null },
  eventSequence: [],
  restore: { attempted: false, completed: false, approved: false, durationMs: null, volumesDestroyed: false },
  releaseGates: {
    localRestoreApproved: false,
    stagingMigrationAllowed: false,
    productionMigrationAllowed: false,
    productionCompatibilityApproved: false
  },
  localDatabaseTouched: false,
  remoteDatabaseTouched: false,
  metaTouched: false,
  buildExecuted: false
};
const recordEvent = (event) => evidence.eventSequence.push({ event, at: new Date().toISOString() });

let failure;
try {
  assertCommand(compose(["down", "--volumes", "--remove-orphans"]), "phase36_initial_cleanup_failed");
  assertCommand(compose(["up", "-d", "--wait"]), "phase36_runtime_start_failed");
  evidence.runtime.databaseHealthy = true;
  evidence.localDatabaseTouched = true;
  recordEvent("isolated_runtime_started");

  const image = assertCommand(spawnSync("docker", ["image", "inspect", gate.runtime.postgresImage, "--format", "{{.Id}}"], { encoding: "utf8" }), "phase36_image_inspection_failed");
  evidence.runtime.imageFingerprint = sha256(image.stdout.trim());
  evidence.runtime.postgresVersion = query("show server_version", "phase36_postgres_version_failed");
  evidence.validation.postgresMajorMatches = Number(evidence.runtime.postgresVersion.split(".")[0]) === gate.runtime.postgresMajor;
  if (!evidence.validation.postgresMajorMatches) throw new Error("phase36_postgres_major_mismatch");

  evidence.restore.attempted = true;
  recordEvent("restore_started");
  const restoreStarted = Date.now();
  await restoreBackup(backupFile);
  evidence.restore.durationMs = Date.now() - restoreStarted;
  evidence.restore.completed = true;
  evidence.validation.restoreDurationWithinLimit = evidence.restore.durationMs <= gate.runtime.maximumRestoreDurationMs;
  if (!evidence.validation.restoreDurationWithinLimit) throw new Error("phase36_restore_duration_exceeded");
  recordEvent("restore_completed");

  const schemaFilter = "n.nspname <> 'information_schema' and n.nspname not like 'pg_%'";
  const tableFilter = "c.relkind in ('r','p')";
  const catalogText = query(`select concat_ws('|', table_schema, table_name, ordinal_position::text, column_name, data_type, is_nullable) from information_schema.columns where table_schema <> 'information_schema' and table_schema not like 'pg_%' order by 1`, "phase36_catalog_query_failed");
  const actual = {
    catalogFingerprint: sha256(catalogText),
    userSchemaCount: queryCount(`select count(*) from pg_namespace n where ${schemaFilter}`, "phase36_schema_count_failed"),
    tableCount: queryCount(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where ${schemaFilter} and ${tableFilter}`, "phase36_table_count_failed"),
    rlsEnabledTableCount: queryCount(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where ${schemaFilter} and ${tableFilter} and c.relrowsecurity`, "phase36_rls_count_failed"),
    publicTablesWithoutRls: queryCount("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity", "phase36_public_rls_failed"),
    invalidConstraintCount: queryCount("select count(*) from pg_constraint where not convalidated", "phase36_constraint_count_failed"),
    authUserCount: queryCount("select count(*) from auth.users", "phase36_auth_count_failed"),
    storageBucketCount: queryCount("select count(*) from storage.buckets", "phase36_storage_bucket_count_failed"),
    storageObjectMetadataCount: queryCount("select count(*) from storage.objects", "phase36_storage_object_count_failed"),
    migrationCount: queryCount("select count(*) from supabase_migrations.schema_migrations", "phase36_migration_count_failed")
  };
  evidence.metrics.actual = actual;
  evidence.validation.catalogFingerprintMatches = actual.catalogFingerprint === expected.catalogFingerprint;
  evidence.validation.catalogCountsMatch = actual.userSchemaCount === expected.userSchemaCount
    && actual.tableCount === expected.tableCount && actual.rlsEnabledTableCount === expected.rlsEnabledTableCount;
  evidence.validation.securityApproved = actual.publicTablesWithoutRls === 0 && actual.invalidConstraintCount === 0
    && actual.publicTablesWithoutRls === expected.publicTablesWithoutRls && actual.invalidConstraintCount === expected.invalidConstraintCount;
  evidence.validation.authCountsMatch = actual.authUserCount === expected.authUserCount;
  evidence.validation.storageMetadataCountsMatch = actual.storageBucketCount === expected.storageBucketCount
    && actual.storageObjectMetadataCount === expected.storageObjectMetadataCount;
  evidence.validation.migrationCountMatches = actual.migrationCount === expected.migrationCount;
  const validationChecks = [
    "catalogFingerprintMatches", "catalogCountsMatch", "securityApproved", "authCountsMatch",
    "storageMetadataCountsMatch", "migrationCountMatches", "restoreDurationWithinLimit"
  ];
  if (validationChecks.some((key) => evidence.validation[key] !== true)) throw new Error("phase36_post_restore_validation_failed");
  recordEvent("post_restore_validation_approved");
} catch (error) {
  failure = error;
} finally {
  const cleanup = compose(["down", "--volumes", "--remove-orphans"]);
  evidence.restore.volumesDestroyed = cleanup.status === 0;
  evidence.validation.targetDestructionVerified = cleanup.status === 0;
  if (cleanup.status === 0) recordEvent("runtime_and_volumes_destroyed");
  if (cleanup.status !== 0 && !failure) failure = new Error("phase36_final_cleanup_failed");
}

if (!failure && evidence.validation.targetDestructionVerified) {
  evidence.status = "approved_local_restore_only";
  evidence.restore.approved = true;
  evidence.releaseGates.localRestoreApproved = true;
}
evidence.finishedAt = new Date().toISOString();

mkdirSync(dirname(evidenceFile), { recursive: true });
if (!withinWorkspace(realpathSync(dirname(evidenceFile)))) {
  console.error("phase36_evidence_parent_unsafe");
  process.exit(1);
}
writeFileSync(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
chmodSync(evidenceFile, 0o600);
if (failure) {
  console.error(failure.message);
  process.exit(1);
}
console.log(JSON.stringify({
  status: evidence.status,
  evidenceFile: evidenceFile.slice(root.length + 1),
  localRestoreApproved: evidence.releaseGates.localRestoreApproved,
  localDatabaseTouched: evidence.localDatabaseTouched,
  remoteDatabaseTouched: evidence.remoteDatabaseTouched,
  metaTouched: evidence.metaTouched,
  volumesDestroyed: evidence.restore.volumesDestroyed,
  stagingMigrationAllowed: evidence.releaseGates.stagingMigrationAllowed,
  productionMigrationAllowed: evidence.releaseGates.productionMigrationAllowed,
  buildExecuted: evidence.buildExecuted
}, null, 2));
