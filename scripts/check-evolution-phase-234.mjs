import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionContinuationObservationReviewAuthorizationMemory,
  inspectControlledProofExecutionContinuationObservationReviewAuthorizationPolicy,
} from "../lib/release/controlled-proof-execution-continuation-observation-review-authorization.mjs";
import {
  inspectControlledProofExecutionContinuationObservationReviewMemory,
  inspectControlledProofExecutionContinuationObservationReviewPolicy,
} from "../lib/release/controlled-proof-execution-continuation-observation-review.mjs";

const fail = (message) => { throw new Error(`[phase-234] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-234-controlled-proof-execution-continuation-observation-review-authorization.json",
  authorizationPolicy: "config/controlled-proof-execution-continuation-observation-review-authorization-policy.json",
  authorizationMemory: "config/controlled-proof-execution-continuation-observation-review-authorization-memory.json",
  reviewPolicy: "config/controlled-proof-execution-continuation-observation-review-policy.json",
  reviewMemory: "config/controlled-proof-execution-continuation-observation-review-memory.json",
  continuationObservationPolicy: "config/controlled-proof-execution-continuation-observation-policy.json",
  continuationAuthorizationPolicy: "config/controlled-proof-execution-continuation-authorization-policy.json",
  continuationPolicy: "config/controlled-proof-execution-continuation-policy.json",
  startPolicy: "config/controlled-proof-execution-start-policy.json",
  initialObservationPolicy: "config/controlled-proof-execution-observation-policy.json",
  startAuthorizationPolicy: "config/controlled-proof-execution-start-authorization-policy.json",
  documentation: "docs/EVOLUTION_PHASE_234_CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION.md",
  library: "lib/release/controlled-proof-execution-continuation-observation-review-authorization.mjs",
  runner: "scripts/run-controlled-proof-execution-continuation-observation-review-authorization-phase-234.mjs",
  test: "tests/contracts/controlled-proof-execution-continuation-observation-review-authorization.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(paths.phase);
const authorizationPolicy = readJson(paths.authorizationPolicy);
const authorizationMemory = readJson(paths.authorizationMemory);
const reviewPolicy = readJson(paths.reviewPolicy);
const reviewMemory = readJson(paths.reviewMemory);
const continuationObservationPolicy = readJson(paths.continuationObservationPolicy);
const continuationAuthorizationPolicy = readJson(paths.continuationAuthorizationPolicy);
const continuationPolicy = readJson(paths.continuationPolicy);
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
  controlledProofExecutionContinuationObservationPolicy: continuationObservationPolicy,
  trustedObservationReviewers: reviewPolicy.trustedObservationReviewers,
  maximumReviewDelaySeconds: reviewPolicy.maximumReviewDelaySeconds,
  minimumReasonLength: reviewPolicy.minimumReasonLength,
  controlledProofExecutionContinuationPolicy: continuationPolicy,
  trustedContinuationObservers: continuationObservationPolicy.trustedContinuationObservers,
  maximumContinuationObservationDelaySeconds: continuationObservationPolicy.maximumContinuationObservationDelaySeconds,
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
const authorizationContext = {
  controlledProofExecutionContinuationObservationReviewPolicy: reviewPolicy,
  trustedReviewAuthorizers: authorizationPolicy.trustedReviewAuthorizers,
  maximumReviewAuthorizationDelaySeconds: authorizationPolicy.maximumReviewAuthorizationDelaySeconds,
  maximumReviewAuthorizationTtlSeconds: authorizationPolicy.maximumReviewAuthorizationTtlSeconds,
  ...reviewContext,
};

if (phase.phase !== 234 || phase.status !== "implemented") fail("fase ou status inválido");
const inspections = [
  inspectControlledProofExecutionContinuationObservationReviewPolicy(reviewPolicy, reviewContext),
  inspectControlledProofExecutionContinuationObservationReviewMemory(reviewMemory, { policy: reviewPolicy }),
  inspectControlledProofExecutionContinuationObservationReviewAuthorizationPolicy(authorizationPolicy, authorizationContext),
  inspectControlledProofExecutionContinuationObservationReviewAuthorizationMemory(authorizationMemory, { policy: authorizationPolicy }),
];
const failed = inspections.find((inspection) => !inspection.ok);
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);

if (authorizationPolicy.trustedReviewAuthorizers.length !== 0) fail("autorizador real foi inventado");
if (reviewMemory.entries.length !== 0) fail("revisão canônica foi inventada");
if (authorizationMemory.entries.length !== 0) fail("autorização canônica foi inventada");

const bindings = {
  controlledProofExecutionContinuationObservationReviewPolicyHash: reviewPolicy.policyHash,
  controlledProofExecutionContinuationObservationReviewMemoryHash: reviewMemory.memoryHash,
  controlledProofExecutionContinuationObservationReviewAuthorizationPolicyHash: authorizationPolicy.policyHash,
  controlledProofExecutionContinuationObservationReviewAuthorizationMemoryHash: authorizationMemory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) if (phase.currentState[key] !== value) fail(`vínculo divergente: ${key}`);
for (const key of ["trustedReviewAuthorizersConfigured", "recordedReviews", "recordedReviewAuthorizations", "acceptedReviewsAuthorized"]) {
  if (phase.currentState[key] !== 0) fail(`${key} inventado`);
}
for (const key of [
  "subsequentContinuationAuthorized", "subsequentContinuationExecuted", "publicationExecuted",
  "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted",
]) if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");

for (const key of [
  "acceptedSignedRecordedReviewRequired", "exactReviewReceiptBindingRequired", "exactReviewPolicyBindingRequired",
  "exactReviewMemoryBindingRequired", "exactContinuationObservationBindingRequired", "exactContinuationBindingRequired",
  "exactPriorAuthorizationBindingRequired", "exactPriorObservationBindingRequired", "exactExecutionStartBindingRequired",
  "exactPackageDigestBindingRequired", "exactInventoryBindingRequired", "reviewSignatureVerificationRequired",
  "authorizerIndependenceRequired", "authorizerValidityAcrossAuthorizationRequired", "appendOnlyAuthorizationMemoryRequired",
  "duplicateReviewAuthorizationRejected", "atomicMemoryHeadBindingRequired", "signedAuthorizationRequired",
  "shortLivedAuthorizationRequired", "singleUseAuthorizationRequired",
]) if (authorizationPolicy[key] !== true) fail(`${key} desabilitado`);
if (authorizationPolicy.maximumSubsequentContinuations !== 1) fail("autorização deixou de ser de uso único");
if (authorizationPolicy.maximumReviewAuthorizationDelaySeconds !== 300 || authorizationPolicy.maximumReviewAuthorizationTtlSeconds !== 300) {
  fail("limites da autorização divergentes");
}
if (authorizationPolicy.subsequentContinuationAuthorizationAllowed !== true) fail("emissão interna de autorização não habilitada");
for (const key of [
  "subsequentContinuationAllowed", "publicationExecutionAllowed", "networkAccessAllowed", "databaseMutationAllowed",
  "externalPublicationAllowed", "automaticPublicationExecution", "automaticPackageGeneration", "automaticBuild",
  "automaticDeploy", "automaticReleasePromotion",
]) if (authorizationPolicy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "controlled_proof_execution_continuation_observation_review_not_recorded_as_accepted",
  "controlled_proof_execution_continuation_observation_review_not_accepted",
  "controlled_proof_execution_continuation_observation_review_already_authorized",
  "controlled_proof_execution_continuation_observation_review_authorizer_not_independent",
  "controlled_proof_execution_continuation_observation_review_authorization_window_expired",
  "controlled_proof_execution_continuation_observation_review_authorization_ttl_invalid",
  "controlled_proof_execution_continuation_observation_review_authorization_memory_head_binding_mismatch",
  "private_key_does_not_match_controlled_proof_execution_continuation_observation_review_authorizer",
  "remainingSubsequentContinuations: 1",
  "subsequentContinuationExecuted: false",
  "publicationExecuted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);

if (phase.nextPhase?.phase !== 235 || phase.nextPhase?.name !== "Controlled Proof Execution Continuation Observation Review Authorization Consumption") fail("próxima fase divergente");
if (readJson("config/evolution-program-3000.json").currentPhase < 234) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-234:assess", "evolution:phase-234:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-234] PASS — somente uma revisão aceita, assinada e registrada pode gerar autorização interna, curta, independente e de uso único; nenhuma continuação ou efeito externo foi executado.");
