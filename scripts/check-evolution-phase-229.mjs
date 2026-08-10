import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionObservationMemory,
  inspectControlledProofExecutionObservationPolicy,
} from "../lib/release/controlled-proof-execution-observation.mjs";
import {
  inspectControlledProofExecutionStartMemory,
  inspectControlledProofExecutionStartPolicy,
} from "../lib/release/controlled-proof-execution-start.mjs";
import {
  inspectControlledProofExecutionStartAuthorizationMemory,
  inspectControlledProofExecutionStartAuthorizationPolicy,
} from "../lib/release/controlled-proof-execution-start-authorization.mjs";

const fail = (message) => { throw new Error(`[phase-229] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-229-controlled-proof-execution-observation.json",
  observationPolicy: "config/controlled-proof-execution-observation-policy.json",
  observationMemory: "config/controlled-proof-execution-observation-memory.json",
  startPolicy: "config/controlled-proof-execution-start-policy.json",
  startMemory: "config/controlled-proof-execution-start-memory.json",
  startAuthorizationPolicy: "config/controlled-proof-execution-start-authorization-policy.json",
  startAuthorizationMemory: "config/controlled-proof-execution-start-authorization-memory.json",
  documentation: "docs/EVOLUTION_PHASE_229_CONTROLLED_PROOF_EXECUTION_OBSERVATION.md",
  library: "lib/release/controlled-proof-execution-observation.mjs",
  runner: "scripts/run-controlled-proof-execution-observation-phase-229.mjs",
  test: "tests/contracts/controlled-proof-execution-observation.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(paths.phase);
const observationPolicy = readJson(paths.observationPolicy);
const observationMemory = readJson(paths.observationMemory);
const controlledProofExecutionStartPolicy = readJson(paths.startPolicy);
const controlledProofExecutionStartMemory = readJson(paths.startMemory);
const controlledProofExecutionStartAuthorizationPolicy = readJson(paths.startAuthorizationPolicy);
const controlledProofExecutionStartAuthorizationMemory = readJson(paths.startAuthorizationMemory);
const upstreamContext = {
  controlledExternalPublicationExecutionPermitConsumptionPolicy: readJson("config/controlled-external-publication-execution-permit-consumption-policy.json"),
  controlledExternalPublicationExecutionPermitGrantPolicy: readJson("config/controlled-external-publication-execution-permit-grant-policy.json"),
  controlledExternalPublicationExecutionAcceptancePolicy: readJson("config/controlled-external-publication-execution-acceptance-policy.json"),
  controlledExternalPublicationExecutionHandoffPolicy: readJson("config/controlled-external-publication-execution-handoff-policy.json"),
  controlledExternalPublicationAuthorizationConsumptionPolicy: readJson("config/controlled-external-publication-authorization-consumption-policy.json"),
  controlledExternalPublicationAuthorizationGrantPolicy: readJson("config/controlled-external-publication-authorization-grant-policy.json"),
  controlledExternalPublicationReviewPolicy: readJson("config/controlled-external-publication-authorization-review-policy.json"),
  publicationEvidenceAdjudicationPolicy: readJson("config/publication-execution-evidence-adjudication-policy.json"),
  executionPolicy: readJson("config/authorized-publication-execution-policy.json"),
  executionAuthorizationPolicy: readJson("config/authorized-publication-execution-authorization-policy.json"),
  publicationPolicy: readJson("config/authorized-package-publication-decision-policy.json"),
  evidencePolicy: readJson("config/authorized-package-evidence-commitment-policy.json"),
  assemblyPolicy: readJson("config/authorized-release-package-assembly-policy.json"),
  packageAuthorizationPolicy: readJson("config/approved-release-package-authorization-policy.json"),
};
const startContext = {
  controlledProofExecutionStartAuthorizationPolicy,
  ...upstreamContext,
};
if (phase.phase !== 229 || phase.status !== "implemented") fail("fase ou status inválido");
const observationContext = {
  controlledProofExecutionStartPolicy,
  trustedProofObservers: observationPolicy.trustedProofObservers,
  maximumObservationDelaySeconds: observationPolicy.maximumObservationDelaySeconds,
  ...startContext,
};
const inspections = [
  inspectControlledProofExecutionStartAuthorizationPolicy(controlledProofExecutionStartAuthorizationPolicy, upstreamContext),
  inspectControlledProofExecutionStartAuthorizationMemory(
    controlledProofExecutionStartAuthorizationMemory,
    { policy: controlledProofExecutionStartAuthorizationPolicy },
  ),
  inspectControlledProofExecutionStartPolicy(controlledProofExecutionStartPolicy, startContext),
  inspectControlledProofExecutionStartMemory(controlledProofExecutionStartMemory, { policy: controlledProofExecutionStartPolicy }),
  inspectControlledProofExecutionObservationPolicy(observationPolicy, observationContext),
  inspectControlledProofExecutionObservationMemory(observationMemory, { policy: observationPolicy }),
];
const failed = inspections.find((inspection) => !inspection.ok);
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);

if (controlledProofExecutionStartAuthorizationPolicy.trustedStartAuthorizers.length) fail("autorizador de início real foi inventado");
if (controlledProofExecutionStartPolicy.trustedStartExecutors.length) fail("executor de início real foi inventado");
if (observationPolicy.trustedProofObservers.length) fail("observador real foi inventado");
if (
  controlledProofExecutionStartAuthorizationMemory.entries.length ||
  controlledProofExecutionStartMemory.entries.length ||
  observationMemory.entries.length
) {
  fail("registro operacional canônico foi inventado");
}
const bindings = {
  controlledProofExecutionStartAuthorizationPolicyHash: controlledProofExecutionStartAuthorizationPolicy.policyHash,
  controlledProofExecutionStartAuthorizationMemoryHash: controlledProofExecutionStartAuthorizationMemory.memoryHash,
  controlledProofExecutionStartMemoryHash: controlledProofExecutionStartMemory.memoryHash,
  controlledProofExecutionStartPolicyHash: controlledProofExecutionStartPolicy.policyHash,
  controlledProofExecutionObservationPolicyHash: observationPolicy.policyHash,
  controlledProofExecutionObservationMemoryHash: observationMemory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) {
  if (phase.currentState[key] !== value) fail(`vínculo divergente: ${key}`);
}
for (const key of [
  "trustedStartAuthorizersConfigured", "trustedStartExecutorsConfigured", "trustedProofObserversConfigured",
  "recordedExecutionStarts", "recordedExecutionObservations", "observedExecutionStarts", "distinctObservations",
]) if (phase.currentState[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "controlledProofExecutionStartAuthorized", "controlledProofExecutionStarted", "controlledProofExecutionObserved",
  "controlledProofExecutionContinued", "publicationExecuted", "externalPublicationExecuted", "packageGenerated",
  "buildExecuted", "deployExecuted", "releasePromoted",
]) if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");

if (observationPolicy.controlledProofExecutionObservationAllowed !== true) fail("observação controlada não habilitada");
if (observationPolicy.controlledProofExecutionContinuationAllowed !== false) fail("continuação habilitada antecipadamente");
if (observationPolicy.maximumObservationsPerExecutionStart !== 1) fail("observação deixou de ser única");
if (observationPolicy.maximumObservationDelaySeconds !== 300) fail("janela canônica de observação divergente");
for (const key of [
  "publicationExecutionAllowed", "networkAccessAllowed", "databaseMutationAllowed", "externalPublicationAllowed",
  "automaticPublicationExecution", "automaticPackageGeneration", "automaticBuild", "automaticDeploy",
  "automaticReleasePromotion",
]) if (observationPolicy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "controlled_proof_execution_start_not_recorded",
  "controlled_proof_execution_start_already_observed",
  "controlled_proof_execution_observer_not_independent",
  "controlled_proof_execution_observation_window_expired",
  "controlled_proof_execution_observation_memory_head_binding_mismatch",
  "private_key_does_not_match_controlled_proof_execution_observer",
  "controlledProofExecutionObserved: true",
  "controlledProofExecutionContinued: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);

if (readJson("config/evolution-program-3000.json").currentPhase < 229) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-229:assess", "evolution:phase-229:check"]) {
  if (!scripts[name]) fail(`script ausente: ${name}`);
}

console.log("[phase-229] PASS — somente um início registrado, íntegro e ainda não observado recebe observação interna assinada por ator independente; continuação, publicação, rede, banco, build, deploy e promoção permanecem bloqueados.");
