import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { preparePhase39StagingReplayContract } from "./preflight-meta-repeatability-sample-02-isolated-staging-replay-contract.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const gate = JSON.parse(readFileSync(resolve(root, "config/meta-repeatability-sample-02-isolated-staging-replay-contract-gate.json"), "utf8"));
const projectionInput = process.env.ATLAS_PHASE38_READINESS_PROJECTION_FILE;
const targetInput = process.env.ATLAS_PHASE39_STAGING_TARGET_MANIFEST_FILE;
const rollbackInput = process.env.ATLAS_PHASE39_ROLLBACK_PLAN_FILE;
const approvalInput = process.env.ATLAS_PHASE39_CONTRACT_APPROVAL_FILE;
const outputInput = process.env.ATLAS_PHASE39_STAGING_REPLAY_CONTRACT_FILE ?? "artifacts/meta-phase39-isolated-staging-replay-contract.json";
const withinWorkspace = (file) => file === root || file.startsWith(`${root}${sep}`);
const resolveWorkspaceFile = (input) => isAbsolute(input) ? resolve(input) : resolve(root, input);

if (!projectionInput || !targetInput || !rollbackInput || !approvalInput) {
  console.error("phase39_projection_target_rollback_and_approval_paths_required");
  process.exit(1);
}

const sourceFiles = [projectionInput, targetInput, rollbackInput, approvalInput].map(resolveWorkspaceFile);
const outputFile = resolveWorkspaceFile(outputInput);
if ([...sourceFiles, outputFile].some((file) => !withinWorkspace(file))) {
  console.error("phase39_path_outside_workspace");
  process.exit(1);
}
for (const file of sourceFiles) {
  if (!existsSync(file) || lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile()
    || lstatSync(file).size > gate.maximumInputBytes || !withinWorkspace(realpathSync(file))) {
    console.error("phase39_source_file_unsafe");
    process.exit(1);
  }
  if ((lstatSync(file).mode & 0o077) !== 0) {
    console.error("phase39_source_receipt_permissions_too_open");
    process.exit(1);
  }
}
if (existsSync(outputFile) && lstatSync(outputFile).isSymbolicLink()) {
  console.error("phase39_output_symlink_rejected");
  process.exit(1);
}

const raw = sourceFiles.map((file) => readFileSync(file, "utf8"));
let parsed;
try {
  parsed = raw.map((value) => JSON.parse(value));
} catch {
  console.error("phase39_source_json_invalid");
  process.exit(1);
}

const contract = preparePhase39StagingReplayContract({
  projection: parsed[0], stagingTarget: parsed[1], rollbackPlan: parsed[2], humanApproval: parsed[3],
  rawProjection: raw[0], rawStagingTarget: raw[1], rawRollbackPlan: raw[2], rawHumanApproval: raw[3]
});
if (!contract.contractPrepared) {
  console.error(`phase39_contract_rejected:${contract.issues.join(",")}`);
  process.exit(1);
}

delete contract.issues;
mkdirSync(dirname(outputFile), { recursive: true });
if (!withinWorkspace(realpathSync(dirname(outputFile)))) {
  console.error("phase39_output_parent_unsafe");
  process.exit(1);
}
writeFileSync(outputFile, `${JSON.stringify(contract, null, 2)}\n`, { mode: 0o600 });
chmodSync(outputFile, 0o600);
console.log(JSON.stringify({
  status: contract.status,
  outputFile: outputFile.slice(root.length + 1),
  contractPrepared: contract.contractPrepared,
  sourceProjectionAccepted: contract.sourceProjectionAccepted,
  stagingTargetAccepted: contract.stagingTargetAccepted,
  rollbackPlanAccepted: contract.rollbackPlanAccepted,
  humanApprovalAccepted: contract.humanApprovalAccepted,
  replayExecuted: contract.replayExecuted,
  replayExecutionAllowed: contract.releaseGates.replayExecutionAllowed,
  stagingMigrationAllowed: contract.releaseGates.stagingMigrationAllowed,
  productionMigrationAllowed: contract.releaseGates.productionMigrationAllowed,
  remoteDatabaseTouched: contract.remoteDatabaseTouched,
  metaTouched: contract.metaTouched,
  buildExecuted: contract.buildExecuted
}, null, 2));
