import { readFileSync, writeFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createTestEventsRehearsalPacket, validatePhase20Evidence } from "./preflight-meta-test-events-rehearsal.mjs";

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
  const phase17Evidence = readJson("ATLAS_PHASE17_DATA_API_EVIDENCE_FILE");
  const phase19Evidence = readJson("ATLAS_PHASE19_COMPARISON_EVIDENCE_FILE");
  const request = readJson("ATLAS_PHASE20_REHEARSAL_REQUEST_FILE");
  const outputPath = safeJsonPath(required("ATLAS_PHASE20_REHEARSAL_EVIDENCE_FILE"));
  const result = createTestEventsRehearsalPacket(phase17Evidence, phase19Evidence, request);
  if (!result.approved || !result.evidence) throw new Error(`rehearsal_gate_closed:${result.issueCodes.join(",")}`);
  const validation = validatePhase20Evidence(result.evidence);
  if (!validation.approved) throw new Error(`phase20_self_validation_failed:${validation.issueCodes.join(",")}`);
  writeFileSync(outputPath, `${JSON.stringify(result.evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify(result.evidence, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    format: "atlas_meta_test_events_rehearsal_evidence_v1",
    phase: 20,
    environment: "staging_clone",
    passed: false,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    containsTemporaryCode: false,
    payloadPersisted: false,
    responsePersisted: false,
    officialExecution: { executed: false, eventDelivered: false, responseObserved: false },
    releaseGates: {
      manualOperatorRehearsalAllowed: false, automaticDeliveryAllowed: false, productionDeliveryAllowed: false,
      campaignMutationAllowed: false, budgetMutationAllowed: false, audienceMutationAllowed: false, deploymentAllowed: false,
    },
    errorCode: error instanceof Error ? error.message.split(":")[0] : "unknown_failure",
  }, null, 2));
  process.exit(1);
}
