import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PHASE30_APPROVAL as _PHASE30_APPROVAL, validatePhase30Runtime } from "./preflight-meta-repeatability-sample-02-local-runtime.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (file) => readFileSync(resolve(root, file), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-local-runtime-gate.json"));
const composeFile = resolve(root, gate.runtime.composeFile);
const approval = process.env.ATLAS_PHASE30_HUMAN_APPROVAL ?? "";
const evidenceInput = process.env.ATLAS_PHASE30_EVIDENCE_FILE ?? "artifacts/meta-phase30-local-runtime-evidence.json";
const evidenceFile = isAbsolute(evidenceInput) ? evidenceInput : resolve(root, evidenceInput);
const ephemeralPassword = "atlas_phase30_ephemeral_only";
const pgOptions = "-c app.atlas_phase30_environment=local_ephemeral -c app.atlas_meta_ledger_environment=staging_clone";
const startedAt = new Date().toISOString();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const artifactFiles = {
  compose: gate.runtime.composeFile,
  baseline: "supabase/tests/fixtures/phase_030_meta_permit_ledger_baseline.sql",
  migration: "supabase/migrations/20260719092358_phase_029_meta_permit_atomic_ledger.sql",
  verification: "supabase/tests/database/phase_030_meta_permit_ledger_verify.sql",
  rollback: "supabase/migration-drafts/phase_028_meta_permit_atomic_ledger.rollback.sql",
  cleanupVerification: "supabase/tests/database/phase_030_meta_permit_ledger_cleanup_verify.sql"
};
const artifactFingerprints = Object.fromEntries(Object.entries(artifactFiles).map(([name, file]) => [name, {
  file,
  sha256: sha256(read(file))
}]));

const prohibitedActions = Object.fromEntries(Object.keys(gate.prohibitedActions).map((key) => [key, false]));
const preflight = validatePhase30Runtime({
  phase: gate.phase,
  environment: gate.environment,
  approval,
  runtime: gate.runtime,
  prohibitedActions
});

if (!preflight.approved) {
  console.error(`phase30_preflight_rejected:${preflight.issueCodes.join(",")}`);
  process.exit(1);
}
if (!(evidenceFile === root || evidenceFile.startsWith(`${root}${sep}`))) {
  console.error("phase30_evidence_path_outside_workspace");
  process.exit(1);
}

const dockerVersion = spawnSync("docker", ["compose", "version"], { encoding: "utf8" });
if (dockerVersion.status !== 0) {
  console.error("isolated_runtime_unavailable:docker_compose_required");
  process.exit(1);
}

const compose = (args, options = {}) => spawnSync(
  "docker",
  ["compose", "-f", composeFile, ...args],
  { cwd: root, encoding: "utf8", ...options }
);
const assertCommand = (result, code) => {
  if (result.status !== 0) {
    throw new Error(`${code}:${(result.stderr || result.stdout || "unknown").trim().slice(0, 1200)}`);
  }
  return result;
};
const executeSql = (sql, code) => assertCommand(compose([
  "exec", "-T", "-e", `PGPASSWORD=${ephemeralPassword}`, "-e", `PGOPTIONS=${pgOptions}`,
  "postgres", "psql", "-U", "postgres", "-d", "atlas_phase30", "-v", "ON_ERROR_STOP=1", "-f", "-"
], { input: sql }), code);
const queryScalar = (sql, code) => assertCommand(compose([
  "exec", "-T", "-e", `PGPASSWORD=${ephemeralPassword}`, "postgres", "psql", "-U", "postgres",
  "-d", "atlas_phase30", "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql
]), code).stdout.trim();

const evidence = {
  schemaVersion: "phase31.runtime-evidence.v1",
  phase: 30,
  runId: randomUUID(),
  startedAt,
  finishedAt: null,
  status: "failed",
  environment: "local_ephemeral",
  runtime: {
    engineDetected: true,
    engine: "docker_compose",
    databaseHealthy: false,
    imageReference: gate.runtime.postgresImage,
    imageFingerprint: null,
    targetFingerprint: sha256("127.0.0.1:55432/atlas_phase30"),
    postgresVersion: null
  },
  artifactFingerprints,
  eventSequence: [],
  rehearsal: {
    baselineApplied: false,
    migrationApplied: false,
    securityVerified: false,
    permitReservationExecuted: false,
    rollbackAttempted: false,
    rollbackApproved: false,
    finalLedgerObjectsAbsent: false,
    volumesDestroyed: false
  },
  releaseGates: {
    isolatedRuntimeProven: false,
    migrationRehearsalApproved: false,
    rollbackRehearsalApproved: false,
    cleanupApproved: false
  },
  databaseTouched: false,
  remoteDatabaseTouched: false,
  metaTouched: false,
  buildExecuted: false
};
const recordEvent = (event) => evidence.eventSequence.push({ event, at: new Date().toISOString() });

let failure;
try {
  assertCommand(compose(["down", "--volumes", "--remove-orphans"]), "phase30_initial_cleanup_failed");
  assertCommand(compose(["up", "-d", "--wait"]), "phase30_runtime_start_failed");
  recordEvent("runtime_started");
  evidence.runtime.databaseHealthy = true;
  evidence.databaseTouched = true;

  const image = assertCommand(spawnSync("docker", ["image", "inspect", gate.runtime.postgresImage, "--format", "{{.Id}}"], { encoding: "utf8" }), "phase30_image_inspection_failed");
  evidence.runtime.imageFingerprint = sha256(image.stdout.trim());
  evidence.runtime.postgresVersion = queryScalar("show server_version", "phase30_postgres_version_failed");

  executeSql(read("supabase/tests/fixtures/phase_030_meta_permit_ledger_baseline.sql"), "phase30_baseline_failed");
  evidence.rehearsal.baselineApplied = true;
  recordEvent("baseline_applied");
  executeSql(read("supabase/migrations/20260719092358_phase_029_meta_permit_atomic_ledger.sql"), "phase30_migration_failed");
  evidence.rehearsal.migrationApplied = true;
  recordEvent("migration_applied");
  executeSql(read("supabase/tests/database/phase_030_meta_permit_ledger_verify.sql"), "phase30_verification_failed");
  evidence.rehearsal.securityVerified = true;
  recordEvent("security_verified");

  evidence.rehearsal.rollbackAttempted = true;
  recordEvent("rollback_started");
  executeSql(read("supabase/migration-drafts/phase_028_meta_permit_atomic_ledger.rollback.sql"), "phase30_rollback_failed");
  executeSql(read("supabase/tests/database/phase_030_meta_permit_ledger_cleanup_verify.sql"), "phase30_cleanup_verification_failed");
  evidence.rehearsal.rollbackApproved = true;
  evidence.rehearsal.finalLedgerObjectsAbsent = true;
  recordEvent("rollback_verified");
} catch (error) {
  failure = error;
} finally {
  const cleanup = compose(["down", "--volumes", "--remove-orphans"]);
  evidence.rehearsal.volumesDestroyed = cleanup.status === 0;
  if (cleanup.status === 0) recordEvent("runtime_destroyed");
  if (cleanup.status !== 0 && !failure) failure = new Error(`phase30_final_cleanup_failed:${(cleanup.stderr || cleanup.stdout || "unknown").trim().slice(0, 1200)}`);
}

evidence.finishedAt = new Date().toISOString();

if (!failure) {
  evidence.status = "approved";
  evidence.releaseGates.isolatedRuntimeProven = true;
  evidence.releaseGates.migrationRehearsalApproved = true;
  evidence.releaseGates.rollbackRehearsalApproved = true;
  evidence.releaseGates.cleanupApproved = true;
}

mkdirSync(dirname(evidenceFile), { recursive: true });
writeFileSync(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
if (failure) {
  console.error(failure.message);
  process.exit(1);
}
console.log(JSON.stringify({
  status: evidence.status,
  evidenceFile: evidenceFile.slice(root.length + 1),
  localDatabaseTouched: evidence.databaseTouched,
  remoteDatabaseTouched: evidence.remoteDatabaseTouched,
  permitReservationExecuted: evidence.rehearsal.permitReservationExecuted,
  metaTouched: evidence.metaTouched,
  volumesDestroyed: evidence.rehearsal.volumesDestroyed,
  buildExecuted: evidence.buildExecuted
}, null, 2));
