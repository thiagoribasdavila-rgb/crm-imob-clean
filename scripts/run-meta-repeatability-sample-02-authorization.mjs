import { readFileSync, writeFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthorizationDraft, validatePhase24Draft } from "./preflight-meta-repeatability-sample-02-authorization.mjs";

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
  const phase23 = readJson("ATLAS_PHASE23_REPEATABILITY_PLAN_FILE");
  const request = readJson("ATLAS_PHASE24_AUTHORIZATION_REQUEST_FILE");
  const outputPath = safeJsonPath(required("ATLAS_PHASE24_AUTHORIZATION_DRAFT_FILE"));
  const result = createAuthorizationDraft(phase23, request);
  if (!result.approved || !result.draft) throw new Error(`authorization_draft_gate_closed:${result.issueCodes.join(",")}`);
  const validation = validatePhase24Draft(result.draft);
  if (!validation.approved) throw new Error(`phase24_self_validation_failed:${validation.issueCodes.join(",")}`);
  writeFileSync(outputPath, `${JSON.stringify(result.draft, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify(result.draft, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    format: "atlas_meta_repeatability_authorization_draft_v1",
    phase: 24,
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
      authorizationDraftPrepared: false,
      phase23PlanLinked: false,
      authorizationActivationAllowed: false,
      manualObservationAllowed: false,
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
