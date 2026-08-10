import { readFileSync, writeFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createObservationReceipt,
  validatePhase21Receipt,
} from "./preflight-meta-test-events-observation.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_required_environment:${name}`);
  return value;
};
const safeJsonPath = (configured) => {
  const absolute = resolve(root, configured);
  const offset = relative(root, absolute);
  if (offset === ".." || offset.startsWith(`..${sep}`) || extname(absolute) !== ".json") throw new Error("evidence_file_outside_workspace");
  return absolute;
};
const readJson = (name) => JSON.parse(readFileSync(safeJsonPath(required(name)), "utf8"));

function main() {
  const phase20Evidence = readJson("ATLAS_PHASE20_REHEARSAL_EVIDENCE_FILE");
  const observationInput = readJson("ATLAS_PHASE21_OBSERVATION_INPUT_FILE");
  const outputPath = safeJsonPath(required("ATLAS_PHASE21_OBSERVATION_RECEIPT_FILE"));
  const result = createObservationReceipt(phase20Evidence, observationInput);
  if (!result.approved || !result.receipt) throw new Error(`observation_gate_closed:${result.issueCodes.join(",")}`);
  const validation = validatePhase21Receipt(result.receipt);
  if (!validation.approved) throw new Error(`phase21_self_validation_failed:${validation.issueCodes.join(",")}`);
  writeFileSync(outputPath, `${JSON.stringify(result.receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify(result.receipt, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    format: "atlas_meta_test_events_observation_receipt_v1",
    phase: 21,
    environment: "staging_clone",
    passed: false,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    containsTemporaryCode: false,
    payloadPersisted: false,
    rawResponsePersisted: false,
    screenshotPersisted: false,
    releaseGates: {
      officialTestObservationApproved: false,
      automaticDeliveryAllowed: false,
      automaticRetryAllowed: false,
      productionDeliveryAllowed: false,
      campaignMutationAllowed: false,
      budgetMutationAllowed: false,
      audienceMutationAllowed: false,
      deploymentAllowed: false,
    },
    errorCode: error instanceof Error ? error.message.split(":")[0] : "unknown_failure",
  }, null, 2));
  process.exit(1);
}
