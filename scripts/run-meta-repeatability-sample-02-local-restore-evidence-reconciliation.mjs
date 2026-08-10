import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { reconcilePhase37RestoreEvidence } from "./preflight-meta-repeatability-sample-02-local-restore-evidence-reconciliation.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const gate = JSON.parse(readFileSync(resolve(root, "config/meta-repeatability-sample-02-local-restore-evidence-reconciliation-gate.json"), "utf8"));
const evidenceInput = process.env.ATLAS_PHASE36_RESTORE_EVIDENCE_FILE;
const contractInput = process.env.ATLAS_PHASE35_REHEARSAL_CONTRACT_FILE;
const manifestInput = process.env.ATLAS_PHASE35_BACKUP_MANIFEST_FILE;
const outputInput = process.env.ATLAS_PHASE37_RECONCILIATION_FILE ?? "artifacts/meta-phase37-local-restore-reconciliation.json";
const withinWorkspace = (file) => file === root || file.startsWith(`${root}${sep}`);
const resolveWorkspaceFile = (input) => isAbsolute(input) ? resolve(input) : resolve(root, input);

if (!evidenceInput || !contractInput || !manifestInput) {
  console.error("phase37_evidence_contract_and_manifest_paths_required");
  process.exit(1);
}

const evidenceFile = resolveWorkspaceFile(evidenceInput);
const contractFile = resolveWorkspaceFile(contractInput);
const manifestFile = resolveWorkspaceFile(manifestInput);
const outputFile = resolveWorkspaceFile(outputInput);
if ([evidenceFile, contractFile, manifestFile, outputFile].some((file) => !withinWorkspace(file))) {
  console.error("phase37_path_outside_workspace");
  process.exit(1);
}
for (const file of [evidenceFile, contractFile, manifestFile]) {
  if (!existsSync(file) || lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile()
    || lstatSync(file).size > gate.maximumInputBytes || !withinWorkspace(realpathSync(file))) {
    console.error("phase37_source_file_unsafe");
    process.exit(1);
  }
}
if ((lstatSync(evidenceFile).mode & 0o077) !== 0) {
  console.error("phase37_restore_evidence_permissions_too_open");
  process.exit(1);
}
if (existsSync(outputFile) && lstatSync(outputFile).isSymbolicLink()) {
  console.error("phase37_output_symlink_rejected");
  process.exit(1);
}

const rawEvidence = readFileSync(evidenceFile, "utf8");
const rawSourceContract = readFileSync(contractFile, "utf8");
const rawBackupManifest = readFileSync(manifestFile, "utf8");
let evidence;
let sourceContract;
let backupManifest;
try {
  evidence = JSON.parse(rawEvidence);
  sourceContract = JSON.parse(rawSourceContract);
  backupManifest = JSON.parse(rawBackupManifest);
} catch {
  console.error("phase37_source_json_invalid");
  process.exit(1);
}

const receipt = reconcilePhase37RestoreEvidence({
  evidence,
  sourceContract,
  backupManifest,
  rawEvidence,
  rawSourceContract,
  rawBackupManifest
});
if (!receipt.sourceEvidenceAccepted) {
  console.error(`phase37_reconciliation_rejected:${receipt.issues.join(",")}`);
  process.exit(1);
}

delete receipt.issues;
mkdirSync(dirname(outputFile), { recursive: true });
if (!withinWorkspace(realpathSync(dirname(outputFile)))) {
  console.error("phase37_output_parent_unsafe");
  process.exit(1);
}
writeFileSync(outputFile, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
chmodSync(outputFile, 0o600);
console.log(JSON.stringify({
  status: receipt.status,
  outputFile: outputFile.slice(root.length + 1),
  sourceEvidenceAccepted: receipt.sourceEvidenceAccepted,
  localRestoreHomologated: receipt.localRestoreHomologated,
  stagingMigrationAllowed: receipt.releaseGates.stagingMigrationAllowed,
  productionMigrationAllowed: receipt.releaseGates.productionMigrationAllowed,
  databaseTouched: receipt.databaseTouched,
  remoteDatabaseTouched: receipt.remoteDatabaseTouched,
  metaTouched: receipt.metaTouched,
  buildExecuted: receipt.buildExecuted
}, null, 2));
