import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionContinuationAuthorizationMemory,
  inspectControlledProofExecutionContinuationAuthorizationPolicy,
} from "../lib/release/controlled-proof-execution-continuation-authorization.mjs";
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

const fail = (message) => { throw new Error(`[phase-230] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-230-controlled-proof-execution-continuation-authorization.json",
  continuationAuthorizationPolicy: "config/controlled-proof-execution-continuation-authorization-policy.json",
  continuationAuthorizationMemory: "config/controlled-proof-execution-continuation-authorization-memory.json",
  observationPolicy: "config/controlled-proof-execution-observation-policy.json",
  observationMemory: "config/controlled-proof-execution-observation-memory.json",
  startPolicy: "config/controlled-proof-execution-start-policy.json",
  startMemory: "config/controlled-proof-execution-start-memory.json",
  startAuthorizationPolicy: "config/controlled-proof-execution-start-authorization-policy.json",
  startAuthorizationMemory: "config/controlled-proof-execution-start-authorization-memory.json",
  documentation: "docs/EVOLUTION_PHASE_230_CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZATION.md",
  library: "lib/release/controlled-proof-execution-continuation-authorization.mjs",
  runner: "scripts/run-controlled-proof-execution-continuation-authorization-phase-230.mjs",
  test: "tests/contracts/controlled-proof-execution-continuation-authorization.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(paths.phase);
const continuationAuthorizationPolicy = readJson(paths.continuationAuthorizationPolicy);
const continuationAuthorizationMemory = readJson(paths.continuationAuthorizationMemory);
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
const startContext = { controlledProofExecutionStartAuthorizationPolicy, ...upstreamContext };
const observationContext = {
  controlledProofExecutionStartPolicy,
  trustedProofObservers: observationPolicy.trustedProofObservers,
  maximumObservationDelaySeconds: observationPolicy.maximumObservationDelaySeconds,
  ...startContext,
};
const continuationContext = {
  controlledProofExecutionObservationPolicy: observationPolicy,
  trustedContinuationAuthorizers: continuationAuthorizationPolicy.trustedContinuationAuthorizers,
  maximumAuthorizationDelaySeconds: continuationAuthorizationPolicy.maximumAuthorizationDelaySeconds,
  maximumAuthorizationTtlSeconds: continuationAuthorizationPolicy.maximumAuthorizationTtlSeconds,
  ...observationContext,
};

if (phase.phase !== 230 || phase.status !== "implemented") fail("fase ou status inválido");
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
  inspectControlledProofExecutionContinuationAuthorizationPolicy(continuationAuthorizationPolicy, continuationContext),
  inspectControlledProofExecutionContinuationAuthorizationMemory(
    continuationAuthorizationMemory,
    { policy: continuationAuthorizationPolicy },
  ),
];
const failed = inspections.find((inspection) => !inspection.ok);
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);

if (controlledProofExecutionStartAuthorizationPolicy.trustedStartAuthorizers.length) fail("autorizador de início real foi inventado");
if (controlledProofExecutionStartPolicy.trustedStartExecutors.length) fail("executor de início real foi inventado");
if (observationPolicy.trustedProofObservers.length) fail("observador real foi inventado");
if (continuationAuthorizationPolicy.trustedContinuationAuthorizers.length) fail("autorizador de continuação real foi inventado");
if (
  controlledProofExecutionStartAuthorizationMemory.entries.length ||
  controlledProofExecutionStartMemory.entries.length ||
  observationMemory.entries.length ||
  continuationAuthorizationMemory.entries.length
) fail("registro operacional canônico foi inventado");

const bindings = {
  controlledProofExecutionStartAuthorizationPolicyHash: controlledProofExecutionStartAuthorizationPolicy.policyHash,
  controlledProofExecutionStartAuthorizationMemoryHash: controlledProofExecutionStartAuthorizationMemory.memoryHash,
  controlledProofExecutionStartPolicyHash: controlledProofExecutionStartPolicy.policyHash,
  controlledProofExecutionStartMemoryHash: controlledProofExecutionStartMemory.memoryHash,
  controlledProofExecutionObservationPolicyHash: observationPolicy.policyHash,
  controlledProofExecutionObservationMemoryHash: observationMemory.memoryHash,
  controlledProofExecutionContinuationAuthorizationPolicyHash: continuationAuthorizationPolicy.policyHash,
  controlledProofExecutionContinuationAuthorizationMemoryHash: continuationAuthorizationMemory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) {
  if (phase.currentState[key] !== value) fail(`vínculo divergente: ${key}`);
}
for (const key of [
  "trustedStartAuthorizersConfigured", "trustedStartExecutorsConfigured", "trustedProofObserversConfigured",
  "trustedContinuationAuthorizersConfigured", "recordedExecutionStarts", "recordedExecutionObservations",
  "observedExecutionStarts", "distinctObservations", "recordedContinuationAuthorizations",
  "authorizedObservations", "distinctContinuationAuthorizations",
]) if (phase.currentState[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "controlledProofExecutionStartAuthorized", "controlledProofExecutionStarted", "controlledProofExecutionObserved",
  "controlledProofExecutionContinuationAuthorized", "controlledProofExecutionContinued", "publicationExecuted",
  "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted",
]) if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");

if (continuationAuthorizationPolicy.controlledProofExecutionContinuationAuthorizationAllowed !== true) fail("autorização de continuação não habilitada");
if (continuationAuthorizationPolicy.controlledProofExecutionContinuationAllowed !== false) fail("continuação habilitada antecipadamente");
if (continuationAuthorizationPolicy.maximumContinuations !== 1) fail("autorização deixou de ser de uso único");
if (continuationAuthorizationPolicy.maximumAuthorizationDelaySeconds !== 300) fail("janela canônica de autorização divergente");
if (continuationAuthorizationPolicy.maximumAuthorizationTtlSeconds !== 300) fail("TTL canônico de autorização divergente");
for (const key of [
  "publicationExecutionAllowed", "networkAccessAllowed", "databaseMutationAllowed", "externalPublicationAllowed",
  "automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
]) if (continuationAuthorizationPolicy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "controlled_proof_execution_observation_not_recorded",
  "controlled_proof_execution_observation_already_authorized_for_continuation",
  "controlled_proof_execution_continuation_authorizer_not_independent",
  "controlled_proof_execution_continuation_authorization_window_expired",
  "controlled_proof_execution_continuation_authorization_ttl_invalid",
  "controlled_proof_execution_continuation_authorization_memory_head_binding_mismatch",
  "private_key_does_not_match_controlled_proof_execution_continuation_authorizer",
  "controlledProofExecutionContinuationAuthorized: true",
  "controlledProofExecutionContinued: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);

if (readJson("config/evolution-program-3000.json").currentPhase < 230) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-230:assess", "evolution:phase-230:check"]) {
  if (!scripts[name]) fail(`script ausente: ${name}`);
}

console.log("[phase-230] PASS — apenas uma observação registrada, íntegra e ainda não autorizada recebe autorização interna assinada por ator independente; continuação, publicação, rede, banco, build, deploy e promoção permanecem bloqueados.");
