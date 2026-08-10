import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { preparePhase44AtomicConsumerWorker } from "./preflight-meta-repeatability-sample-02-atomic-consumer-worker.mjs";

const workspace = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const permitInput = process.env.ATLAS_PHASE44_ATOMIC_PERMIT_RECEIPT;
const attestationInput = process.env.ATLAS_PHASE44_CONSUMER_WORKER_ATTESTATION;
const authorizationInput = process.env.ATLAS_PHASE44_HUMAN_AUTHORIZATION;
const outputInput = process.env.ATLAS_PHASE44_OUTPUT;
const maximumBytes = 1048576;

if (!permitInput || !attestationInput || !authorizationInput || !outputInput) {
  console.error("phase44_permit_consumer_attestation_and_human_authorization_required");
  process.exit(2);
}

const resolveWorkspaceFile = (value) => isAbsolute(value) ? resolve(value) : resolve(workspace, value);
const insideWorkspace = (value) => {
  const rel = relative(workspace, value);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};
const sourceFiles = [permitInput, attestationInput, authorizationInput].map(resolveWorkspaceFile);
if (sourceFiles.some((file) => !insideWorkspace(file))) {
  console.error("phase44_path_outside_workspace");
  process.exit(2);
}
for (const file of sourceFiles) {
  if (!existsSync(file) || lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile() || lstatSync(file).size > maximumBytes) {
    console.error("phase44_source_file_unsafe");
    process.exit(2);
  }
  if ((lstatSync(file).mode & 0o077) !== 0) {
    console.error("phase44_source_receipt_permissions_too_open");
    process.exit(2);
  }
}

const outputFile = resolveWorkspaceFile(outputInput);
if (!insideWorkspace(outputFile)) {
  console.error("phase44_output_path_outside_workspace");
  process.exit(2);
}
if (existsSync(outputFile) && lstatSync(outputFile).isSymbolicLink()) {
  console.error("phase44_output_symlink_rejected");
  process.exit(2);
}

let rawAtomicReplayExecutionPermit;
let rawReviewedAtomicConsumerWorkerAttestation;
let rawImmediateHumanAuthorization;
let atomicReplayExecutionPermit;
let reviewedAtomicConsumerWorkerAttestation;
let immediateHumanAuthorization;
try {
  rawAtomicReplayExecutionPermit = readFileSync(sourceFiles[0], "utf8");
  rawReviewedAtomicConsumerWorkerAttestation = readFileSync(sourceFiles[1], "utf8");
  rawImmediateHumanAuthorization = readFileSync(sourceFiles[2], "utf8");
  atomicReplayExecutionPermit = JSON.parse(rawAtomicReplayExecutionPermit);
  reviewedAtomicConsumerWorkerAttestation = JSON.parse(rawReviewedAtomicConsumerWorkerAttestation);
  immediateHumanAuthorization = JSON.parse(rawImmediateHumanAuthorization);
} catch {
  console.error("phase44_source_json_invalid");
  process.exit(2);
}

const plan = preparePhase44AtomicConsumerWorker({
  atomicReplayExecutionPermit,
  rawAtomicReplayExecutionPermit,
  reviewedAtomicConsumerWorkerAttestation,
  rawReviewedAtomicConsumerWorkerAttestation,
  immediateHumanAuthorization,
  rawImmediateHumanAuthorization
});
if (!plan.atomicConsumerPlanPrepared) {
  console.error(`phase44_atomic_consumer_rejected:${plan.issues.join(",")}`);
  process.exit(3);
}

const serialized = `${JSON.stringify(plan, null, 2)}\n`;
if (/(postgres(?:ql)?:\/\/|https?:\/\/|bearer\s+[a-z0-9._~-]+|supabase\s+db\s+(?:push|reset)|--linked|"(?:password|secret|bearerToken|accessToken|refreshToken|authorizationHeader|databaseUrl|connectionString|apiKey|accessKey|serviceRole|credentialValue|nonceValue|rawNonce|permitValue|rawPermit|rawSession|jwt|shell|projectRef|records|rows)"\s*:)/i.test(serialized)) {
  console.error("phase44_sensitive_persistence_guard_triggered");
  process.exit(3);
}

const parent = dirname(outputFile);
if (!insideWorkspace(parent)) {
  console.error("phase44_output_parent_unsafe");
  process.exit(2);
}
mkdirSync(parent, { recursive: true, mode: 0o700 });
writeFileSync(outputFile, serialized, { mode: 0o600, flag: "wx" });
chmodSync(outputFile, 0o600);

console.log(JSON.stringify({
  phase: plan.phase,
  status: plan.status,
  atomicConsumerPlanPrepared: plan.atomicConsumerPlanPrepared,
  currentState: plan.currentState,
  consumptionState: plan.consumptionState,
  consumptionVersion: plan.consumptionVersion,
  maximumConsumptionCount: plan.maximumConsumptionCount,
  atomicReservationFieldCount: plan.atomicReservationFields.length,
  futureAtomicTransactionStepCount: plan.futureAtomicTransactionPlan.length,
  ambiguousCommitPolicy: plan.ambiguousCommitPolicy,
  atomicConsumerAvailable: plan.atomicConsumerAvailable,
  consumerArmed: plan.consumerArmed,
  executionPermitAvailable: plan.executionPermitAvailable,
  executionPermitConsumed: plan.executionPermitConsumed,
  oneTimeExecutionNonceConsumed: plan.oneTimeExecutionNonceConsumed,
  supervisorStarted: plan.supervisorStarted,
  adapterExecuted: plan.adapterExecuted,
  replayExecuted: plan.replayExecuted,
  blockedReason: plan.blockedReason,
  databaseTouched: plan.databaseTouched,
  networkTouched: plan.networkTouched,
  processSpawned: plan.processSpawned,
  remoteDatabaseTouched: plan.remoteDatabaseTouched,
  stagingTouched: plan.stagingTouched,
  productionTouched: plan.productionTouched,
  metaTouched: plan.metaTouched,
  buildExecuted: plan.buildExecuted,
  outputFile: relative(workspace, outputFile)
}, null, 2));
