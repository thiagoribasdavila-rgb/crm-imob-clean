import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory,
} from "../lib/release/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization.mjs";

const fail = (message) => { throw new Error(`[phase-244] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-244-controlled-proof-execution-next-subsequent-continuation-observation-review-authorization.json",
  policy: "config/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-policy.json",
  memory: "config/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-memory.json",
  reviewPolicy: "config/controlled-proof-execution-next-subsequent-continuation-observation-review-policy.json",
  reviewMemory: "config/controlled-proof-execution-next-subsequent-continuation-observation-review-memory.json",
  documentation: "docs/EVOLUTION_PHASE_244_CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION.md",
  library: "lib/release/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization.mjs",
  runner: "scripts/run-controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-phase-244.mjs",
  test: "tests/contracts/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

execFileSync(process.execPath, ["scripts/check-evolution-phase-243.mjs"], { stdio: "pipe" });
const readiness = JSON.parse(execFileSync(process.execPath, [paths.runner], { encoding: "utf8" }));
const phase = readJson(paths.phase);
const policy = readJson(paths.policy);
const memory = readJson(paths.memory);
const reviewPolicy = readJson(paths.reviewPolicy);
const reviewMemory = readJson(paths.reviewMemory);

if (phase.phase !== 244 || phase.status !== "implemented") fail("fase ou status inválido");
if (readiness.phase !== 244 || readiness.nextSubsequentContinuationAuthorizationAllowed !== true) {
  fail("diagnóstico de prontidão inválido");
}
if (readiness.readiness !== "awaiting_accepted_signed_recorded_review_and_trusted_independent_authorizer") {
  fail("estado de prontidão divergente");
}
const memoryInspection = inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory(
  memory,
  { policy },
);
if (!memoryInspection.ok) fail(`memória canônica inválida: ${memoryInspection.reason}`);
if (policy.trustedReviewAuthorizers.length !== 0) fail("autorizador real foi inventado");
if (reviewMemory.entries.length !== 0) fail("revisão canônica foi inventada");
if (memory.entries.length !== 0) fail("autorização canônica foi inventada");

const bindings = {
  controlledProofExecutionNextSubsequentContinuationObservationReviewPolicyHash: reviewPolicy.policyHash,
  controlledProofExecutionNextSubsequentContinuationObservationReviewMemoryHash: reviewMemory.memoryHash,
  controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicyHash: policy.policyHash,
  controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemoryHash: memory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) {
  if (phase.currentState[key] !== value || readiness[key] !== value) fail(`vínculo divergente: ${key}`);
}
for (const key of [
  "trustedReviewAuthorizersConfigured", "recordedReviews", "recordedReviewAuthorizations",
  "acceptedReviewsAuthorized",
]) if (phase.currentState[key] !== 0 || readiness[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "nextSubsequentContinuationAuthorized", "nextSubsequentContinuationExecuted", "publicationExecuted",
  "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted",
]) if (phase.currentState[key] !== false || readiness[key] !== false) fail(`${key} marcado indevidamente`);
if (phase.currentState.nextSubsequentContinuationAuthorizationAllowed !== true) fail("autorização interna não habilitada");
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
if (policy.maximumNextSubsequentContinuations !== 1 || phase.authorizationRules.maximumNextSubsequentContinuations !== 1) {
  fail("autorização deixou de ser de uso único");
}
if (policy.maximumReviewAuthorizationDelaySeconds !== 300 ||
    phase.authorizationRules.maximumReviewAuthorizationDelaySeconds !== 300 ||
    policy.maximumReviewAuthorizationTtlSeconds !== 300 ||
    phase.authorizationRules.maximumReviewAuthorizationTtlSeconds !== 300) {
  fail("limites da autorização divergentes");
}
if (policy.nextSubsequentContinuationAuthorizationAllowed !== true) fail("emissão interna de autorização não habilitada");
for (const key of [
  "nextSubsequentContinuationAllowed", "publicationExecutionAllowed", "networkAccessAllowed", "databaseMutationAllowed",
  "externalPublicationAllowed", "automaticPublicationExecution", "automaticPackageGeneration", "automaticBuild",
  "automaticDeploy", "automaticReleasePromotion",
]) if (policy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "controlled_proof_execution_next_subsequent_continuation_observation_review_not_recorded_as_accepted",
  "controlled_proof_execution_next_subsequent_continuation_observation_review_not_accepted",
  "controlled_proof_execution_next_subsequent_continuation_observation_review_already_authorized",
  "controlled_proof_execution_next_subsequent_continuation_observation_review_authorizer_not_independent",
  "controlled_proof_execution_next_subsequent_continuation_observation_review_authorization_window_expired",
  "controlled_proof_execution_next_subsequent_continuation_observation_review_authorization_ttl_invalid",
  "controlled_proof_execution_next_subsequent_continuation_observation_review_authorization_memory_head_binding_mismatch",
  "private_key_does_not_match_controlled_proof_execution_next_subsequent_continuation_observation_review_authorizer",
  "remainingNextSubsequentContinuations: 1",
  "nextSubsequentContinuationExecuted: false",
  "publicationExecuted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);

if (phase.nextPhase?.phase !== 245 ||
    phase.nextPhase?.name !== "Controlled Proof Execution Next Subsequent Continuation Observation Review Authorization Consumption") {
  fail("próxima fase divergente");
}
if (readJson("config/evolution-program-3000.json").currentPhase < 244) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-244:assess", "evolution:phase-244:check"]) {
  if (!scripts[name]) fail(`script ausente: ${name}`);
}

console.log("[phase-244] PASS — somente uma revisão aceita, assinada e registrada pode gerar autorização interna, curta, independente e de uso único; nenhuma continuação ou efeito externo foi executado.");
