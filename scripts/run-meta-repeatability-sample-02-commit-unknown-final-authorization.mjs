import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { preparePhase45FinalExecutionControl } from "./preflight-meta-repeatability-sample-02-commit-unknown-final-authorization.mjs";

const workspace = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const inputs = [process.env.ATLAS_PHASE45_CONSUMER_PLAN, process.env.ATLAS_PHASE45_TRANSACTION_ATTESTATION, process.env.ATLAS_PHASE45_FINAL_AUTHORIZATION];
const output = process.env.ATLAS_PHASE45_OUTPUT;
if (inputs.some((value) => !value) || !output) { console.error("phase45_consumer_plan_transaction_attestation_and_final_authorization_required"); process.exit(2); }
const resolveFile = (value) => isAbsolute(value) ? resolve(value) : resolve(workspace, value);
const inside = (value) => { const result = relative(workspace, value); return result === "" || (!result.startsWith("..") && !isAbsolute(result)); };
const files = inputs.map(resolveFile);
if (files.some((file) => !inside(file))) { console.error("phase45_path_outside_workspace"); process.exit(2); }
for (const file of files) if (!existsSync(file) || lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile() || lstatSync(file).size > 1048576) { console.error("phase45_source_file_unsafe"); process.exit(2); }
for (const file of files) if ((lstatSync(file).mode & 0o077) !== 0) { console.error("phase45_source_receipt_permissions_too_open"); process.exit(2); }
const outputFile = resolveFile(output);
if (!inside(outputFile) || (existsSync(outputFile) && lstatSync(outputFile).isSymbolicLink())) { console.error("phase45_output_path_unsafe"); process.exit(2); }
let rawAtomicConsumerPlan, rawReviewedTransactionBoundaryAttestation, rawImmediateFinalExecutionAuthorization, atomicConsumerPlan, reviewedTransactionBoundaryAttestation, immediateFinalExecutionAuthorization;
try { [rawAtomicConsumerPlan, rawReviewedTransactionBoundaryAttestation, rawImmediateFinalExecutionAuthorization] = files.map((file) => readFileSync(file, "utf8")); [atomicConsumerPlan, reviewedTransactionBoundaryAttestation, immediateFinalExecutionAuthorization] = [rawAtomicConsumerPlan, rawReviewedTransactionBoundaryAttestation, rawImmediateFinalExecutionAuthorization].map(JSON.parse); } catch { console.error("phase45_source_json_invalid"); process.exit(2); }
const plan = preparePhase45FinalExecutionControl({ atomicConsumerPlan, rawAtomicConsumerPlan, reviewedTransactionBoundaryAttestation, rawReviewedTransactionBoundaryAttestation, immediateFinalExecutionAuthorization, rawImmediateFinalExecutionAuthorization });
if (!plan.finalExecutionControlPrepared) { console.error(`phase45_final_execution_control_rejected:${plan.issues.join(",")}`); process.exit(3); }
const serialized = `${JSON.stringify(plan, null, 2)}\n`;
if (/(postgres(?:ql)?:\/\/|https?:\/\/|bearer\s+|"(?:password|secret|token|apiKey|nonceValue|permitValue|rawSession|jwt|records|rows)"\s*:)/i.test(serialized)) { console.error("phase45_sensitive_persistence_guard_triggered"); process.exit(3); }
mkdirSync(dirname(outputFile), { recursive: true, mode: 0o700 }); writeFileSync(outputFile, serialized, { mode: 0o600, flag: "wx" }); chmodSync(outputFile, 0o600);
console.log(JSON.stringify({ phase: 45, status: plan.status, finalExecutionControlPrepared: plan.finalExecutionControlPrepared, currentState: plan.currentState, commitUnknownPolicy: plan.commitUnknownPolicy, finalExecutionControlAvailable: plan.finalExecutionControlAvailable, commitUnknownReconcilerAvailable: plan.commitUnknownReconcilerAvailable, executionPermitConsumed: plan.executionPermitConsumed, consumerArmed: plan.consumerArmed, supervisorStarted: plan.supervisorStarted, adapterExecuted: plan.adapterExecuted, replayExecuted: plan.replayExecuted, databaseTouched: plan.databaseTouched, networkTouched: plan.networkTouched, processSpawned: plan.processSpawned, stagingTouched: plan.stagingTouched, productionTouched: plan.productionTouched, metaTouched: plan.metaTouched, buildExecuted: plan.buildExecuted }, null, 2));
