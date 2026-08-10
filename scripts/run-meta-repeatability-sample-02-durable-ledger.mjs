import { readFileSync, writeFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createDurableLedgerPreparation, validatePhase28Preparation } from "./preflight-meta-repeatability-sample-02-durable-ledger.mjs";

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
  const phase27Preparation = readJson("ATLAS_PHASE27_ATOMIC_LEDGER_PREPARATION_FILE");
  const request = readJson("ATLAS_PHASE28_DURABLE_LEDGER_REQUEST_FILE");
  const outputPath = safeJsonPath(required("ATLAS_PHASE28_DURABLE_LEDGER_PREPARATION_FILE"));
  const result = createDurableLedgerPreparation(phase27Preparation, request);
  if (!result.approved || !result.preparation) throw new Error(`durable_ledger_gate_closed:${result.issueCodes.join(",")}`);
  const validation = validatePhase28Preparation(result.preparation);
  if (!validation.approved) throw new Error(`phase28_self_validation_failed:${validation.issueCodes.join(",")}`);
  writeFileSync(outputPath, `${JSON.stringify(result.preparation, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify(result.preparation, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    format: "atlas_meta_repeatability_durable_ledger_preparation_v1", phase: 28, environment: "staging_clone",
    passed: false, sanitized: true, containsSecrets: false, containsPersonalData: false, containsTemporaryCode: false,
    payloadPersisted: false, rawResponsePersisted: false, databaseTouched: false, networkTouched: false,
    lifecycle: { status: "not_prepared", migrationPromoted: false, migrationExecuted: false, rollbackExecuted: false, reservationPersisted: false, permitIssued: false, permitUsable: false, permitConsumed: false, actionExecuted: false, eventDelivered: false },
    releaseGates: { durableAdapterDraftPrepared: false, phase27LedgerLinked: false, migrationPromotionAllowed: false, migrationExecutionAllowed: false, rollbackExecutionAllowed: false, ledgerPersistenceAllowed: false, permitIssuanceAllowed: false, permitConsumptionAllowed: false, authorizationActivationAllowed: false, manualObservationAllowed: false, automaticRetryAllowed: false, automaticDeliveryAllowed: false, productionDeliveryAllowed: false, campaignMutationAllowed: false, budgetMutationAllowed: false, audienceMutationAllowed: false, deploymentAllowed: false },
    errorCode: error instanceof Error ? error.message.split(":")[0] : "unknown_failure",
  }, null, 2));
  process.exit(1);
}
