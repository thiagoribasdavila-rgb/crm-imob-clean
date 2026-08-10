import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { preparePhase43AtomicReplayExecutionPermit } from "./preflight-meta-repeatability-sample-02-atomic-replay-execution-permit.mjs";

const workspace = realpathSync(process.cwd());
const supervisorInput = process.env.ATLAS_PHASE43_SUPERVISOR_FILE;
const workerInput = process.env.ATLAS_PHASE43_WORKER_ATTESTATION_FILE;
const authorizationInput = process.env.ATLAS_PHASE43_HUMAN_AUTHORIZATION_FILE;
const outputInput = process.env.ATLAS_PHASE43_ATOMIC_PERMIT_FILE
  ?? "artifacts/meta-phase43-atomic-staging-replay-execution-permit.json";
const maximumBytes = 1048576;

if (!supervisorInput || !workerInput || !authorizationInput) {
  console.error("phase43_supervisor_worker_attestation_and_human_authorization_required");
  process.exit(2);
}

const resolveWorkspaceFile = (value) => resolve(workspace, value);
const insideWorkspace = (value) => {
  const rel = relative(workspace, value);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};
const sourceFiles = [supervisorInput, workerInput, authorizationInput].map(resolveWorkspaceFile);
if (sourceFiles.some((file) => !insideWorkspace(file))) {
  console.error("phase43_path_outside_workspace");
  process.exit(2);
}
for (const file of sourceFiles) {
  if (!existsSync(file) || lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile() || lstatSync(file).size > maximumBytes) {
    console.error("phase43_source_file_unsafe");
    process.exit(2);
  }
  if ((lstatSync(file).mode & 0o077) !== 0) {
    console.error("phase43_source_receipt_permissions_too_open");
    process.exit(2);
  }
}

const outputFile = resolveWorkspaceFile(outputInput);
if (!insideWorkspace(outputFile)) {
  console.error("phase43_output_path_outside_workspace");
  process.exit(2);
}
if (existsSync(outputFile) && lstatSync(outputFile).isSymbolicLink()) {
  console.error("phase43_output_symlink_rejected");
  process.exit(2);
}

let rawEphemeralReplaySupervisor;
let rawReviewedRuntimeWorkerAttestation;
let rawImmediateHumanAuthorization;
let ephemeralReplaySupervisor;
let reviewedRuntimeWorkerAttestation;
let immediateHumanAuthorization;
try {
  rawEphemeralReplaySupervisor = readFileSync(sourceFiles[0], "utf8");
  rawReviewedRuntimeWorkerAttestation = readFileSync(sourceFiles[1], "utf8");
  rawImmediateHumanAuthorization = readFileSync(sourceFiles[2], "utf8");
  ephemeralReplaySupervisor = JSON.parse(rawEphemeralReplaySupervisor);
  reviewedRuntimeWorkerAttestation = JSON.parse(rawReviewedRuntimeWorkerAttestation);
  immediateHumanAuthorization = JSON.parse(rawImmediateHumanAuthorization);
} catch {
  console.error("phase43_source_json_invalid");
  process.exit(2);
}

const permit = preparePhase43AtomicReplayExecutionPermit({
  ephemeralReplaySupervisor,
  rawEphemeralReplaySupervisor,
  reviewedRuntimeWorkerAttestation,
  rawReviewedRuntimeWorkerAttestation,
  immediateHumanAuthorization,
  rawImmediateHumanAuthorization
});
if (!permit.atomicExecutionPermitPrepared) {
  console.error(`phase43_atomic_permit_rejected:${permit.issues.join(",")}`);
  process.exit(3);
}

const serialized = `${JSON.stringify(permit, null, 2)}\n`;
if (/(postgres(?:ql)?:\/\/|https?:\/\/|bearer\s+[a-z0-9._~-]+|supabase\s+db\s+(?:push|reset)|--linked|"(?:password|secret|bearerToken|accessToken|refreshToken|authorizationHeader|databaseUrl|connectionString|apiKey|accessKey|serviceRole|credentialValue|nonceValue|rawNonce|permitValue|rawPermit|rawSession|jwt|command|shell|projectRef|records|rows)"\s*:)/i.test(serialized)) {
  console.error("phase43_sensitive_persistence_guard_triggered");
  process.exit(3);
}

const parent = dirname(outputFile);
if (!insideWorkspace(parent)) {
  console.error("phase43_output_parent_unsafe");
  process.exit(2);
}
mkdirSync(parent, { recursive: true, mode: 0o700 });
writeFileSync(outputFile, serialized, { mode: 0o600, flag: "wx" });
chmodSync(outputFile, 0o600);

console.log(JSON.stringify({
  phase: permit.phase,
  status: permit.status,
  atomicExecutionPermitPrepared: permit.atomicExecutionPermitPrepared,
  currentState: permit.currentState,
  consumptionState: permit.consumptionState,
  consumptionVersion: permit.consumptionVersion,
  maximumConsumptionCount: permit.maximumConsumptionCount,
  atomicCompareAndSwapRequired: permit.atomicCompareAndSwapRequired,
  allOrNothingReservationRequired: permit.allOrNothingReservationRequired,
  executionPermitAvailable: permit.executionPermitAvailable,
  executionPermitConsumed: permit.executionPermitConsumed,
  oneTimeExecutionNonceConsumed: permit.oneTimeExecutionNonceConsumed,
  supervisorStarted: permit.supervisorStarted,
  adapterExecuted: permit.adapterExecuted,
  replayExecuted: permit.replayExecuted,
  blockedReason: permit.blockedReason,
  databaseTouched: permit.databaseTouched,
  networkTouched: permit.networkTouched,
  processSpawned: permit.processSpawned,
  remoteDatabaseTouched: permit.remoteDatabaseTouched,
  stagingTouched: permit.stagingTouched,
  productionTouched: permit.productionTouched,
  metaTouched: permit.metaTouched,
  buildExecuted: permit.buildExecuted,
  outputFile: relative(workspace, outputFile)
}, null, 2));
