import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluatePhase34MigrationReadiness } from "./preflight-meta-repeatability-sample-02-migration-readiness.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const maximumInputBytes = 1024 * 1024;
const sourceInput = process.env.ATLAS_PHASE33_RECONCILIATION_FILE;
const outputInput = process.env.ATLAS_PHASE34_READINESS_FILE ?? "artifacts/meta-phase34-migration-readiness.json";
const withinWorkspace = (file) => file === root || file.startsWith(`${root}${sep}`);
const resolveWorkspaceFile = (input) => isAbsolute(input) ? resolve(input) : resolve(root, input);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

if (!sourceInput) {
  console.error("phase34_source_reconciliation_path_required");
  process.exit(1);
}

const sourceFile = resolveWorkspaceFile(sourceInput);
const outputFile = resolveWorkspaceFile(outputInput);
if (!withinWorkspace(sourceFile) || !withinWorkspace(outputFile)) {
  console.error("phase34_path_outside_workspace");
  process.exit(1);
}
if (!existsSync(sourceFile) || lstatSync(sourceFile).isSymbolicLink() || !lstatSync(sourceFile).isFile()) {
  console.error("phase34_source_reconciliation_file_invalid");
  process.exit(1);
}
if (lstatSync(sourceFile).size > maximumInputBytes || !withinWorkspace(realpathSync(sourceFile))) {
  console.error("phase34_source_reconciliation_file_unsafe");
  process.exit(1);
}
if (existsSync(outputFile) && lstatSync(outputFile).isSymbolicLink()) {
  console.error("phase34_output_symlink_rejected");
  process.exit(1);
}

const rawSource = readFileSync(sourceFile, "utf8");
let sourceReceipt;
try {
  sourceReceipt = JSON.parse(rawSource);
} catch {
  console.error("phase34_source_reconciliation_json_invalid");
  process.exit(1);
}

const readiness = evaluatePhase34MigrationReadiness(sourceReceipt);
if (!readiness.sourceApproved) {
  console.error(`phase34_source_reconciliation_rejected:${readiness.issues.join(",")}`);
  process.exit(1);
}

const assessment = {
  schemaVersion: "phase34.migration-readiness.v1",
  phase: 34,
  sourcePhase: 33,
  status: "assessment_complete_blocked",
  assessedAt: new Date().toISOString(),
  sourceReceiptFingerprint: sha256(rawSource),
  sourceReceiptAccepted: true,
  controls: readiness.controls,
  evidenceCoverage: readiness.evidenceCoverage,
  stagingMigrationAllowed: false,
  productionMigrationAllowed: false,
  productionCompatibilityApproved: false,
  nextRequiredAction: "prepare_phase35_isolated_staging_restore_rehearsal",
  remoteDatabaseTouched: false,
  metaTouched: false,
  buildExecuted: false
};

mkdirSync(dirname(outputFile), { recursive: true });
if (!withinWorkspace(realpathSync(dirname(outputFile)))) {
  console.error("phase34_output_parent_unsafe");
  process.exit(1);
}
writeFileSync(outputFile, `${JSON.stringify(assessment, null, 2)}\n`, { mode: 0o600 });
chmodSync(outputFile, 0o600);
console.log(JSON.stringify({
  status: assessment.status,
  readinessFile: outputFile.slice(root.length + 1),
  evidenceCoverage: assessment.evidenceCoverage,
  stagingMigrationAllowed: false,
  productionMigrationAllowed: false
}, null, 2));
