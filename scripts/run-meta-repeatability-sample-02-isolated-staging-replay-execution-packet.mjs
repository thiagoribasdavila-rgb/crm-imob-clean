import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { preparePhase40StagingReplayExecutionPacket } from "./preflight-meta-repeatability-sample-02-isolated-staging-replay-execution-packet.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const gate = JSON.parse(readFileSync(resolve(root, "config/meta-repeatability-sample-02-isolated-staging-replay-execution-packet-gate.json"), "utf8"));
const contractInput = process.env.ATLAS_PHASE39_STAGING_REPLAY_CONTRACT_FILE;
const windowInput = process.env.ATLAS_PHASE40_OPERATIONAL_WINDOW_FILE;
const attestationInput = process.env.ATLAS_PHASE40_CREDENTIAL_ATTESTATION_FILE;
const approvalInput = process.env.ATLAS_PHASE40_EXECUTION_APPROVAL_FILE;
const outputInput = process.env.ATLAS_PHASE40_EXECUTION_PACKET_FILE ?? "artifacts/meta-phase40-isolated-staging-replay-execution-packet.json";
const withinWorkspace = (file) => file === root || file.startsWith(`${root}${sep}`);
const resolveWorkspaceFile = (input) => isAbsolute(input) ? resolve(input) : resolve(root, input);

if (!contractInput || !windowInput || !attestationInput || !approvalInput) {
  console.error("phase40_contract_window_attestation_and_execution_approval_paths_required");
  process.exit(1);
}

const sourceFiles = [contractInput, windowInput, attestationInput, approvalInput].map(resolveWorkspaceFile);
const outputFile = resolveWorkspaceFile(outputInput);
if ([...sourceFiles, outputFile].some((file) => !withinWorkspace(file))) {
  console.error("phase40_path_outside_workspace");
  process.exit(1);
}
for (const file of sourceFiles) {
  if (!existsSync(file) || lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile()
    || lstatSync(file).size > gate.maximumInputBytes || !withinWorkspace(realpathSync(file))) {
    console.error("phase40_source_file_unsafe");
    process.exit(1);
  }
  if ((lstatSync(file).mode & 0o077) !== 0) {
    console.error("phase40_source_receipt_permissions_too_open");
    process.exit(1);
  }
}
if (existsSync(outputFile) && lstatSync(outputFile).isSymbolicLink()) {
  console.error("phase40_output_symlink_rejected");
  process.exit(1);
}

const raw = sourceFiles.map((file) => readFileSync(file, "utf8"));
let parsed;
try {
  parsed = raw.map((value) => JSON.parse(value));
} catch {
  console.error("phase40_source_json_invalid");
  process.exit(1);
}

const packet = preparePhase40StagingReplayExecutionPacket({
  stagingReplayContract: parsed[0], operationalWindow: parsed[1], credentialAttestation: parsed[2], humanExecutionApproval: parsed[3],
  rawStagingReplayContract: raw[0], rawOperationalWindow: raw[1], rawCredentialAttestation: raw[2], rawHumanExecutionApproval: raw[3]
});
if (!packet.executionPacketPrepared) {
  console.error(`phase40_execution_packet_rejected:${packet.issues.join(",")}`);
  process.exit(1);
}

delete packet.issues;
mkdirSync(dirname(outputFile), { recursive: true });
if (!withinWorkspace(realpathSync(dirname(outputFile)))) {
  console.error("phase40_output_parent_unsafe");
  process.exit(1);
}
writeFileSync(outputFile, `${JSON.stringify(packet, null, 2)}\n`, { mode: 0o600 });
chmodSync(outputFile, 0o600);
console.log(JSON.stringify({
  status: packet.status,
  outputFile: outputFile.slice(root.length + 1),
  executionPacketPrepared: packet.executionPacketPrepared,
  stagingReplayContractAccepted: packet.stagingReplayContractAccepted,
  operationalWindowAccepted: packet.operationalWindowAccepted,
  credentialAttestationAccepted: packet.credentialAttestationAccepted,
  humanExecutionApprovalAccepted: packet.humanExecutionApprovalAccepted,
  oneTimeExecutionConfirmationReceived: packet.oneTimeExecutionConfirmationReceived,
  oneTimeExecutionNonceConsumed: packet.oneTimeExecutionNonceConsumed,
  replayExecuted: packet.replayExecuted,
  replayExecutionAllowed: packet.releaseGates.replayExecutionAllowed,
  stagingMigrationAllowed: packet.releaseGates.stagingMigrationAllowed,
  productionMigrationAllowed: packet.releaseGates.productionMigrationAllowed,
  remoteDatabaseTouched: packet.remoteDatabaseTouched,
  metaTouched: packet.metaTouched,
  buildExecuted: packet.buildExecuted
}, null, 2));
