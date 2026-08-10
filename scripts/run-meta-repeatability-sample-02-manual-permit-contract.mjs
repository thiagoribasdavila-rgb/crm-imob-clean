import { readFileSync, writeFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createManualPermitContract, validatePhase26Contract } from "./preflight-meta-repeatability-sample-02-manual-permit-contract.mjs";

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
  const phase25Receipt = readJson("ATLAS_PHASE25_JIT_CONFIRMATION_RECEIPT_FILE");
  const request = readJson("ATLAS_PHASE26_MANUAL_PERMIT_CONTRACT_REQUEST_FILE");
  const outputPath = safeJsonPath(required("ATLAS_PHASE26_MANUAL_PERMIT_CONTRACT_FILE"));
  const result = createManualPermitContract(phase25Receipt, request);
  if (!result.approved || !result.contract) throw new Error(`manual_permit_contract_gate_closed:${result.issueCodes.join(",")}`);
  const validation = validatePhase26Contract(result.contract);
  if (!validation.approved) throw new Error(`phase26_self_validation_failed:${validation.issueCodes.join(",")}`);
  writeFileSync(outputPath, `${JSON.stringify(result.contract, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify(result.contract, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    format: "atlas_meta_repeatability_manual_permit_contract_v1",
    phase: 26,
    environment: "staging_clone",
    passed: false,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    containsTemporaryCode: false,
    payloadPersisted: false,
    rawResponsePersisted: false,
    screenshotPersisted: false,
    lifecycle: { status: "not_prepared", issued: false, usable: false, consumed: false, executed: false, eventDelivered: false },
    releaseGates: {
      manualPermitContractPrepared: false,
      phase25ReceiptLinked: false,
      permitIssuanceAllowed: false,
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
