import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionNextSubsequentContinuationObservationMemory,
} from "../lib/release/controlled-proof-execution-next-subsequent-continuation-observation.mjs";

const fail = (message) => { throw new Error(`[phase-242] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-242-controlled-proof-execution-next-subsequent-continuation-observation.json",
  policy: "config/controlled-proof-execution-next-subsequent-continuation-observation-policy.json",
  memory: "config/controlled-proof-execution-next-subsequent-continuation-observation-memory.json",
  continuationPolicy: "config/controlled-proof-execution-next-subsequent-continuation-policy.json",
  continuationMemory: "config/controlled-proof-execution-next-subsequent-continuation-memory.json",
  documentation: "docs/EVOLUTION_PHASE_242_CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_OBSERVATION.md",
  library: "lib/release/controlled-proof-execution-next-subsequent-continuation-observation.mjs",
  runner: "scripts/run-controlled-proof-execution-next-subsequent-continuation-observation-phase-242.mjs",
  test: "tests/contracts/controlled-proof-execution-next-subsequent-continuation-observation.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

execFileSync(process.execPath, ["scripts/check-evolution-phase-241.mjs"], { stdio: "pipe" });
const readiness = JSON.parse(execFileSync(process.execPath, [paths.runner], { encoding: "utf8" }));
const phase = readJson(paths.phase);
const policy = readJson(paths.policy);
const memory = readJson(paths.memory);
const continuationPolicy = readJson(paths.continuationPolicy);
const continuationMemory = readJson(paths.continuationMemory);

if (phase.phase !== 242 || phase.status !== "implemented") fail("fase ou status inválido");
if (readiness.phase !== 242 || readiness.nextSubsequentContinuationObservationAllowed !== true) {
  fail("diagnóstico de prontidão inválido");
}
if (readiness.readiness !== "awaiting_valid_recorded_next_subsequent_continuation_and_trusted_independent_observer") {
  fail("estado de prontidão divergente");
}
const memoryInspection = inspectControlledProofExecutionNextSubsequentContinuationObservationMemory(memory, { policy });
if (!memoryInspection.ok) fail(`memória canônica inválida: ${memoryInspection.reason}`);
if (policy.trustedNextSubsequentContinuationObservers.length !== 0) fail("observador real foi inventado");
if (continuationMemory.entries.length !== 0) fail("próxima continuação canônica foi inventada");
if (memory.entries.length !== 0) fail("observação canônica foi inventada");

const bindings = {
  controlledProofExecutionNextSubsequentContinuationPolicyHash: continuationPolicy.policyHash,
  controlledProofExecutionNextSubsequentContinuationMemoryHash: continuationMemory.memoryHash,
  controlledProofExecutionNextSubsequentContinuationObservationPolicyHash: policy.policyHash,
  controlledProofExecutionNextSubsequentContinuationObservationMemoryHash: memory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) {
  if (phase.currentState[key] !== value || readiness[key] !== value) fail(`vínculo divergente: ${key}`);
}
for (const key of [
  "trustedNextSubsequentContinuationObserversConfigured", "recordedNextSubsequentContinuations",
  "recordedNextSubsequentContinuationObservations", "observedNextSubsequentContinuations",
]) if (phase.currentState[key] !== 0 || readiness[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "nextSubsequentContinuationExecuted", "nextSubsequentContinuationObserved", "publicationExecuted",
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
  "nextSubsequentContinuationSignatureVerificationRequired", "observerIndependenceRequired",
  "observerValidityAtObservationRequired", "appendOnlyObservationMemoryRequired",
  "duplicateSubsequentContinuationRejected", "atomicMemoryHeadBindingRequired",
  "signedObservationRequired", "singleObservationPerSubsequentContinuationRequired",
]) if (policy[key] !== true || phase.observationRules[key] !== true) fail(`${key} desabilitado`);
if (policy.maximumObservationsPerSubsequentContinuation !== 1 ||
    phase.observationRules.maximumObservationsPerSubsequentContinuation !== 1) {
  fail("observação deixou de ser de uso único");
}
if (policy.maximumNextSubsequentContinuationObservationDelaySeconds !== 300 ||
    phase.observationRules.maximumNextSubsequentContinuationObservationDelaySeconds !== 300) {
  fail("janela de observação divergente");
}
if (policy.nextSubsequentContinuationObservationAllowed !== true) fail("observação interna não habilitada");
for (const key of [
  "nextSubsequentContinuationObservationReviewAllowed", "publicationExecutionAllowed", "networkAccessAllowed",
  "databaseMutationAllowed", "externalPublicationAllowed", "automaticPublicationExecution",
  "automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
]) if (policy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "controlled_proof_execution_next_subsequent_continuation_observation_memory_head_binding_mismatch",
  "controlled_proof_execution_next_subsequent_continuation_already_observed",
  "controlled_proof_execution_next_subsequent_continuation_observation_delay_exceeded",
  "controlled_proof_execution_next_subsequent_continuation_not_recorded",
  "controlled_proof_execution_next_subsequent_continuation_observer_not_independent",
  "private_key_does_not_match_controlled_proof_execution_next_subsequent_continuation_observer",
  "nextSubsequentContinuationObserved: true",
  "publicationExecuted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);

if (phase.nextPhase?.phase !== 243 ||
    phase.nextPhase?.name !== "Controlled Proof Execution Next Subsequent Continuation Observation Review") {
  fail("próxima fase divergente");
}
if (readJson("config/evolution-program-3000.json").currentPhase < 242) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-242:assess", "evolution:phase-242:check"]) {
  if (!scripts[name]) fail(`script ausente: ${name}`);
}

console.log("[phase-242] PASS — somente uma próxima continuação válida, assinada e registrada pode receber observação interna independente, assinada e de uso único; revisão e efeitos externos permanecem bloqueados.");
