import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionContinuationMemory,
  inspectControlledProofExecutionContinuationPolicy,
} from "../lib/release/controlled-proof-execution-continuation.mjs";
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

const fail = (message) => { throw new Error(`[phase-231] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-231-controlled-proof-execution-continuation.json",
  continuationPolicy: "config/controlled-proof-execution-continuation-policy.json",
  continuationMemory: "config/controlled-proof-execution-continuation-memory.json",
  authorizationPolicy: "config/controlled-proof-execution-continuation-authorization-policy.json",
  authorizationMemory: "config/controlled-proof-execution-continuation-authorization-memory.json",
  observationPolicy: "config/controlled-proof-execution-observation-policy.json",
  observationMemory: "config/controlled-proof-execution-observation-memory.json",
  startPolicy: "config/controlled-proof-execution-start-policy.json",
  startMemory: "config/controlled-proof-execution-start-memory.json",
  startAuthorizationPolicy: "config/controlled-proof-execution-start-authorization-policy.json",
  startAuthorizationMemory: "config/controlled-proof-execution-start-authorization-memory.json",
  documentation: "docs/EVOLUTION_PHASE_231_CONTROLLED_PROOF_EXECUTION_CONTINUATION.md",
  library: "lib/release/controlled-proof-execution-continuation.mjs",
  runner: "scripts/run-controlled-proof-execution-continuation-phase-231.mjs",
  test: "tests/contracts/controlled-proof-execution-continuation.test.mjs"
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(paths.phase);
const continuationPolicy = readJson(paths.continuationPolicy);
const continuationMemory = readJson(paths.continuationMemory);
const authorizationPolicy = readJson(paths.authorizationPolicy);
const authorizationMemory = readJson(paths.authorizationMemory);
const observationPolicy = readJson(paths.observationPolicy);
const observationMemory = readJson(paths.observationMemory);
const startPolicy = readJson(paths.startPolicy);
const startMemory = readJson(paths.startMemory);
const startAuthorizationPolicy = readJson(paths.startAuthorizationPolicy);
const startAuthorizationMemory = readJson(paths.startAuthorizationMemory);
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
  packageAuthorizationPolicy: readJson("config/approved-release-package-authorization-policy.json")
};
const startContext = { controlledProofExecutionStartAuthorizationPolicy: startAuthorizationPolicy, ...upstreamContext };
const observationContext = {
  controlledProofExecutionStartPolicy: startPolicy,
  trustedProofObservers: observationPolicy.trustedProofObservers,
  maximumObservationDelaySeconds: observationPolicy.maximumObservationDelaySeconds,
  ...startContext
};
const authorizationContext = {
  controlledProofExecutionObservationPolicy: observationPolicy,
  trustedContinuationAuthorizers: authorizationPolicy.trustedContinuationAuthorizers,
  maximumAuthorizationDelaySeconds: authorizationPolicy.maximumAuthorizationDelaySeconds,
  maximumAuthorizationTtlSeconds: authorizationPolicy.maximumAuthorizationTtlSeconds,
  ...observationContext
};
const continuationContext = {
  controlledProofExecutionContinuationAuthorizationPolicy: authorizationPolicy,
  controlledProofExecutionStartPolicy: startPolicy,
  ...authorizationContext
};

if (phase.phase !== 231 || phase.status !== "implemented") fail("fase ou status inválido");
const inspections = [
  inspectControlledProofExecutionStartAuthorizationPolicy(startAuthorizationPolicy, upstreamContext),
  inspectControlledProofExecutionStartAuthorizationMemory(startAuthorizationMemory, { policy: startAuthorizationPolicy }),
  inspectControlledProofExecutionStartPolicy(startPolicy, startContext),
  inspectControlledProofExecutionStartMemory(startMemory, { policy: startPolicy }),
  inspectControlledProofExecutionObservationPolicy(observationPolicy, observationContext),
  inspectControlledProofExecutionObservationMemory(observationMemory, { policy: observationPolicy }),
  inspectControlledProofExecutionContinuationAuthorizationPolicy(authorizationPolicy, authorizationContext),
  inspectControlledProofExecutionContinuationAuthorizationMemory(authorizationMemory, { policy: authorizationPolicy }),
  inspectControlledProofExecutionContinuationPolicy(continuationPolicy, continuationContext),
  inspectControlledProofExecutionContinuationMemory(continuationMemory, { policy: continuationPolicy })
];
const failed = inspections.find((inspection) => !inspection.ok);
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);

for (const [label, values] of [
  ["autorizador de início", startAuthorizationPolicy.trustedStartAuthorizers],
  ["executor de início", startPolicy.trustedStartExecutors],
  ["observador", observationPolicy.trustedProofObservers],
  ["autorizador de continuação", authorizationPolicy.trustedContinuationAuthorizers],
  ["executor de continuação", continuationPolicy.trustedContinuationExecutors]
]) if (values.length) fail(`${label} real foi inventado`);
for (const [label, memory] of [
  ["autorização inicial", startAuthorizationMemory], ["início", startMemory], ["observação", observationMemory],
  ["autorização de continuação", authorizationMemory], ["continuação", continuationMemory]
]) if (memory.entries.length) fail(`registro canônico de ${label} foi inventado`);

const bindings = {
  controlledProofExecutionStartAuthorizationPolicyHash: startAuthorizationPolicy.policyHash,
  controlledProofExecutionStartAuthorizationMemoryHash: startAuthorizationMemory.memoryHash,
  controlledProofExecutionStartPolicyHash: startPolicy.policyHash,
  controlledProofExecutionStartMemoryHash: startMemory.memoryHash,
  controlledProofExecutionObservationPolicyHash: observationPolicy.policyHash,
  controlledProofExecutionObservationMemoryHash: observationMemory.memoryHash,
  controlledProofExecutionContinuationAuthorizationPolicyHash: authorizationPolicy.policyHash,
  controlledProofExecutionContinuationAuthorizationMemoryHash: authorizationMemory.memoryHash,
  controlledProofExecutionContinuationPolicyHash: continuationPolicy.policyHash,
  controlledProofExecutionContinuationMemoryHash: continuationMemory.memoryHash
};
for (const [key, value] of Object.entries(bindings)) if (phase.currentState[key] !== value) fail(`vínculo divergente: ${key}`);
for (const key of [
  "trustedStartAuthorizersConfigured", "trustedStartExecutorsConfigured", "trustedProofObserversConfigured",
  "trustedContinuationAuthorizersConfigured", "trustedContinuationExecutorsConfigured", "recordedExecutionStarts",
  "recordedExecutionObservations", "recordedContinuationAuthorizations", "recordedContinuations",
  "consumedContinuationAuthorizations", "distinctContinuations"
]) if (phase.currentState[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "controlledProofExecutionStartAuthorized", "controlledProofExecutionStarted", "controlledProofExecutionObserved",
  "controlledProofExecutionContinuationAuthorized", "controlledProofExecutionContinued", "publicationExecuted",
  "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"
]) if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");

if (continuationPolicy.controlledProofExecutionContinuationAllowed !== true) fail("continuação controlada não habilitada");
if (continuationPolicy.maximumContinuations !== 1) fail("continuação deixou de ser de uso único");
for (const key of [
  "publicationExecutionAllowed", "networkAccessAllowed", "databaseMutationAllowed", "externalPublicationAllowed",
  "automaticPublicationExecution", "automaticPackageGeneration", "automaticBuild", "automaticDeploy",
  "automaticReleasePromotion"
]) if (continuationPolicy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "controlled_proof_execution_continuation_authorization_not_recorded",
  "controlled_proof_execution_continuation_authorization_already_consumed",
  "controlled_proof_execution_continuation_executor_binding_mismatch",
  "controlled_proof_execution_continuation_authorization_expired",
  "controlled_proof_execution_continuation_memory_head_binding_mismatch",
  "private_key_does_not_match_controlled_proof_execution_continuation_executor",
  "controlledProofExecutionContinuationAuthorized: true",
  "controlledProofExecutionContinued: true",
  "publicationExecuted: false",
  "externalPublicationExecuted: false"
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);

if (readJson("config/evolution-program-3000.json").currentPhase < 231) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-231:assess", "evolution:phase-231:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-231] PASS — somente uma autorização registrada, íntegra, válida e ainda não consumida pode gerar uma continuação interna assinada; replay, divergência de executor, adulteração e todos os efeitos externos permanecem bloqueados.");
