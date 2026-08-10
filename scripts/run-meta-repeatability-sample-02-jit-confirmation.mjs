import { readFileSync, writeFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createJitConfirmationReceipt, validatePhase25Receipt } from "./preflight-meta-repeatability-sample-02-jit-confirmation.mjs";

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
  const phase24Draft = readJson("ATLAS_PHASE24_AUTHORIZATION_DRAFT_FILE");
  const request = readJson("ATLAS_PHASE25_JIT_CONFIRMATION_REQUEST_FILE");
  const outputPath = safeJsonPath(required("ATLAS_PHASE25_JIT_CONFIRMATION_RECEIPT_FILE"));
  const result = createJitConfirmationReceipt(phase24Draft, request);
  if (!result.approved || !result.receipt) throw new Error(`jit_confirmation_gate_closed:${result.issueCodes.join(",")}`);
  const validation = validatePhase25Receipt(result.receipt);
  if (!validation.approved) throw new Error(`phase25_self_validation_failed:${validation.issueCodes.join(",")}`);
  writeFileSync(outputPath, `${JSON.stringify(result.receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify(result.receipt, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    format: "atlas_meta_repeatability_jit_confirmation_receipt_v1",
    phase: 25,
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
      jitConfirmationReceiptPrepared: false,
      phase24DraftLinked: false,
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
