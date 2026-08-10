import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { preparePhase42EphemeralStagingReplaySupervisor } from "./preflight-meta-repeatability-sample-02-ephemeral-staging-replay-supervisor.mjs";

const workspace = realpathSync(process.cwd());
const adapterInput = process.env.ATLAS_PHASE42_REPLAY_ADAPTER_FILE;
const validationInput = process.env.ATLAS_PHASE42_FINAL_HUMAN_VALIDATION_FILE;
const outputInput = process.env.ATLAS_PHASE42_SUPERVISOR_FILE ?? "artifacts/meta-phase42-ephemeral-staging-replay-supervisor.json";
const maximumBytes = 1048576;

if (!adapterInput || !validationInput) {
  console.error("phase42_adapter_and_final_human_validation_required");
  process.exit(2);
}

const resolveWorkspaceFile = (value) => resolve(workspace, value);
const insideWorkspace = (value) => {
  const rel = relative(workspace, value);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};
const sourceFiles = [adapterInput, validationInput].map(resolveWorkspaceFile);
if (sourceFiles.some((file) => !insideWorkspace(file))) {
  console.error("phase42_path_outside_workspace");
  process.exit(2);
}
for (const file of sourceFiles) {
  if (!existsSync(file) || lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile() || lstatSync(file).size > maximumBytes) {
    console.error("phase42_source_file_unsafe");
    process.exit(2);
  }
  if ((lstatSync(file).mode & 0o077) !== 0) {
    console.error("phase42_source_receipt_permissions_too_open");
    process.exit(2);
  }
}

const outputFile = resolveWorkspaceFile(outputInput);
if (!insideWorkspace(outputFile)) {
  console.error("phase42_output_path_outside_workspace");
  process.exit(2);
}
if (existsSync(outputFile) && lstatSync(outputFile).isSymbolicLink()) {
  console.error("phase42_output_symlink_rejected");
  process.exit(2);
}

let rawOneTimeReplayAdapter;
let rawFinalHumanValidation;
let oneTimeReplayAdapter;
let finalHumanValidation;
try {
  rawOneTimeReplayAdapter = readFileSync(sourceFiles[0], "utf8");
  rawFinalHumanValidation = readFileSync(sourceFiles[1], "utf8");
  oneTimeReplayAdapter = JSON.parse(rawOneTimeReplayAdapter);
  finalHumanValidation = JSON.parse(rawFinalHumanValidation);
} catch {
  console.error("phase42_source_json_invalid");
  process.exit(2);
}

const supervisor = preparePhase42EphemeralStagingReplaySupervisor({
  oneTimeReplayAdapter,
  rawOneTimeReplayAdapter,
  finalHumanValidation,
  rawFinalHumanValidation
});
if (!supervisor.supervisorPrepared) {
  console.error(`phase42_supervisor_rejected:${supervisor.issues.join(",")}`);
  process.exit(3);
}

const serialized = `${JSON.stringify(supervisor, null, 2)}\n`;
if (/(postgres(?:ql)?:\/\/|bearer\s+[a-z0-9._~-]+|supabase\s+db\s+(?:push|reset)|--linked|"(?:password|secret|token|apiKey|serviceRole|nonceValue|rawNonce|command|shell|projectRef)"\s*:)/i.test(serialized)) {
  console.error("phase42_sensitive_persistence_guard_triggered");
  process.exit(3);
}

const parent = dirname(outputFile);
if (!insideWorkspace(parent)) {
  console.error("phase42_output_parent_unsafe");
  process.exit(2);
}
mkdirSync(parent, { recursive: true, mode: 0o700 });
writeFileSync(outputFile, serialized, { mode: 0o600, flag: "wx" });
chmodSync(outputFile, 0o600);

console.log(JSON.stringify({
  phase: supervisor.phase,
  status: supervisor.status,
  supervisorPrepared: supervisor.supervisorPrepared,
  currentState: supervisor.currentState,
  transitionCount: supervisor.transitionPlan.length,
  stopOnError: supervisor.stopOnError,
  rollbackRequiredAfterFailure: supervisor.rollbackRequiredAfterFailure,
  targetDestructionRequired: supervisor.targetDestructionRequired,
  executionPermitConsumed: supervisor.executionPermitConsumed,
  oneTimeExecutionNonceConsumed: supervisor.oneTimeExecutionNonceConsumed,
  supervisorStarted: supervisor.supervisorStarted,
  adapterExecuted: supervisor.adapterExecuted,
  replayExecuted: supervisor.replayExecuted,
  blockedReason: supervisor.blockedReason,
  databaseTouched: supervisor.databaseTouched,
  networkTouched: supervisor.networkTouched,
  processSpawned: supervisor.processSpawned,
  remoteDatabaseTouched: supervisor.remoteDatabaseTouched,
  stagingTouched: supervisor.stagingTouched,
  productionTouched: supervisor.productionTouched,
  metaTouched: supervisor.metaTouched,
  buildExecuted: supervisor.buildExecuted,
  outputFile: relative(workspace, outputFile)
}, null, 2));
