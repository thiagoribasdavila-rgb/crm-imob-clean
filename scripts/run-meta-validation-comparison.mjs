import { readFileSync, writeFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createValidationComparison, validatePhase19Evidence } from "./preflight-meta-validation-comparison.mjs";

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
  const eventInput = readJson("ATLAS_PHASE19_EVENT_INPUT_FILE");
  const outputPath = safeJsonPath(required("ATLAS_PHASE19_COMPARISON_EVIDENCE_FILE"));
  const result = createValidationComparison(phase17Evidence, eventInput);
  if (!result.approved || !result.evidence) throw new Error(`comparison_gate_closed:${result.issueCodes.join(",")}`);
  const validation = validatePhase19Evidence(result.evidence);
  if (!validation.approved) throw new Error(`phase19_self_validation_failed:${validation.issueCodes.join(",")}`);
  writeFileSync(outputPath, `${JSON.stringify(result.evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify(result.evidence, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    format: "atlas_meta_validation_comparison_evidence_v1",
    phase: 19,
    environment: "staging_clone",
    passed: false,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    payloadPersisted: false,
    matchValuesPersisted: false,
    remoteExecutionPerformed: false,
    officialMetaComparison: { executed: false, status: "pending", testEventCodePersisted: false, responsePersisted: false },
    execution: { payloadBuiltInMemory: false, networkCallExecuted: false, metaRequestDelivered: false, databaseMutationExecuted: false },
    releaseGates: { localComparisonApproved: false, officialComparisonApproved: false, testEventDeliveryAllowed: false, productionAllowed: false, deploymentAllowed: false },
    errorCode: error instanceof Error ? error.message.split(":")[0] : "unknown_failure",
  }, null, 2));
  process.exit(1);
}
