import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory,
} from "../lib/release/controlled-proof-execution-following-subsequent-continuation-observation-review.mjs";

const fail = (message) => { throw new Error(`[phase-248] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-248-controlled-proof-execution-following-subsequent-continuation-observation-review.json",
  policy: "config/controlled-proof-execution-following-subsequent-continuation-observation-review-policy.json",
  memory: "config/controlled-proof-execution-following-subsequent-continuation-observation-review-memory.json",
  observationPolicy: "config/controlled-proof-execution-following-subsequent-continuation-observation-policy.json",
  observationMemory: "config/controlled-proof-execution-following-subsequent-continuation-observation-memory.json",
  documentation: "docs/EVOLUTION_PHASE_248_CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW.md",
  library: "lib/release/controlled-proof-execution-following-subsequent-continuation-observation-review.mjs",
  runner: "scripts/run-controlled-proof-execution-following-subsequent-continuation-observation-review-phase-248.mjs",
  test: "tests/contracts/controlled-proof-execution-following-subsequent-continuation-observation-review.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

execFileSync(process.execPath, ["scripts/check-evolution-phase-247.mjs"], { stdio: "pipe" });
const readiness = JSON.parse(execFileSync(process.execPath, [paths.runner], { encoding: "utf8" }));
const phase = readJson(paths.phase);
const policy = readJson(paths.policy);
const memory = readJson(paths.memory);
const observationPolicy = readJson(paths.observationPolicy);
const observationMemory = readJson(paths.observationMemory);

if (phase.phase !== 248 || phase.status !== "implemented") fail("fase ou status inválido");
if (readiness.phase !== 248 || readiness.nextSubsequentContinuationObservationReviewAllowed !== true) {
  fail("diagnóstico de prontidão inválido");
}
if (readiness.readiness !== "awaiting_valid_recorded_next_subsequent_continuation_observation_and_trusted_independent_reviewer") {
  fail("estado de prontidão divergente");
}
const memoryInspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory(memory, { policy });
if (!memoryInspection.ok) fail(`memória canônica inválida: ${memoryInspection.reason}`);
if (policy.trustedFollowingSubsequentContinuationObservationReviewers.length !== 0) fail("revisor real foi inventado");
if (observationMemory.entries.length !== 0) fail("observação canônica foi inventada");
if (memory.entries.length !== 0) fail("revisão canônica foi inventada");

const bindings = {
  controlledProofExecutionFollowingSubsequentContinuationObservationPolicyHash: observationPolicy.policyHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationMemoryHash: observationMemory.memoryHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicyHash: policy.policyHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemoryHash: memory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) {
  if (phase.currentState[key] !== value || readiness[key] !== value) fail(`vínculo divergente: ${key}`);
}
for (const key of [
  "trustedFollowingSubsequentContinuationObservationReviewersConfigured",
  "recordedFollowingSubsequentContinuationObservations",
  "recordedFollowingSubsequentContinuationObservationReviews",
  "reviewedFollowingSubsequentContinuationObservations",
  "acceptedFollowingSubsequentContinuationObservations",
  "rejectedFollowingSubsequentContinuationObservations",
]) if (phase.currentState[key] !== 0 || readiness[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "nextSubsequentContinuationObservationAccepted", "nextSubsequentContinuationObservationReviewAuthorizationAllowed",
  "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted",
  "deployExecuted", "releasePromoted",
]) if (phase.currentState[key] !== false || readiness[key] !== false) fail(`${key} marcado indevidamente`);
if (phase.currentState.nextSubsequentContinuationObservationReviewAllowed !== true) fail("revisão interna não habilitada");
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");

for (const key of [
  "recordedObservationRequired", "exactObservationReceiptBindingRequired",
  "exactObservationPolicyBindingRequired", "exactObservationMemoryBindingRequired",
  "exactFollowingSubsequentContinuationBindingRequired", "exactUpstreamChainBindingRequired",
  "exactPackageDigestBindingRequired", "exactInventoryBindingRequired",
  "observationSignatureVerificationRequired", "reviewerIndependenceRequired",
  "reviewerValidityAtReviewRequired", "appendOnlyReviewMemoryRequired",
  "duplicateObservationReviewRejected", "atomicMemoryHeadBindingRequired",
  "signedReviewRequired", "singleReviewPerObservationRequired",
]) if (policy[key] !== true || phase.reviewRules[key] !== true) fail(`${key} desabilitado`);
if (policy.maximumReviewsPerObservation !== 1 || phase.reviewRules.maximumReviewsPerObservation !== 1) {
  fail("revisão deixou de ser de uso único");
}
if (policy.maximumFollowingSubsequentContinuationObservationReviewDelaySeconds !== 900 ||
    phase.reviewRules.maximumFollowingSubsequentContinuationObservationReviewDelaySeconds !== 900) {
  fail("janela de revisão divergente");
}
if (policy.minimumFollowingSubsequentContinuationObservationReviewReasonLength !== 12 ||
    phase.reviewRules.minimumFollowingSubsequentContinuationObservationReviewReasonLength !== 12) {
  fail("justificativa mínima divergente");
}
if (policy.nextSubsequentContinuationObservationReviewAllowed !== true) fail("revisão interna não habilitada");
for (const key of [
  "nextSubsequentContinuationObservationReviewAuthorizationAllowed", "publicationExecutionAllowed",
  "networkAccessAllowed", "databaseMutationAllowed", "externalPublicationAllowed",
  "automaticPublicationExecution", "automaticPackageGeneration", "automaticBuild",
  "automaticDeploy", "automaticReleasePromotion",
]) if (policy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "controlled_proof_execution_next_subsequent_continuation_observation_review_memory_head_binding_mismatch",
  "controlled_proof_execution_next_subsequent_continuation_observation_already_reviewed",
  "controlled_proof_execution_next_subsequent_continuation_observation_review_window_expired",
  "controlled_proof_execution_next_subsequent_continuation_observation_not_recorded",
  "controlled_proof_execution_next_subsequent_continuation_observation_reviewer_not_independent",
  "private_key_does_not_match_controlled_proof_execution_next_subsequent_continuation_observation_reviewer",
  "nextSubsequentContinuationObservationAccepted: verdict.accepted",
  "publicationExecuted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);

if (phase.nextPhase?.phase !== 249 ||
    phase.nextPhase?.name !== "Controlled Proof Execution Following Subsequent Continuation Observation Review Authorization") {
  fail("próxima fase divergente");
}
if (readJson("config/evolution-program-3000.json").currentPhase < 248) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-248:assess", "evolution:phase-248:check"]) {
  if (!scripts[name]) fail(`script ausente: ${name}`);
}

console.log("[phase-248] PASS — somente uma observação válida, assinada e registrada pode receber uma revisão interna independente, assinada e de uso único; autorização e efeitos externos permanecem bloqueados.");
