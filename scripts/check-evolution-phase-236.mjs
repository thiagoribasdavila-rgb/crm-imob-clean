import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionSubsequentContinuationMemory,
} from "../lib/release/controlled-proof-execution-subsequent-continuation.mjs";

const fail = (message) => { throw new Error(`[phase-236] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-236-controlled-proof-execution-subsequent-continuation.json",
  policy: "config/controlled-proof-execution-subsequent-continuation-policy.json",
  memory: "config/controlled-proof-execution-subsequent-continuation-memory.json",
  consumptionPolicy: "config/controlled-proof-execution-continuation-observation-review-authorization-consumption-policy.json",
  consumptionMemory: "config/controlled-proof-execution-continuation-observation-review-authorization-consumption-memory.json",
  documentation: "docs/EVOLUTION_PHASE_236_CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION.md",
  library: "lib/release/controlled-proof-execution-subsequent-continuation.mjs",
  runner: "scripts/run-controlled-proof-execution-subsequent-continuation-phase-236.mjs",
  test: "tests/contracts/controlled-proof-execution-subsequent-continuation.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

execFileSync(process.execPath, ["scripts/check-evolution-phase-235.mjs"], { stdio: "pipe" });
const readiness = JSON.parse(execFileSync(process.execPath, [paths.runner], { encoding: "utf8" }));
const phase = readJson(paths.phase);
const policy = readJson(paths.policy);
const memory = readJson(paths.memory);
const consumptionPolicy = readJson(paths.consumptionPolicy);
const consumptionMemory = readJson(paths.consumptionMemory);

if (phase.phase !== 236 || phase.status !== "implemented") fail("fase ou status inválido");
if (readiness.phase !== 236 || readiness.subsequentContinuationAllowed !== true) fail("diagnóstico de prontidão inválido");
const memoryInspection = inspectControlledProofExecutionSubsequentContinuationMemory(memory, { policy });
if (!memoryInspection.ok) fail(`memória canônica inválida: ${memoryInspection.reason}`);
if (policy.trustedSubsequentContinuationExecutors.length !== 0) fail("executor real foi inventado");
if (consumptionMemory.entries.length !== 0) fail("consumo canônico foi inventado");
if (memory.entries.length !== 0) fail("continuação subsequente canônica foi inventada");

const bindings = {
  controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicyHash: consumptionPolicy.policyHash,
  controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemoryHash: consumptionMemory.memoryHash,
  controlledProofExecutionSubsequentContinuationPolicyHash: policy.policyHash,
  controlledProofExecutionSubsequentContinuationMemoryHash: memory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) {
  if (phase.currentState[key] !== value || readiness[key] !== value) fail(`vínculo divergente: ${key}`);
}
for (const key of [
  "trustedSubsequentContinuationExecutorsConfigured", "recordedAuthorizationConsumptions",
  "recordedSubsequentContinuations", "consumedAuthorizationConsumptions",
]) if (phase.currentState[key] !== 0 || readiness[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "subsequentContinuationAuthorizationConsumed", "subsequentContinuationExecuted", "subsequentContinuationObserved",
  "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted",
  "releasePromoted",
]) if (phase.currentState[key] !== false || readiness[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");

for (const key of [
  "recordedSignedAuthorizationConsumptionRequired", "exactConsumptionReceiptBindingRequired",
  "exactConsumptionPolicyBindingRequired", "exactConsumptionMemoryBindingRequired",
  "exactReviewAuthorizationBindingRequired", "exactReviewBindingRequired",
  "exactContinuationObservationBindingRequired", "exactPriorContinuationBindingRequired",
  "exactExecutionStartBindingRequired", "exactPackageDigestBindingRequired", "exactInventoryBindingRequired",
  "executorIndependenceRequired", "executorValidityAtContinuationRequired", "authorizationValidityAtContinuationRequired",
  "signedSubsequentContinuationReceiptRequired", "appendOnlySubsequentContinuationMemoryRequired",
  "duplicateConsumptionContinuationRejected", "atomicMemoryHeadBindingRequired", "singleUseSubsequentContinuationRequired",
]) if (policy[key] !== true || phase.continuationRules[key] !== true) fail(`${key} desabilitado`);
if (policy.maximumSubsequentContinuations !== 1 || phase.continuationRules.maximumSubsequentContinuations !== 1) {
  fail("continuação subsequente deixou de ser de uso único");
}
if (policy.subsequentContinuationAllowed !== true) fail("continuação interna não habilitada");
for (const key of [
  "subsequentContinuationObservationAllowed", "publicationExecutionAllowed", "networkAccessAllowed",
  "databaseMutationAllowed", "externalPublicationAllowed", "automaticPublicationExecution",
  "automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
]) if (policy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "recorded_signed_authorization_consumption_required_for_subsequent_continuation",
  "controlled_proof_execution_authorization_consumption_not_recorded",
  "controlled_proof_execution_subsequent_continuation_after_authorization_expiration",
  "controlled_proof_execution_subsequent_continuation_executor_not_independent",
  "private_key_does_not_match_controlled_proof_execution_subsequent_continuation_executor",
  "remainingSubsequentContinuations: 0",
  "subsequentContinuationObserved: false",
  "publicationExecuted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);

if (phase.nextPhase?.phase !== 237 || phase.nextPhase?.name !== "Controlled Proof Execution Subsequent Continuation Observation") {
  fail("próxima fase divergente");
}
if (readJson("config/evolution-program-3000.json").currentPhase < 236) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-236:assess", "evolution:phase-236:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-236] PASS — somente um consumo válido, assinado e registrado pode executar uma continuação interna subsequente de uso único; observação e efeitos externos permanecem bloqueados.");
