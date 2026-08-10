import { readFileSync, writeFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRepeatabilityPlan, validatePhase23Plan } from "./preflight-meta-test-events-repeatability-plan.mjs";

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

try {
  const sourcePath = safeJsonPath(required("ATLAS_PHASE22_RECONCILIATION_EVIDENCE_FILE"));
  const outputPath = safeJsonPath(required("ATLAS_PHASE23_REPEATABILITY_PLAN_FILE"));
  const phase22 = JSON.parse(readFileSync(sourcePath, "utf8"));
  const result = createRepeatabilityPlan(phase22);
  if (!result.approved || !result.plan) throw new Error(`repeatability_plan_gate_closed:${result.issueCodes.join(",")}`);
  const validation = validatePhase23Plan(result.plan);
  if (!validation.approved) throw new Error(`phase23_self_validation_failed:${validation.issueCodes.join(",")}`);
  writeFileSync(outputPath, `${JSON.stringify(result.plan, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify(result.plan, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    format: "atlas_meta_test_events_repeatability_plan_v1",
    phase: 23,
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
      repeatabilityPlanPrepared: false,
      baselineEvidenceLinked: false,
      nextControlledTestAllowed: false,
      automaticRetryAllowed: false,
      automaticDeliveryAllowed: false,
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
