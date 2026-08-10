import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { projectPhase38Readiness } from "./preflight-meta-repeatability-sample-02-readiness-evidence-projection.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const gate = JSON.parse(readFileSync(resolve(root, "config/meta-repeatability-sample-02-readiness-evidence-projection-gate.json"), "utf8"));
const readinessInput = process.env.ATLAS_PHASE34_READINESS_FILE;
const contractInput = process.env.ATLAS_PHASE35_REHEARSAL_CONTRACT_FILE;
const reconciliationInput = process.env.ATLAS_PHASE37_RECONCILIATION_FILE;
const outputInput = process.env.ATLAS_PHASE38_READINESS_PROJECTION_FILE ?? "artifacts/meta-phase38-readiness-evidence-projection.json";
const withinWorkspace = (file) => file === root || file.startsWith(`${root}${sep}`);
const resolveWorkspaceFile = (input) => isAbsolute(input) ? resolve(input) : resolve(root, input);

if (!readinessInput || !contractInput || !reconciliationInput) {
  console.error("phase38_readiness_contract_and_reconciliation_paths_required");
  process.exit(1);
}

const readinessFile = resolveWorkspaceFile(readinessInput);
const contractFile = resolveWorkspaceFile(contractInput);
const reconciliationFile = resolveWorkspaceFile(reconciliationInput);
const outputFile = resolveWorkspaceFile(outputInput);
if ([readinessFile, contractFile, reconciliationFile, outputFile].some((file) => !withinWorkspace(file))) {
  console.error("phase38_path_outside_workspace");
  process.exit(1);
}
for (const file of [readinessFile, contractFile, reconciliationFile]) {
  if (!existsSync(file) || lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile()
    || lstatSync(file).size > gate.maximumInputBytes || !withinWorkspace(realpathSync(file))) {
    console.error("phase38_source_file_unsafe");
    process.exit(1);
  }
  if ((lstatSync(file).mode & 0o077) !== 0) {
    console.error("phase38_source_receipt_permissions_too_open");
    process.exit(1);
  }
}
if (existsSync(outputFile) && lstatSync(outputFile).isSymbolicLink()) {
  console.error("phase38_output_symlink_rejected");
  process.exit(1);
}

const rawReadiness = readFileSync(readinessFile, "utf8");
const rawSourceContract = readFileSync(contractFile, "utf8");
const rawReconciliation = readFileSync(reconciliationFile, "utf8");
let readiness;
let sourceContract;
let reconciliation;
try {
  readiness = JSON.parse(rawReadiness);
  sourceContract = JSON.parse(rawSourceContract);
  reconciliation = JSON.parse(rawReconciliation);
} catch {
  console.error("phase38_source_json_invalid");
  process.exit(1);
}

const projection = projectPhase38Readiness({
  readiness,
  sourceContract,
  reconciliation,
  rawReadiness,
  rawSourceContract,
  rawReconciliation
});
if (!projection.projectionApproved) {
  console.error(`phase38_projection_rejected:${projection.issues.join(",")}`);
  process.exit(1);
}

delete projection.issues;
mkdirSync(dirname(outputFile), { recursive: true });
if (!withinWorkspace(realpathSync(dirname(outputFile)))) {
  console.error("phase38_output_parent_unsafe");
  process.exit(1);
}
writeFileSync(outputFile, `${JSON.stringify(projection, null, 2)}\n`, { mode: 0o600 });
chmodSync(outputFile, 0o600);
console.log(JSON.stringify({
  status: projection.status,
  outputFile: outputFile.slice(root.length + 1),
  projectionApproved: projection.projectionApproved,
  promotedControls: projection.promotedControls,
  evidenceCoverage: projection.evidenceCoverage,
  remainingBlockedControls: projection.remainingBlockedControls,
  stagingMigrationAllowed: projection.releaseGates.stagingMigrationAllowed,
  productionMigrationAllowed: projection.releaseGates.productionMigrationAllowed,
  remoteDatabaseTouched: projection.remoteDatabaseTouched,
  metaTouched: projection.metaTouched,
  buildExecuted: projection.buildExecuted
}, null, 2));
