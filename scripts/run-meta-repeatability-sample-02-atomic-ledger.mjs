import { readFileSync, writeFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createAtomicLedgerPreparation, validatePhase27Preparation } from "./preflight-meta-repeatability-sample-02-atomic-ledger.mjs";

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
  const phase26Contract = readJson("ATLAS_PHASE26_MANUAL_PERMIT_CONTRACT_FILE");
  const request = readJson("ATLAS_PHASE27_ATOMIC_LEDGER_REQUEST_FILE");
  const outputPath = safeJsonPath(required("ATLAS_PHASE27_ATOMIC_LEDGER_PREPARATION_FILE"));
  const result = createAtomicLedgerPreparation(phase26Contract, request);
  if (!result.approved || !result.preparation) throw new Error(`atomic_ledger_gate_closed:${result.issueCodes.join(",")}`);
  const validation = validatePhase27Preparation(result.preparation);
  if (!validation.approved) throw new Error(`phase27_self_validation_failed:${validation.issueCodes.join(",")}`);
  writeFileSync(outputPath, `${JSON.stringify(result.preparation, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify(result.preparation, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    format: "atlas_meta_repeatability_atomic_ledger_preparation_v1",
    phase: 27,
    environment: "staging_clone",
    passed: false,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    containsTemporaryCode: false,
    payloadPersisted: false,
    rawResponsePersisted: false,
    screenshotPersisted: false,
    rehearsal: { inMemoryOnly: true, databaseTouched: false, filesystemLedgerTouched: false, networkTouched: false },
    lifecycle: { status: "not_prepared", reservationPersisted: false, permitIssued: false, permitUsable: false, permitConsumed: false, actionExecuted: false, eventDelivered: false },
    releaseGates: {
      atomicLedgerContractPrepared: false,
      phase26ContractLinked: false,
      ledgerPersistenceAllowed: false,
      permitIssuanceAllowed: false,
      permitConsumptionAllowed: false,
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
