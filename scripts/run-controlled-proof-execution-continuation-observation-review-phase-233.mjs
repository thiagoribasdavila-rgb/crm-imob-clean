import { readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionContinuationObservationReviewMemory,
  inspectControlledProofExecutionContinuationObservationReviewPolicy,
} from "../lib/release/controlled-proof-execution-continuation-observation-review.mjs";
import {
  inspectControlledProofExecutionContinuationObservationMemory,
  inspectControlledProofExecutionContinuationObservationPolicy,
} from "../lib/release/controlled-proof-execution-continuation-observation.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
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
const startAuthorizationPolicy = readJson("config/controlled-proof-execution-start-authorization-policy.json");
const startPolicy = readJson("config/controlled-proof-execution-start-policy.json");
const observationPolicy = readJson("config/controlled-proof-execution-observation-policy.json");
const authorizationPolicy = readJson("config/controlled-proof-execution-continuation-authorization-policy.json");
const continuationPolicy = readJson("config/controlled-proof-execution-continuation-policy.json");
const continuationObservationPolicy = readJson("config/controlled-proof-execution-continuation-observation-policy.json");
const continuationObservationMemory = readJson("config/controlled-proof-execution-continuation-observation-memory.json");
const reviewPolicy = readJson("config/controlled-proof-execution-continuation-observation-review-policy.json");
const reviewMemory = readJson("config/controlled-proof-execution-continuation-observation-review-memory.json");

const reviewContext = {
  controlledProofExecutionContinuationObservationPolicy: continuationObservationPolicy,
  trustedObservationReviewers: reviewPolicy.trustedObservationReviewers,
  maximumReviewDelaySeconds: reviewPolicy.maximumReviewDelaySeconds,
  minimumReasonLength: reviewPolicy.minimumReasonLength,
  controlledProofExecutionContinuationPolicy: continuationPolicy,
  trustedContinuationObservers: continuationObservationPolicy.trustedContinuationObservers,
  maximumContinuationObservationDelaySeconds: continuationObservationPolicy.maximumContinuationObservationDelaySeconds,
  controlledProofExecutionContinuationAuthorizationPolicy: authorizationPolicy,
  controlledProofExecutionStartPolicy: startPolicy,
  controlledProofExecutionObservationPolicy: observationPolicy,
  trustedContinuationAuthorizers: authorizationPolicy.trustedContinuationAuthorizers,
  maximumAuthorizationDelaySeconds: authorizationPolicy.maximumAuthorizationDelaySeconds,
  maximumAuthorizationTtlSeconds: authorizationPolicy.maximumAuthorizationTtlSeconds,
  trustedProofObservers: observationPolicy.trustedProofObservers,
  maximumStartObservationDelaySeconds: observationPolicy.maximumObservationDelaySeconds,
  controlledProofExecutionStartAuthorizationPolicy: startAuthorizationPolicy,
  ...upstreamContext,
};
const continuationObservationContext = {
  controlledProofExecutionContinuationPolicy: continuationPolicy,
  trustedContinuationObservers: continuationObservationPolicy.trustedContinuationObservers,
  maximumContinuationObservationDelaySeconds: continuationObservationPolicy.maximumContinuationObservationDelaySeconds,
  controlledProofExecutionContinuationAuthorizationPolicy: authorizationPolicy,
  controlledProofExecutionStartPolicy: startPolicy,
  controlledProofExecutionObservationPolicy: observationPolicy,
  trustedContinuationAuthorizers: authorizationPolicy.trustedContinuationAuthorizers,
  maximumAuthorizationDelaySeconds: authorizationPolicy.maximumAuthorizationDelaySeconds,
  maximumAuthorizationTtlSeconds: authorizationPolicy.maximumAuthorizationTtlSeconds,
  trustedProofObservers: observationPolicy.trustedProofObservers,
  maximumObservationDelaySeconds: observationPolicy.maximumObservationDelaySeconds,
  controlledProofExecutionStartAuthorizationPolicy: startAuthorizationPolicy,
  ...upstreamContext,
};

const inspections = [
  inspectControlledProofExecutionContinuationObservationPolicy(continuationObservationPolicy, continuationObservationContext),
  inspectControlledProofExecutionContinuationObservationMemory(continuationObservationMemory, { policy: continuationObservationPolicy }),
  inspectControlledProofExecutionContinuationObservationReviewPolicy(reviewPolicy, reviewContext),
  inspectControlledProofExecutionContinuationObservationReviewMemory(reviewMemory, { policy: reviewPolicy }),
];
const failed = inspections.find((inspection) => !inspection.ok);
if (failed) throw new Error(`controlled_proof_execution_continuation_observation_review_context_invalid:${failed.reason}`);

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-continuation-observation-review-readiness.v1",
  phase: 233,
  compositionId: reviewPolicy.compositionId,
  controlledProofExecutionContinuationObservationPolicyHash: continuationObservationPolicy.policyHash,
  controlledProofExecutionContinuationObservationMemoryHash: continuationObservationMemory.memoryHash,
  controlledProofExecutionContinuationObservationReviewPolicyHash: reviewPolicy.policyHash,
  controlledProofExecutionContinuationObservationReviewMemoryHash: reviewMemory.memoryHash,
  trustedObservationReviewersConfigured: reviewPolicy.trustedObservationReviewers.length,
  recordedContinuationObservations: continuationObservationMemory.summary.recordedContinuationObservations,
  recordedReviews: reviewMemory.summary.recordedReviews,
  acceptedObservations: reviewMemory.summary.acceptedObservations,
  rejectedObservations: reviewMemory.summary.rejectedObservations,
  readiness: "awaiting_valid_recorded_continuation_observation_and_trusted_independent_reviewer",
  controlledProofExecutionContinuationObservationReviewAllowed: reviewPolicy.controlledProofExecutionContinuationObservationReviewAllowed,
  continuationObservationAccepted: reviewMemory.summary.continuationObservationAccepted,
  subsequentContinuationAuthorized: false,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
