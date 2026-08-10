import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
} from "../lib/release/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption.mjs";

const fail = (message) => { throw new Error(`[phase-250] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-250-controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption.json",
  consumptionPolicy: "config/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption-policy.json",
  consumptionMemory: "config/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption-memory.json",
  authorizationPolicy: "config/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-policy.json",
  authorizationMemory: "config/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-memory.json",
  documentation: "docs/EVOLUTION_PHASE_250_CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMPTION.md",
  library: "lib/release/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption.mjs",
  runner: "scripts/run-controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption-phase-250.mjs",
  test: "tests/contracts/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

execFileSync(process.execPath, ["scripts/check-evolution-phase-249.mjs"], { stdio: "pipe" });
const readiness = JSON.parse(execFileSync(process.execPath, [paths.runner], { encoding: "utf8" }));
const phase = readJson(paths.phase);
const consumptionPolicy = readJson(paths.consumptionPolicy);
const consumptionMemory = readJson(paths.consumptionMemory);
const authorizationPolicy = readJson(paths.authorizationPolicy);
const authorizationMemory = readJson(paths.authorizationMemory);

if (phase.phase !== 250 || phase.status !== "implemented") fail("fase ou status inválido");
if (readiness.phase !== 250 || readiness.authorizationConsumptionAllowed !== true) {
  fail("diagnóstico de prontidão inválido");
}
if (readiness.readiness !== "awaiting_recorded_unexpired_single_use_subsequent_continuation_observation_review_authorization_and_trusted_independent_consumer") {
  fail("estado de prontidão divergente");
}
const memoryInspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory(
  consumptionMemory,
  { policy: consumptionPolicy },
);
if (!memoryInspection.ok) fail(`memória canônica inválida: ${memoryInspection.reason}`);
if (consumptionPolicy.trustedReviewAuthorizationConsumers.length !== 0) fail("consumidor real foi inventado");
if (authorizationMemory.entries.length !== 0) fail("autorização canônica foi inventada");
if (consumptionMemory.entries.length !== 0) fail("consumo canônico foi inventado");

const bindings = {
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicyHash: authorizationPolicy.policyHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemoryHash: authorizationMemory.memoryHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicyHash: consumptionPolicy.policyHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemoryHash: consumptionMemory.memoryHash,
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
  "exactReviewBindingRequired", "exactFollowingSubsequentContinuationObservationBindingRequired",
  "exactFollowingSubsequentContinuationBindingRequired", "exactPackageDigestBindingRequired", "exactInventoryBindingRequired",
  "consumerIndependenceRequired", "consumerValidityAtConsumptionRequired", "signedConsumptionReceiptRequired",
  "appendOnlyConsumptionMemoryRequired", "duplicateAuthorizationConsumptionRejected", "atomicMemoryHeadBindingRequired",
  "singleUseConsumptionRequired",
]) if (consumptionPolicy[key] !== true || phase.consumptionRules[key] !== true) fail(`${key} desabilitado`);
if (consumptionPolicy.maximumUses !== 1 || phase.consumptionRules.maximumUses !== 1) {
  fail("consumo deixou de ser de uso único");
}
if (consumptionPolicy.authorizationConsumptionAllowed !== true) fail("consumo interno não habilitado");
for (const key of [
  "followingSubsequentContinuationAllowed", "publicationExecutionAllowed", "networkAccessAllowed", "databaseMutationAllowed",
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
  "followingSubsequentContinuationAllowed: false",
  "followingSubsequentContinuationExecuted: false",
  "publicationExecuted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);

if (phase.nextPhase?.phase !== 251 || phase.nextPhase?.name !== "Controlled Proof Execution Further Subsequent Continuation") {
  fail("próxima fase divergente");
}
if (readJson("config/evolution-program-3000.json").currentPhase < 250) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-250:assess", "evolution:phase-250:check"]) {
  if (!scripts[name]) fail(`script ausente: ${name}`);
}

console.log("[phase-250] PASS — uma autorização válida, assinada e registrada só pode ser consumida internamente uma vez; a próxima continuação e todos os efeitos externos permanecem bloqueados.");
