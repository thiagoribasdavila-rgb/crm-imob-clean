import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionContinuationObservationReviewMemory,
  inspectControlledProofExecutionContinuationObservationReviewPolicy,
} from "../lib/release/controlled-proof-execution-continuation-observation-review.mjs";
import {
  inspectControlledProofExecutionContinuationObservationMemory,
  inspectControlledProofExecutionContinuationObservationPolicy,
} from "../lib/release/controlled-proof-execution-continuation-observation.mjs";

const fail = (message) => { throw new Error(`[phase-233] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-233-controlled-proof-execution-continuation-observation-review.json",
  reviewPolicy: "config/controlled-proof-execution-continuation-observation-review-policy.json",
  reviewMemory: "config/controlled-proof-execution-continuation-observation-review-memory.json",
  observationPolicy: "config/controlled-proof-execution-continuation-observation-policy.json",
  observationMemory: "config/controlled-proof-execution-continuation-observation-memory.json",
  continuationPolicy: "config/controlled-proof-execution-continuation-policy.json",
  continuationAuthorizationPolicy: "config/controlled-proof-execution-continuation-authorization-policy.json",
  startPolicy: "config/controlled-proof-execution-start-policy.json",
  initialObservationPolicy: "config/controlled-proof-execution-observation-policy.json",
  startAuthorizationPolicy: "config/controlled-proof-execution-start-authorization-policy.json",
  documentation: "docs/EVOLUTION_PHASE_233_CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW.md",
  library: "lib/release/controlled-proof-execution-continuation-observation-review.mjs",
  runner: "scripts/run-controlled-proof-execution-continuation-observation-review-phase-233.mjs",
  test: "tests/contracts/controlled-proof-execution-continuation-observation-review.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(paths.phase);
const reviewPolicy = readJson(paths.reviewPolicy);
const reviewMemory = readJson(paths.reviewMemory);
const observationPolicy = readJson(paths.observationPolicy);
const observationMemory = readJson(paths.observationMemory);
const continuationPolicy = readJson(paths.continuationPolicy);
const continuationAuthorizationPolicy = readJson(paths.continuationAuthorizationPolicy);
const startPolicy = readJson(paths.startPolicy);
const initialObservationPolicy = readJson(paths.initialObservationPolicy);
const startAuthorizationPolicy = readJson(paths.startAuthorizationPolicy);
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
const reviewContext = {
  controlledProofExecutionContinuationObservationPolicy: observationPolicy,
  trustedObservationReviewers: reviewPolicy.trustedObservationReviewers,
  maximumReviewDelaySeconds: reviewPolicy.maximumReviewDelaySeconds,
  minimumReasonLength: reviewPolicy.minimumReasonLength,
  controlledProofExecutionContinuationPolicy: continuationPolicy,
  trustedContinuationObservers: observationPolicy.trustedContinuationObservers,
  maximumContinuationObservationDelaySeconds: observationPolicy.maximumContinuationObservationDelaySeconds,
  controlledProofExecutionContinuationAuthorizationPolicy: continuationAuthorizationPolicy,
  controlledProofExecutionStartPolicy: startPolicy,
  controlledProofExecutionObservationPolicy: initialObservationPolicy,
  trustedContinuationAuthorizers: continuationAuthorizationPolicy.trustedContinuationAuthorizers,
  maximumAuthorizationDelaySeconds: continuationAuthorizationPolicy.maximumAuthorizationDelaySeconds,
  maximumAuthorizationTtlSeconds: continuationAuthorizationPolicy.maximumAuthorizationTtlSeconds,
  trustedProofObservers: initialObservationPolicy.trustedProofObservers,
  maximumStartObservationDelaySeconds: initialObservationPolicy.maximumObservationDelaySeconds,
  controlledProofExecutionStartAuthorizationPolicy: startAuthorizationPolicy,
  ...upstreamContext,
};
const observationContext = {
  controlledProofExecutionContinuationPolicy: continuationPolicy,
  trustedContinuationObservers: observationPolicy.trustedContinuationObservers,
  maximumContinuationObservationDelaySeconds: observationPolicy.maximumContinuationObservationDelaySeconds,
  controlledProofExecutionContinuationAuthorizationPolicy: continuationAuthorizationPolicy,
  controlledProofExecutionStartPolicy: startPolicy,
  controlledProofExecutionObservationPolicy: initialObservationPolicy,
  trustedContinuationAuthorizers: continuationAuthorizationPolicy.trustedContinuationAuthorizers,
  maximumAuthorizationDelaySeconds: continuationAuthorizationPolicy.maximumAuthorizationDelaySeconds,
  maximumAuthorizationTtlSeconds: continuationAuthorizationPolicy.maximumAuthorizationTtlSeconds,
  trustedProofObservers: initialObservationPolicy.trustedProofObservers,
  maximumObservationDelaySeconds: initialObservationPolicy.maximumObservationDelaySeconds,
  controlledProofExecutionStartAuthorizationPolicy: startAuthorizationPolicy,
  ...upstreamContext,
};

if (phase.phase !== 233 || phase.status !== "implemented") fail("fase ou status inválido");
const inspections = [
  inspectControlledProofExecutionContinuationObservationPolicy(observationPolicy, observationContext),
  inspectControlledProofExecutionContinuationObservationMemory(observationMemory, { policy: observationPolicy }),
  inspectControlledProofExecutionContinuationObservationReviewPolicy(reviewPolicy, reviewContext),
  inspectControlledProofExecutionContinuationObservationReviewMemory(reviewMemory, { policy: reviewPolicy }),
];
const failed = inspections.find((inspection) => !inspection.ok);
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);

if (reviewPolicy.trustedObservationReviewers.length !== 0) fail("revisor real foi inventado");
if (reviewMemory.entries.length !== 0) fail("revisão canônica foi inventada");
if (observationMemory.entries.length !== 0) fail("observação de continuação canônica foi inventada");

const bindings = {
  controlledProofExecutionContinuationObservationPolicyHash: observationPolicy.policyHash,
  controlledProofExecutionContinuationObservationMemoryHash: observationMemory.memoryHash,
  controlledProofExecutionContinuationObservationReviewPolicyHash: reviewPolicy.policyHash,
  controlledProofExecutionContinuationObservationReviewMemoryHash: reviewMemory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) if (phase.currentState[key] !== value) fail(`vínculo divergente: ${key}`);
for (const key of [
  "trustedObservationReviewersConfigured", "recordedContinuationObservations", "recordedReviews",
  "acceptedObservations", "rejectedObservations", "reviewedObservations",
]) if (phase.currentState[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "controlledProofExecutionContinuationObserved", "controlledProofExecutionContinuationObservationReviewed",
  "subsequentContinuationAuthorized", "publicationExecuted", "externalPublicationExecuted",
  "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted",
]) if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");

if (reviewPolicy.controlledProofExecutionContinuationObservationReviewAllowed !== true) fail("revisão não habilitada");
if (reviewPolicy.maximumReviewsPerObservation !== 1) fail("revisão deixou de ser de uso único");
if (JSON.stringify(reviewPolicy.allowedOutcomes) !== JSON.stringify(["accepted", "rejected"])) fail("resultados permitidos divergentes");
if (reviewPolicy.maximumReviewDelaySeconds !== 900 || reviewPolicy.minimumReasonLength !== 12) fail("limites de revisão divergentes");
for (const key of [
  "subsequentContinuationAuthorizationAllowed", "publicationExecutionAllowed", "networkAccessAllowed",
  "databaseMutationAllowed", "externalPublicationAllowed", "automaticPublicationExecution",
  "automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
]) if (reviewPolicy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "controlled_proof_execution_continuation_observation_not_recorded",
  "controlled_proof_execution_continuation_observation_already_reviewed",
  "controlled_proof_execution_continuation_observation_reviewer_not_independent",
  "controlled_proof_execution_continuation_observation_review_window_expired",
  "controlled_proof_execution_continuation_observation_review_memory_head_binding_mismatch",
  "private_key_does_not_match_controlled_proof_execution_continuation_observation_reviewer",
  "continuationObservationAccepted: outcome === \"accepted\"",
  "subsequentContinuationAuthorized: false",
  "publicationExecuted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);

if (phase.nextPhase?.phase !== 234 || phase.nextPhase?.name !== "Controlled Proof Execution Continuation Observation Review Authorization") fail("próxima fase divergente");
if (readJson("config/evolution-program-3000.json").currentPhase < 233) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-233:assess", "evolution:phase-233:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-233] PASS — uma observação de continuação registrada só pode receber uma revisão assinada, independente e de uso único; nenhuma nova continuação ou efeito externo é autorizado.");
