import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionSubsequentContinuationObservationMemory,
} from "../lib/release/controlled-proof-execution-subsequent-continuation-observation.mjs";

const fail = (message) => { throw new Error(`[phase-237] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-237-controlled-proof-execution-subsequent-continuation-observation.json",
  policy: "config/controlled-proof-execution-subsequent-continuation-observation-policy.json",
  memory: "config/controlled-proof-execution-subsequent-continuation-observation-memory.json",
  subsequentPolicy: "config/controlled-proof-execution-subsequent-continuation-policy.json",
  subsequentMemory: "config/controlled-proof-execution-subsequent-continuation-memory.json",
  documentation: "docs/EVOLUTION_PHASE_237_CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION.md",
  library: "lib/release/controlled-proof-execution-subsequent-continuation-observation.mjs",
  runner: "scripts/run-controlled-proof-execution-subsequent-continuation-observation-phase-237.mjs",
  test: "tests/contracts/controlled-proof-execution-subsequent-continuation-observation.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

execFileSync(process.execPath, ["scripts/check-evolution-phase-236.mjs"], { stdio: "pipe" });
const readiness = JSON.parse(execFileSync(process.execPath, [paths.runner], { encoding: "utf8" }));
const phase = readJson(paths.phase);
const policy = readJson(paths.policy);
const memory = readJson(paths.memory);
const subsequentPolicy = readJson(paths.subsequentPolicy);
const subsequentMemory = readJson(paths.subsequentMemory);

if (phase.phase !== 237 || phase.status !== "implemented") fail("fase ou status inválido");
if (readiness.phase !== 237 || readiness.subsequentContinuationObservationAllowed !== true) {
  fail("diagnóstico de prontidão inválido");
}
if (readiness.readiness !== "awaiting_valid_recorded_subsequent_continuation_and_trusted_independent_observer") {
  fail("estado de prontidão divergente");
}
const memoryInspection = inspectControlledProofExecutionSubsequentContinuationObservationMemory(memory, { policy });
if (!memoryInspection.ok) fail(`memória canônica inválida: ${memoryInspection.reason}`);
if (policy.trustedSubsequentContinuationObservers.length !== 0) fail("observador real foi inventado");
if (subsequentMemory.entries.length !== 0) fail("continuação subsequente canônica foi inventada");
if (memory.entries.length !== 0) fail("observação canônica foi inventada");

const bindings = {
  controlledProofExecutionSubsequentContinuationPolicyHash: subsequentPolicy.policyHash,
  controlledProofExecutionSubsequentContinuationMemoryHash: subsequentMemory.memoryHash,
  controlledProofExecutionSubsequentContinuationObservationPolicyHash: policy.policyHash,
  controlledProofExecutionSubsequentContinuationObservationMemoryHash: memory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) {
  if (phase.currentState[key] !== value || readiness[key] !== value) fail(`vínculo divergente: ${key}`);
}
for (const key of [
  "trustedSubsequentContinuationObserversConfigured", "recordedSubsequentContinuations",
  "recordedSubsequentContinuationObservations", "observedSubsequentContinuations",
]) if (phase.currentState[key] !== 0 || readiness[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "subsequentContinuationExecuted", "subsequentContinuationObserved", "publicationExecuted",
  "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted",
]) if (phase.currentState[key] !== false || readiness[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");

for (const key of [
  "recordedSignedSubsequentContinuationRequired", "exactSubsequentContinuationReceiptBindingRequired",
  "exactSubsequentContinuationPolicyBindingRequired", "exactSubsequentContinuationMemoryBindingRequired",
  "exactAuthorizationConsumptionBindingRequired", "exactReviewAuthorizationBindingRequired",
  "exactReviewBindingRequired", "exactContinuationObservationBindingRequired",
  "exactPriorContinuationBindingRequired", "exactExecutionStartBindingRequired",
  "exactPackageDigestBindingRequired", "exactInventoryBindingRequired",
  "subsequentContinuationSignatureVerificationRequired", "observerIndependenceRequired",
  "observerValidityAtObservationRequired", "appendOnlyObservationMemoryRequired",
  "duplicateSubsequentContinuationRejected", "atomicMemoryHeadBindingRequired",
  "signedObservationRequired", "singleObservationPerSubsequentContinuationRequired",
]) if (policy[key] !== true || phase.observationRules[key] !== true) fail(`${key} desabilitado`);
if (policy.maximumObservationsPerSubsequentContinuation !== 1 ||
    phase.observationRules.maximumObservationsPerSubsequentContinuation !== 1) {
  fail("observação deixou de ser de uso único");
}
if (policy.maximumSubsequentContinuationObservationDelaySeconds !== 300 ||
    phase.observationRules.maximumSubsequentContinuationObservationDelaySeconds !== 300) {
  fail("janela de observação divergente");
}
if (policy.subsequentContinuationObservationAllowed !== true) fail("observação interna não habilitada");
for (const key of [
  "subsequentContinuationObservationReviewAllowed", "publicationExecutionAllowed", "networkAccessAllowed",
  "databaseMutationAllowed", "externalPublicationAllowed", "automaticPublicationExecution",
  "automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
]) if (policy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "controlled_proof_execution_subsequent_continuation_observation_memory_head_binding_mismatch",
  "controlled_proof_execution_subsequent_continuation_already_observed",
  "controlled_proof_execution_subsequent_continuation_observation_delay_exceeded",
  "controlled_proof_execution_subsequent_continuation_not_recorded",
  "controlled_proof_execution_subsequent_continuation_observer_not_independent",
  "private_key_does_not_match_controlled_proof_execution_subsequent_continuation_observer",
  "subsequentContinuationObserved: true",
  "publicationExecuted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);

if (phase.nextPhase?.phase !== 238 ||
    phase.nextPhase?.name !== "Controlled Proof Execution Subsequent Continuation Observation Review") {
  fail("próxima fase divergente");
}
if (readJson("config/evolution-program-3000.json").currentPhase < 237) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-237:assess", "evolution:phase-237:check"]) {
  if (!scripts[name]) fail(`script ausente: ${name}`);
}

console.log("[phase-237] PASS — somente uma continuação subsequente válida, assinada e registrada pode receber uma observação interna independente, assinada e de uso único; revisão e efeitos externos permanecem bloqueados.");
