import { readFileSync, writeFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createEvidenceReconciliation, validatePhase22Evidence } from "./preflight-meta-test-events-evidence-reconciliation.mjs";

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

try {
  const phase19 = readJson("ATLAS_PHASE19_COMPARISON_EVIDENCE_FILE");
  const phase20 = readJson("ATLAS_PHASE20_REHEARSAL_EVIDENCE_FILE");
  const phase21 = readJson("ATLAS_PHASE21_OBSERVATION_RECEIPT_FILE");
  const outputPath = safeJsonPath(required("ATLAS_PHASE22_RECONCILIATION_EVIDENCE_FILE"));
  const result = createEvidenceReconciliation(phase19, phase20, phase21);
  if (!result.approved || !result.evidence) throw new Error(`reconciliation_gate_closed:${result.issueCodes.join(",")}`);
  const validation = validatePhase22Evidence(result.evidence);
  if (!validation.approved) throw new Error(`phase22_self_validation_failed:${validation.issueCodes.join(",")}`);
  writeFileSync(outputPath, `${JSON.stringify(result.evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify(result.evidence, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    format: "atlas_meta_test_events_evidence_reconciliation_v1",
    phase: 22,
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
      evidenceChainReconciled: false,
      officialTestEvidenceReconciled: false,
      automaticRetryAllowed: false,
      automaticDeliveryAllowed: false,
      nextControlledTestAllowed: false,
      productionDeliveryAllowed: false,
      campaignMutationAllowed: false,
      budgetMutationAllowed: false,
      audienceMutationAllowed: false,
      deploymentAllowed: false
    },
    errorCode: error instanceof Error ? error.message.split(":")[0] : "unknown_failure"
  }, null, 2));
  process.exit(1);
}
