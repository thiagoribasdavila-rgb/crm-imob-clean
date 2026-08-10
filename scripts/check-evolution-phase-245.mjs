import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
} from "../lib/release/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption.mjs";

const fail = (message) => { throw new Error(`[phase-245] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-245-controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption.json",
  consumptionPolicy: "config/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption-policy.json",
  consumptionMemory: "config/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption-memory.json",
  authorizationPolicy: "config/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-policy.json",
  authorizationMemory: "config/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-memory.json",
  documentation: "docs/EVOLUTION_PHASE_245_CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION.md",
  library: "lib/release/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption.mjs",
  runner: "scripts/run-controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption-phase-245.mjs",
  test: "tests/contracts/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

execFileSync(process.execPath, ["scripts/check-evolution-phase-244.mjs"], { stdio: "pipe" });
const readiness = JSON.parse(execFileSync(process.execPath, [paths.runner], { encoding: "utf8" }));
const phase = readJson(paths.phase);
const consumptionPolicy = readJson(paths.consumptionPolicy);
const consumptionMemory = readJson(paths.consumptionMemory);
const authorizationPolicy = readJson(paths.authorizationPolicy);
const authorizationMemory = readJson(paths.authorizationMemory);

if (phase.phase !== 245 || phase.status !== "implemented") fail("fase ou status inválido");
if (readiness.phase !== 245 || readiness.authorizationConsumptionAllowed !== true) {
  fail("diagnóstico de prontidão inválido");
}
if (readiness.readiness !== "awaiting_recorded_unexpired_single_use_subsequent_continuation_observation_review_authorization_and_trusted_independent_consumer") {
  fail("estado de prontidão divergente");
}
const memoryInspection = inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory(
  consumptionMemory,
  { policy: consumptionPolicy },
);
if (!memoryInspection.ok) fail(`memória canônica inválida: ${memoryInspection.reason}`);
if (consumptionPolicy.trustedReviewAuthorizationConsumers.length !== 0) fail("consumidor real foi inventado");
if (authorizationMemory.entries.length !== 0) fail("autorização canônica foi inventada");
if (consumptionMemory.entries.length !== 0) fail("consumo canônico foi inventado");

const bindings = {
  controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicyHash: authorizationPolicy.policyHash,
  controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemoryHash: authorizationMemory.memoryHash,
  controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicyHash: consumptionPolicy.policyHash,
  controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemoryHash: consumptionMemory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) {
  if (phase.currentState[key] !== value || readiness[key] !== value) fail(`vínculo divergente: ${key}`);
}
for (const key of [
  "trustedReviewAuthorizationConsumersConfigured", "recordedReviewAuthorizations",
  "recordedAuthorizationConsumptions", "consumedSingleUseAuthorizations",
]) if (phase.currentState[key] !== 0 || readiness[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "reviewAuthorizationConsumed", "subsequentContinuationAuthorizationConsumed", "subsequentContinuationExecuted",
  "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted",
  "releasePromoted",
]) if (phase.currentState[key] !== false || readiness[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");

for (const key of [
  "recordedUnexpiredSingleUseAuthorizationRequired", "exactReviewAuthorizationBindingRequired",
  "exactReviewAuthorizationPolicyBindingRequired", "exactReviewAuthorizationMemoryBindingRequired",
  "exactReviewBindingRequired", "exactNextSubsequentContinuationObservationBindingRequired",
  "exactNextSubsequentContinuationBindingRequired", "exactPackageDigestBindingRequired", "exactInventoryBindingRequired",
  "consumerIndependenceRequired", "consumerValidityAtConsumptionRequired", "signedConsumptionReceiptRequired",
  "appendOnlyConsumptionMemoryRequired", "duplicateAuthorizationConsumptionRejected", "atomicMemoryHeadBindingRequired",
  "singleUseConsumptionRequired",
]) if (consumptionPolicy[key] !== true || phase.consumptionRules[key] !== true) fail(`${key} desabilitado`);
if (consumptionPolicy.maximumUses !== 1 || phase.consumptionRules.maximumUses !== 1) {
  fail("consumo deixou de ser de uso único");
}
if (consumptionPolicy.authorizationConsumptionAllowed !== true) fail("consumo interno não habilitado");
for (const key of [
  "nextSubsequentContinuationAllowed", "publicationExecutionAllowed", "networkAccessAllowed", "databaseMutationAllowed",
  "externalPublicationAllowed", "automaticPublicationExecution", "automaticPackageGeneration", "automaticBuild",
  "automaticDeploy", "automaticReleasePromotion",
]) if (consumptionPolicy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "recorded_unexpired_single_use_review_authorization_required_for_consumption",
  "controlled_proof_execution_subsequent_continuation_observation_review_authorization_not_recorded",
  "controlled_proof_execution_subsequent_continuation_observation_review_authorization_already_consumed",
  "controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer_not_independent",
  "controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_after_expiration",
  "private_key_does_not_match_controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumer",
  "remainingUses: 0",
  "nextSubsequentContinuationAllowed: false",
  "nextSubsequentContinuationExecuted: false",
  "publicationExecuted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);

if (phase.nextPhase?.phase !== 246 || phase.nextPhase?.name !== "Controlled Proof Execution Following Subsequent Continuation") {
  fail("próxima fase divergente");
}
if (readJson("config/evolution-program-3000.json").currentPhase < 245) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-245:assess", "evolution:phase-245:check"]) {
  if (!scripts[name]) fail(`script ausente: ${name}`);
}

console.log("[phase-245] PASS — uma autorização válida, assinada e registrada só pode ser consumida internamente uma vez; a próxima continuação e todos os efeitos externos permanecem bloqueados.");
