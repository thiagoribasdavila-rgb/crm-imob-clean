import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PHASE32_APPROVAL as _PHASE32_APPROVAL, validatePhase32Pg17Compatibility } from "./preflight-meta-repeatability-sample-02-pg17-compatibility.mjs";
import { validatePhase31RuntimeEvidence } from "./preflight-meta-repeatability-sample-02-runtime-evidence.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (file) => readFileSync(resolve(root, file), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-pg17-compatibility-gate.json"));
const composeFile = resolve(root, gate.runtime.composeFile);
const approval = process.env.ATLAS_PHASE32_HUMAN_APPROVAL ?? "";
const sourceEvidenceInput = process.env.ATLAS_PHASE31_RUNTIME_EVIDENCE_FILE;
const sourceReceiptInput = process.env.ATLAS_PHASE31_RECONCILIATION_FILE;
const targetEvidenceInput = process.env.ATLAS_PHASE32_EVIDENCE_FILE ?? "artifacts/meta-phase32-pg17-compatibility-evidence.json";
const ephemeralPassword = "atlas_phase32_ephemeral_only";
const pgOptions = [
  "-c app.atlas_phase30_environment=local_ephemeral",
  "-c app.atlas_phase32_environment=local_ephemeral_pg17",
  "-c app.atlas_meta_ledger_environment=staging_clone"
].join(" ");
const startedAt = new Date().toISOString();
const withinWorkspace = (file) => file === root || file.startsWith(`${root}${sep}`);
const resolveWorkspaceFile = (input) => isAbsolute(input) ? resolve(input) : resolve(root, input);
const targetEvidenceFile = resolveWorkspaceFile(targetEvidenceInput);
const sql = Object.values(gate.requiredArtifacts)
  .filter((file) => file.endsWith(".sql"))
  .map(read)
  .join("\n");

const prohibitedActions = Object.fromEntries(Object.keys(gate.prohibitedActions).map((key) => [key, false]));
const preflight = validatePhase32Pg17Compatibility({
  phase: gate.phase,
  environment: gate.environment,
  approval,
  runtime: gate.runtime,
  sourceEvidence: gate.sourceEvidence,
  prohibitedActions,
  sql
});
if (!preflight.approved) {
  console.error(`phase32_preflight_rejected:${preflight.issueCodes.join(",")}`);
  process.exit(1);
}
if (!sourceEvidenceInput || !sourceReceiptInput) {
  console.error("phase32_source_evidence_required");
  process.exit(1);
}
if (!withinWorkspace(targetEvidenceFile)) {
  console.error("phase32_evidence_path_outside_workspace");
  process.exit(1);
}

const readSafeJson = (input, label) => {
  const file = resolveWorkspaceFile(input);
  if (!withinWorkspace(file) || !existsSync(file)) throw new Error(`${label}_file_invalid`);
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 1024 * 1024) throw new Error(`${label}_file_unsafe`);
  if (!withinWorkspace(realpathSync(file))) throw new Error(`${label}_file_unsafe`);
  const raw = readFileSync(file, "utf8");
  try {
    return { file, raw, value: JSON.parse(raw) };
  } catch {
    throw new Error(`${label}_json_invalid`);
  }
};

let sourceEvidence;
let sourceReceipt;
try {
  sourceEvidence = readSafeJson(sourceEvidenceInput, "phase31_runtime_evidence");
  sourceReceipt = readSafeJson(sourceReceiptInput, "phase31_reconciliation");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const sourceValidation = validatePhase31RuntimeEvidence(sourceEvidence.value);
if (!sourceValidation.approved) {
  console.error(`phase32_source_evidence_rejected:${sourceValidation.issues.join(",")}`);
  process.exit(1);
}
const receipt = sourceReceipt.value;
const receiptIssues = [];
const receiptExpect = (condition, code) => { if (!condition) receiptIssues.push(code); };
receiptExpect(receipt?.schemaVersion === "phase31.runtime-reconciliation.v1", "receipt_schema_mismatch");
receiptExpect(receipt?.phase === 31 && receipt?.sourcePhase === 30, "receipt_phase_mismatch");
receiptExpect(receipt?.status === "approved" && receipt?.runtimeApproved === true, "receipt_not_approved");
receiptExpect(receipt?.artifactFingerprintsMatched === true, "receipt_artifacts_not_approved");
receiptExpect(receipt?.evidenceFingerprint === sha256(sourceEvidence.raw), "receipt_evidence_fingerprint_mismatch");
receiptExpect(receipt?.eventSequenceFingerprint === sha256(JSON.stringify(sourceEvidence.value.eventSequence)), "receipt_event_fingerprint_mismatch");
receiptExpect(receipt?.remoteDatabaseTouched === false && receipt?.metaTouched === false && receipt?.buildExecuted === false, "receipt_prohibited_touch_detected");
if (receiptIssues.length) {
  console.error(`phase32_source_receipt_rejected:${receiptIssues.join(",")}`);
  process.exit(1);
}

const artifactFingerprints = Object.fromEntries(Object.entries(gate.requiredArtifacts).map(([name, file]) => [name, {
  file,
  sha256: sha256(read(file))
}]));
const sharedArtifacts = {
  baseline: "baseline",
  migration: "migration",
  securityVerification: "verification",
  rollback: "rollback",
  cleanupVerification: "cleanupVerification"
};
const sharedIssues = [];
for (const [targetName, sourceName] of Object.entries(sharedArtifacts)) {
  if (artifactFingerprints[targetName]?.sha256 !== sourceEvidence.value.artifactFingerprints?.[sourceName]?.sha256) {
    sharedIssues.push(`shared_artifact_mismatch:${targetName}`);
  }
}
if (sharedIssues.length) {
  console.error(`phase32_source_chain_rejected:${sharedIssues.join(",")}`);
  process.exit(1);
}

const dockerVersion = spawnSync("docker", ["compose", "version"], { encoding: "utf8" });
if (dockerVersion.status !== 0) {
  console.error("isolated_pg17_runtime_unavailable:docker_compose_required");
  process.exit(1);
}

const compose = (args, options = {}) => spawnSync(
  "docker",
  ["compose", "-f", composeFile, ...args],
  { cwd: root, encoding: "utf8", ...options }
);
const assertCommand = (result, code) => {
  if (result.status !== 0) throw new Error(`${code}:${(result.stderr || result.stdout || "unknown").trim().slice(0, 1200)}`);
  return result;
};
const executeSql = (content, code) => assertCommand(compose([
  "exec", "-T", "-e", `PGPASSWORD=${ephemeralPassword}`, "-e", `PGOPTIONS=${pgOptions}`,
  "postgres", "psql", "-U", gate.runtime.user, "-d", gate.runtime.database,
  "-v", "ON_ERROR_STOP=1", "-f", "-"
], { input: content }), code);
const queryScalar = (query, code) => assertCommand(compose([
  "exec", "-T", "-e", `PGPASSWORD=${ephemeralPassword}`,
  "postgres", "psql", "-U", gate.runtime.user, "-d", gate.runtime.database,
  "-v", "ON_ERROR_STOP=1", "-tA", "-c", query
]), code).stdout.trim();

const evidence = {
  schemaVersion: "phase32.pg17-compatibility-evidence.v1",
  phase: 32,
  runId: randomUUID(),
  startedAt,
  finishedAt: null,
  status: "failed",
  environment: gate.environment,
  sourceReference: {
    phase30EvidenceFingerprint: sha256(sourceEvidence.raw),
    phase31ReceiptFingerprint: sha256(sourceReceipt.raw),
    sharedArtifactFingerprintsMatched: true
  },
  runtime: {
    engineDetected: true,
    engine: gate.runtime.engine,
    databaseHealthy: false,
    imageReference: gate.runtime.postgresImage,
    imageFingerprint: null,
    targetFingerprint: sha256(`${gate.runtime.host}:${gate.runtime.port}/${gate.runtime.database}`),
    postgresVersion: null,
    currentUser: null
  },
  artifactFingerprints,
  eventSequence: [],
  compatibility: {
    blockedExtensionsDetected: [],
    freshVolumeProven: false,
    pg17Verified: false
  },
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
    sourceEvidenceProven: true,
    isolatedRuntimeProven: false,
    pg17CompatibilityApproved: false,
    securityRehearsalApproved: false,
    rollbackRehearsalApproved: false,
    cleanupApproved: false
  },
  databaseTouched: false,
  remoteDatabaseTouched: false,
  metaTouched: false,
  buildExecuted: false
};
const recordEvent = (event) => evidence.eventSequence.push({ event, at: new Date().toISOString() });
recordEvent("source_evidence_verified");

let failure;
try {
  assertCommand(compose(["down", "--volumes", "--remove-orphans"]), "phase32_initial_cleanup_failed");
  evidence.compatibility.freshVolumeProven = true;
  assertCommand(compose(["up", "-d", "--wait"]), "phase32_runtime_start_failed");
  recordEvent("runtime_started");
  evidence.runtime.databaseHealthy = true;
  evidence.databaseTouched = true;

  const image = assertCommand(spawnSync("docker", ["image", "inspect", gate.runtime.postgresImage, "--format", "{{.Id}}"], { encoding: "utf8" }), "phase32_image_inspection_failed");
  evidence.runtime.imageFingerprint = sha256(image.stdout.trim());
  evidence.runtime.postgresVersion = queryScalar("show server_version", "phase32_postgres_version_failed");
  evidence.runtime.currentUser = queryScalar("select current_user", "phase32_current_user_failed");

  executeSql(read(gate.requiredArtifacts.baseline), "phase32_baseline_failed");
  evidence.rehearsal.baselineApplied = true;
  recordEvent("baseline_applied");
  executeSql(read(gate.requiredArtifacts.migration), "phase32_migration_failed");
  evidence.rehearsal.migrationApplied = true;
  recordEvent("migration_applied");
  executeSql(read(gate.requiredArtifacts.pg17Verification), "phase32_pg17_compatibility_failed");
  evidence.compatibility.pg17Verified = true;
  recordEvent("pg17_compatibility_verified");
  evidence.compatibility.blockedExtensionsDetected = queryScalar(
    "select coalesce(string_agg(extname, ',' order by extname), '') from pg_extension where extname in ('timescaledb','plv8','plcoffee','plls')",
    "phase32_extension_inventory_failed"
  ).split(",").filter(Boolean);
  if (evidence.compatibility.blockedExtensionsDetected.length) throw new Error("phase32_incompatible_extension_detected");

  executeSql(read(gate.requiredArtifacts.securityVerification), "phase32_security_verification_failed");
  evidence.rehearsal.securityVerified = true;
  recordEvent("security_verified");
  evidence.rehearsal.rollbackAttempted = true;
  recordEvent("rollback_started");
  executeSql(read(gate.requiredArtifacts.rollback), "phase32_rollback_failed");
  executeSql(read(gate.requiredArtifacts.cleanupVerification), "phase32_cleanup_verification_failed");
  evidence.rehearsal.rollbackApproved = true;
  evidence.rehearsal.finalLedgerObjectsAbsent = true;
  recordEvent("rollback_verified");
} catch (error) {
  failure = error;
} finally {
  const cleanup = compose(["down", "--volumes", "--remove-orphans"]);
  evidence.rehearsal.volumesDestroyed = cleanup.status === 0;
  if (cleanup.status === 0) recordEvent("runtime_destroyed");
  if (cleanup.status !== 0 && !failure) failure = new Error(`phase32_final_cleanup_failed:${(cleanup.stderr || cleanup.stdout || "unknown").trim().slice(0, 1200)}`);
}

evidence.finishedAt = new Date().toISOString();
if (!failure) {
  evidence.status = "approved";
  evidence.releaseGates.isolatedRuntimeProven = true;
  evidence.releaseGates.pg17CompatibilityApproved = true;
  evidence.releaseGates.securityRehearsalApproved = true;
  evidence.releaseGates.rollbackRehearsalApproved = true;
  evidence.releaseGates.cleanupApproved = true;
}
mkdirSync(dirname(targetEvidenceFile), { recursive: true });
writeFileSync(targetEvidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
if (failure) {
  console.error(failure.message);
  process.exit(1);
}
console.log(JSON.stringify({
  status: evidence.status,
  evidenceFile: targetEvidenceFile.slice(root.length + 1),
  postgresVersion: evidence.runtime.postgresVersion,
  currentUser: evidence.runtime.currentUser,
  freshVolumeProven: evidence.compatibility.freshVolumeProven,
  permitReservationExecuted: evidence.rehearsal.permitReservationExecuted,
  remoteDatabaseTouched: evidence.remoteDatabaseTouched,
  metaTouched: evidence.metaTouched,
  volumesDestroyed: evidence.rehearsal.volumesDestroyed,
  buildExecuted: evidence.buildExecuted
}, null, 2));
