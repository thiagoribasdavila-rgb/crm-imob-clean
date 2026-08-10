import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluatePhase35RestoreRehearsalContract } from "./preflight-meta-repeatability-sample-02-isolated-restore-rehearsal.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const maximumInputBytes = 1024 * 1024;
const readinessInput = process.env.ATLAS_PHASE34_READINESS_FILE;
const backupInput = process.env.ATLAS_PHASE35_BACKUP_MANIFEST_FILE;
const outputInput = process.env.ATLAS_PHASE35_REHEARSAL_CONTRACT_FILE ?? "artifacts/meta-phase35-restore-rehearsal-contract.json";
const withinWorkspace = (file) => file === root || file.startsWith(`${root}${sep}`);
const resolveWorkspaceFile = (input) => isAbsolute(input) ? resolve(input) : resolve(root, input);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

if (!readinessInput || !backupInput) {
  console.error("phase35_source_readiness_and_backup_manifest_paths_required");
  process.exit(1);
}

const sourceFiles = [resolveWorkspaceFile(readinessInput), resolveWorkspaceFile(backupInput)];
const outputFile = resolveWorkspaceFile(outputInput);
if (sourceFiles.some((file) => !withinWorkspace(file)) || !withinWorkspace(outputFile)) {
  console.error("phase35_path_outside_workspace");
  process.exit(1);
}
for (const file of sourceFiles) {
  if (!existsSync(file) || lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile()) {
    console.error("phase35_source_file_invalid");
    process.exit(1);
  }
  if (lstatSync(file).size > maximumInputBytes || !withinWorkspace(realpathSync(file))) {
    console.error("phase35_source_file_unsafe");
    process.exit(1);
  }
}
if (existsSync(outputFile) && lstatSync(outputFile).isSymbolicLink()) {
  console.error("phase35_output_symlink_rejected");
  process.exit(1);
}

const [rawReadiness, rawBackup] = sourceFiles.map((file) => readFileSync(file, "utf8"));
let readinessReceipt;
let backupManifest;
try {
  readinessReceipt = JSON.parse(rawReadiness);
  backupManifest = JSON.parse(rawBackup);
} catch {
  console.error("phase35_source_json_invalid");
  process.exit(1);
}

const evaluation = evaluatePhase35RestoreRehearsalContract(readinessReceipt, backupManifest);
if (!evaluation.sourcesApproved) {
  console.error(`phase35_restore_rehearsal_sources_rejected:${[...evaluation.readinessIssues, ...evaluation.backupIssues].join(",")}`);
  process.exit(1);
}

const contract = {
  schemaVersion: "phase35.restore-rehearsal-contract.v1",
  phase: 35,
  sourcePhase: 34,
  status: "contract_prepared_execution_blocked",
  preparedAt: new Date().toISOString(),
  sourceReadinessFingerprint: sha256(rawReadiness),
  backupManifestFingerprint: sha256(rawBackup),
  backupEvidenceAccepted: true,
  restorePlan: evaluation.restorePlan,
  restoreExecuted: false,
  restoreExecutionAllowed: false,
  stagingMigrationAllowed: false,
  productionMigrationAllowed: false,
  productionCompatibilityApproved: false,
  nextRequiredAction: "phase36_require_explicit_human_approval_and_ephemeral_runtime",
  remoteDatabaseTouched: false,
  metaTouched: false,
  buildExecuted: false
};

mkdirSync(dirname(outputFile), { recursive: true });
if (!withinWorkspace(realpathSync(dirname(outputFile)))) {
  console.error("phase35_output_parent_unsafe");
  process.exit(1);
}
writeFileSync(outputFile, `${JSON.stringify(contract, null, 2)}\n`, { mode: 0o600 });
chmodSync(outputFile, 0o600);
console.log(JSON.stringify({
  status: contract.status,
  contractFile: outputFile.slice(root.length + 1),
  backupEvidenceAccepted: true,
  restoreExecuted: false,
  restoreExecutionAllowed: false,
  stagingMigrationAllowed: false,
  productionMigrationAllowed: false
}, null, 2));
