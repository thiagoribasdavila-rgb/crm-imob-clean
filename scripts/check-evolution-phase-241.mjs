import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionNextSubsequentContinuationMemory,
} from "../lib/release/controlled-proof-execution-next-subsequent-continuation.mjs";

const fail = (message) => { throw new Error(`[phase-241] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-241-controlled-proof-execution-next-subsequent-continuation.json",
  policy: "config/controlled-proof-execution-next-subsequent-continuation-policy.json",
  memory: "config/controlled-proof-execution-next-subsequent-continuation-memory.json",
  consumptionPolicy: "config/controlled-proof-execution-subsequent-continuation-observation-review-authorization-consumption-policy.json",
  consumptionMemory: "config/controlled-proof-execution-subsequent-continuation-observation-review-authorization-consumption-memory.json",
  documentation: "docs/EVOLUTION_PHASE_241_CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION.md",
  library: "lib/release/controlled-proof-execution-next-subsequent-continuation.mjs",
  runner: "scripts/run-controlled-proof-execution-next-subsequent-continuation-phase-241.mjs",
  test: "tests/contracts/controlled-proof-execution-next-subsequent-continuation.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

execFileSync(process.execPath, ["scripts/check-evolution-phase-240.mjs"], { stdio: "pipe" });
const readiness = JSON.parse(execFileSync(process.execPath, [paths.runner], { encoding: "utf8" }));
const phase = readJson(paths.phase);
const policy = readJson(paths.policy);
const memory = readJson(paths.memory);
const consumptionPolicy = readJson(paths.consumptionPolicy);
const consumptionMemory = readJson(paths.consumptionMemory);

if (phase.phase !== 241 || phase.status !== "implemented") fail("fase ou status inválido");
if (readiness.phase !== 241 || readiness.nextSubsequentContinuationAllowed !== true) {
  fail("diagnóstico de prontidão inválido");
}
if (readiness.readiness !== "awaiting_recorded_signed_authorization_consumption_and_trusted_independent_next_subsequent_continuation_executor") {
  fail("estado de prontidão divergente");
}
const memoryInspection = inspectControlledProofExecutionNextSubsequentContinuationMemory(memory, { policy });
if (!memoryInspection.ok) fail(`memória canônica inválida: ${memoryInspection.reason}`);
if (policy.trustedNextSubsequentContinuationExecutors.length !== 0) fail("executor real foi inventado");
if (consumptionMemory.entries.length !== 0) fail("consumo de autorização canônico foi inventado");
if (memory.entries.length !== 0) fail("próxima continuação canônica foi inventada");

const bindings = {
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicyHash:
    consumptionPolicy.policyHash,
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemoryHash:
    consumptionMemory.memoryHash,
  controlledProofExecutionNextSubsequentContinuationPolicyHash: policy.policyHash,
  controlledProofExecutionNextSubsequentContinuationMemoryHash: memory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) {
  if (phase.currentState[key] !== value || readiness[key] !== value) fail(`vínculo divergente: ${key}`);
}
for (const key of [
  "trustedNextSubsequentContinuationExecutorsConfigured",
  "recordedAuthorizationConsumptions",
  "recordedNextSubsequentContinuations",
  "consumedAuthorizationConsumptions",
]) if (phase.currentState[key] !== 0 || readiness[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "subsequentContinuationAuthorizationConsumed", "nextSubsequentContinuationAuthorizationConsumed",
  "nextSubsequentContinuationExecuted", "nextSubsequentContinuationObserved", "publicationExecuted",
  "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted",
]) if (phase.currentState[key] !== false || readiness[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");

for (const key of [
  "recordedSignedAuthorizationConsumptionRequired", "exactConsumptionReceiptBindingRequired",
  "exactConsumptionPolicyBindingRequired", "exactConsumptionMemoryBindingRequired",
  "exactReviewAuthorizationBindingRequired", "exactReviewBindingRequired",
  "exactSubsequentContinuationObservationBindingRequired", "exactPriorSubsequentContinuationBindingRequired",
  "exactContinuationObservationBindingRequired", "exactPriorContinuationBindingRequired",
  "exactExecutionStartBindingRequired", "exactPackageDigestBindingRequired", "exactInventoryBindingRequired",
  "executorIndependenceRequired", "executorValidityAtContinuationRequired",
  "authorizationValidityAtContinuationRequired", "signedNextSubsequentContinuationReceiptRequired",
  "appendOnlyNextSubsequentContinuationMemoryRequired", "duplicateConsumptionContinuationRejected",
  "atomicMemoryHeadBindingRequired", "singleUseNextSubsequentContinuationRequired",
]) if (policy[key] !== true || phase.continuationRules[key] !== true) fail(`${key} desabilitado`);
if (policy.maximumNextSubsequentContinuations !== 1 || phase.continuationRules.maximumNextSubsequentContinuations !== 1) {
  fail("próxima continuação deixou de ser de uso único");
}
if (policy.nextSubsequentContinuationAllowed !== true) fail("próxima continuação interna não habilitada");
for (const key of [
  "nextSubsequentContinuationObservationAllowed", "publicationExecutionAllowed", "networkAccessAllowed",
  "databaseMutationAllowed", "externalPublicationAllowed", "automaticPublicationExecution",
  "automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
]) if (policy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "recorded_signed_authorization_consumption_required_for_subsequent_continuation",
  "controlled_proof_execution_authorization_consumption_not_recorded",
  "controlled_proof_execution_next_subsequent_continuation_after_authorization_expiration",
  "controlled_proof_execution_next_subsequent_continuation_executor_not_independent",
  "private_key_does_not_match_controlled_proof_execution_next_subsequent_continuation_executor",
  "remainingNextSubsequentContinuations: 0",
  "nextSubsequentContinuationObserved: false",
  "publicationExecuted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);

if (phase.nextPhase?.phase !== 242 || phase.nextPhase?.name !== "Controlled Proof Execution Next Subsequent Continuation Observation") {
  fail("próxima fase divergente");
}
if (readJson("config/evolution-program-3000.json").currentPhase < 241) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-241:assess", "evolution:phase-241:check"]) {
  if (!scripts[name]) fail(`script ausente: ${name}`);
}

console.log("[phase-241] PASS — a próxima continuação interna exige consumo válido, assinado e registrado, uso único e executor independente; observação e todos os efeitos externos permanecem bloqueados.");
