import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { preparePhase41OneTimeReplayAdapter } from "./preflight-meta-repeatability-sample-02-isolated-staging-one-time-replay-adapter.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const gate = JSON.parse(readFileSync(resolve(root, "config/meta-repeatability-sample-02-isolated-staging-one-time-replay-adapter-gate.json"), "utf8"));
const packetInput = process.env.ATLAS_PHASE40_EXECUTION_PACKET_FILE;
const confirmationInput = process.env.ATLAS_PHASE41_IMMEDIATE_CONFIRMATION_FILE;
const oneTimeExecutionNonce = process.env.ATLAS_PHASE41_ONE_TIME_EXECUTION_NONCE;
const outputInput = process.env.ATLAS_PHASE41_REPLAY_ADAPTER_FILE ?? "artifacts/meta-phase41-isolated-staging-one-time-replay-adapter.json";
const withinWorkspace = (file) => file === root || file.startsWith(`${root}${sep}`);
const resolveWorkspaceFile = (input) => isAbsolute(input) ? resolve(input) : resolve(root, input);

if (!packetInput || !confirmationInput || !oneTimeExecutionNonce) {
  console.error("phase41_packet_confirmation_and_runtime_nonce_required");
  process.exit(1);
}

const sourceFiles = [packetInput, confirmationInput].map(resolveWorkspaceFile);
const outputFile = resolveWorkspaceFile(outputInput);
if ([...sourceFiles, outputFile].some((file) => !withinWorkspace(file))) {
  console.error("phase41_path_outside_workspace");
  process.exit(1);
}
for (const file of sourceFiles) {
  if (!existsSync(file) || lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile()
    || lstatSync(file).size > gate.maximumInputBytes || !withinWorkspace(realpathSync(file))) {
    console.error("phase41_source_file_unsafe");
    process.exit(1);
  }
  if ((lstatSync(file).mode & 0o077) !== 0) {
    console.error("phase41_source_receipt_permissions_too_open");
    process.exit(1);
  }
}
if (existsSync(outputFile) && lstatSync(outputFile).isSymbolicLink()) {
  console.error("phase41_output_symlink_rejected");
  process.exit(1);
}

const raw = sourceFiles.map((file) => readFileSync(file, "utf8"));
let parsed;
try {
  parsed = raw.map((value) => JSON.parse(value));
} catch {
  console.error("phase41_source_json_invalid");
  process.exit(1);
}

const adapter = preparePhase41OneTimeReplayAdapter({
  executionPacket: parsed[0],
  immediateHumanConfirmation: parsed[1],
  oneTimeExecutionNonce,
  rawExecutionPacket: raw[0],
  rawImmediateHumanConfirmation: raw[1]
});
if (!adapter.executionAdapterPrepared) {
  console.error(`phase41_replay_adapter_rejected:${adapter.issues.join(",")}`);
  process.exit(1);
}
if (JSON.stringify(adapter).includes(oneTimeExecutionNonce)) {
  console.error("phase41_nonce_persistence_guard_triggered");
  process.exit(1);
}

delete adapter.issues;
mkdirSync(dirname(outputFile), { recursive: true });
if (!withinWorkspace(realpathSync(dirname(outputFile)))) {
  console.error("phase41_output_parent_unsafe");
  process.exit(1);
}
writeFileSync(outputFile, `${JSON.stringify(adapter, null, 2)}\n`, { mode: 0o600 });
chmodSync(outputFile, 0o600);
console.log(JSON.stringify({
  status: adapter.status,
  outputFile: outputFile.slice(root.length + 1),
  executionPacketAccepted: adapter.executionPacketAccepted,
  immediateHumanConfirmationAccepted: adapter.immediateHumanConfirmationAccepted,
  oneTimeExecutionNonceVerified: adapter.oneTimeExecutionNonceVerified,
  oneTimeExecutionNonceConsumed: adapter.oneTimeExecutionNonceConsumed,
  executionAdapterPrepared: adapter.executionAdapterPrepared,
  adapterExecuted: adapter.adapterExecuted,
  replayExecuted: adapter.replayExecuted,
  replayExecutionAllowed: adapter.releaseGates.replayExecutionAllowed,
  stagingMigrationAllowed: adapter.releaseGates.stagingMigrationAllowed,
  productionMigrationAllowed: adapter.releaseGates.productionMigrationAllowed,
  remoteDatabaseTouched: adapter.remoteDatabaseTouched,
  networkTouched: adapter.networkTouched,
  processSpawned: adapter.processSpawned,
  metaTouched: adapter.metaTouched,
  buildExecuted: adapter.buildExecuted
}, null, 2));
