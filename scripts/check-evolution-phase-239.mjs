import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory,
} from "../lib/release/controlled-proof-execution-subsequent-continuation-observation-review-authorization.mjs";

const fail = (message) => { throw new Error(`[phase-239] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-239-controlled-proof-execution-subsequent-continuation-observation-review-authorization.json",
  policy: "config/controlled-proof-execution-subsequent-continuation-observation-review-authorization-policy.json",
  memory: "config/controlled-proof-execution-subsequent-continuation-observation-review-authorization-memory.json",
  reviewPolicy: "config/controlled-proof-execution-subsequent-continuation-observation-review-policy.json",
  reviewMemory: "config/controlled-proof-execution-subsequent-continuation-observation-review-memory.json",
  documentation: "docs/EVOLUTION_PHASE_239_CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION.md",
  library: "lib/release/controlled-proof-execution-subsequent-continuation-observation-review-authorization.mjs",
  runner: "scripts/run-controlled-proof-execution-subsequent-continuation-observation-review-authorization-phase-239.mjs",
  test: "tests/contracts/controlled-proof-execution-subsequent-continuation-observation-review-authorization.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

execFileSync(process.execPath, ["scripts/check-evolution-phase-238.mjs"], { stdio: "pipe" });
const readiness = JSON.parse(execFileSync(process.execPath, [paths.runner], { encoding: "utf8" }));
const phase = readJson(paths.phase);
const policy = readJson(paths.policy);
const memory = readJson(paths.memory);
const reviewPolicy = readJson(paths.reviewPolicy);
const reviewMemory = readJson(paths.reviewMemory);

if (phase.phase !== 239 || phase.status !== "implemented") fail("fase ou status inválido");
if (readiness.phase !== 239 || readiness.subsequentContinuationAuthorizationAllowed !== true) {
  fail("diagnóstico de prontidão inválido");
}
if (readiness.readiness !== "awaiting_accepted_signed_recorded_review_and_trusted_independent_authorizer") {
  fail("estado de prontidão divergente");
}
const memoryInspection = inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory(
  memory,
  { policy },
);
if (!memoryInspection.ok) fail(`memória canônica inválida: ${memoryInspection.reason}`);
if (policy.trustedReviewAuthorizers.length !== 0) fail("autorizador real foi inventado");
if (reviewMemory.entries.length !== 0) fail("revisão canônica foi inventada");
if (memory.entries.length !== 0) fail("autorização canônica foi inventada");

const bindings = {
  controlledProofExecutionSubsequentContinuationObservationReviewPolicyHash: reviewPolicy.policyHash,
  controlledProofExecutionSubsequentContinuationObservationReviewMemoryHash: reviewMemory.memoryHash,
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicyHash: policy.policyHash,
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemoryHash: memory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) {
  if (phase.currentState[key] !== value || readiness[key] !== value) fail(`vínculo divergente: ${key}`);
}
for (const key of [
  "trustedReviewAuthorizersConfigured", "recordedReviews", "recordedReviewAuthorizations",
  "acceptedReviewsAuthorized",
]) if (phase.currentState[key] !== 0 || readiness[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "subsequentContinuationAuthorized", "subsequentContinuationExecuted", "publicationExecuted",
  "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted",
]) if (phase.currentState[key] !== false || readiness[key] !== false) fail(`${key} marcado indevidamente`);
if (phase.currentState.subsequentContinuationAuthorizationAllowed !== true) fail("autorização interna não habilitada");
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");

for (const key of [
  "acceptedSignedRecordedReviewRequired", "exactReviewReceiptBindingRequired", "exactReviewPolicyBindingRequired",
  "exactReviewMemoryBindingRequired", "exactContinuationObservationBindingRequired", "exactContinuationBindingRequired",
  "exactPriorAuthorizationBindingRequired", "exactPriorObservationBindingRequired", "exactExecutionStartBindingRequired",
  "exactPackageDigestBindingRequired", "exactInventoryBindingRequired", "reviewSignatureVerificationRequired",
  "authorizerIndependenceRequired", "authorizerValidityAcrossAuthorizationRequired", "appendOnlyAuthorizationMemoryRequired",
  "duplicateReviewAuthorizationRejected", "atomicMemoryHeadBindingRequired", "signedAuthorizationRequired",
  "shortLivedAuthorizationRequired", "singleUseAuthorizationRequired",
]) if (policy[key] !== true || phase.authorizationRules[key] !== true) fail(`${key} desabilitado`);
if (policy.maximumSubsequentContinuations !== 1 || phase.authorizationRules.maximumSubsequentContinuations !== 1) {
  fail("autorização deixou de ser de uso único");
}
if (policy.maximumReviewAuthorizationDelaySeconds !== 300 ||
    phase.authorizationRules.maximumReviewAuthorizationDelaySeconds !== 300 ||
    policy.maximumReviewAuthorizationTtlSeconds !== 300 ||
    phase.authorizationRules.maximumReviewAuthorizationTtlSeconds !== 300) {
  fail("limites da autorização divergentes");
}
if (policy.subsequentContinuationAuthorizationAllowed !== true) fail("emissão interna de autorização não habilitada");
for (const key of [
  "subsequentContinuationAllowed", "publicationExecutionAllowed", "networkAccessAllowed", "databaseMutationAllowed",
  "externalPublicationAllowed", "automaticPublicationExecution", "automaticPackageGeneration", "automaticBuild",
  "automaticDeploy", "automaticReleasePromotion",
]) if (policy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "controlled_proof_execution_subsequent_continuation_observation_review_not_recorded_as_accepted",
  "controlled_proof_execution_subsequent_continuation_observation_review_not_accepted",
  "controlled_proof_execution_subsequent_continuation_observation_review_already_authorized",
  "controlled_proof_execution_subsequent_continuation_observation_review_authorizer_not_independent",
  "controlled_proof_execution_subsequent_continuation_observation_review_authorization_window_expired",
  "controlled_proof_execution_subsequent_continuation_observation_review_authorization_ttl_invalid",
  "controlled_proof_execution_subsequent_continuation_observation_review_authorization_memory_head_binding_mismatch",
  "private_key_does_not_match_controlled_proof_execution_subsequent_continuation_observation_review_authorizer",
  "remainingSubsequentContinuations: 1",
  "subsequentContinuationExecuted: false",
  "publicationExecuted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);

if (phase.nextPhase?.phase !== 240 ||
    phase.nextPhase?.name !== "Controlled Proof Execution Subsequent Continuation Observation Review Authorization Consumption") {
  fail("próxima fase divergente");
}
if (readJson("config/evolution-program-3000.json").currentPhase < 239) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-239:assess", "evolution:phase-239:check"]) {
  if (!scripts[name]) fail(`script ausente: ${name}`);
}

console.log("[phase-239] PASS — somente uma revisão aceita, assinada e registrada pode gerar autorização interna, curta, independente e de uso único; nenhuma continuação ou efeito externo foi executado.");
