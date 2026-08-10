import { readFileSync } from "node:fs";
import {
  createControlledProofExecutionSubsequentContinuationObservationReviewMemory,
  createControlledProofExecutionSubsequentContinuationObservationReviewPolicy,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewMemory,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewPolicy,
} from "../lib/release/controlled-proof-execution-subsequent-continuation-observation-review.mjs";
import {
  inspectControlledProofExecutionSubsequentContinuationObservationMemory,
  inspectControlledProofExecutionSubsequentContinuationObservationPolicy,
} from "../lib/release/controlled-proof-execution-subsequent-continuation-observation.mjs";

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
const initialObservationPolicy = readJson("config/controlled-proof-execution-observation-policy.json");
const continuationAuthorizationPolicy = readJson("config/controlled-proof-execution-continuation-authorization-policy.json");
const continuationPolicy = readJson("config/controlled-proof-execution-continuation-policy.json");
const continuationObservationPolicy = readJson("config/controlled-proof-execution-continuation-observation-policy.json");
const reviewPolicy = readJson("config/controlled-proof-execution-continuation-observation-review-policy.json");
const authorizationPolicy = readJson("config/controlled-proof-execution-continuation-observation-review-authorization-policy.json");
const consumptionPolicy = readJson("config/controlled-proof-execution-continuation-observation-review-authorization-consumption-policy.json");
const subsequentPolicy = readJson("config/controlled-proof-execution-subsequent-continuation-policy.json");
const observationPolicy = readJson("config/controlled-proof-execution-subsequent-continuation-observation-policy.json");
const observationMemory = readJson("config/controlled-proof-execution-subsequent-continuation-observation-memory.json");

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

const subsequentContext = {
  controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy: consumptionPolicy,
  trustedSubsequentContinuationExecutors: subsequentPolicy.trustedSubsequentContinuationExecutors,
  controlledProofExecutionContinuationObservationReviewAuthorizationPolicy: authorizationPolicy,
  trustedReviewAuthorizationConsumers: consumptionPolicy.trustedReviewAuthorizationConsumers,
  ...authorizationContext,
};

const observationPolicyContext = {
  controlledProofExecutionSubsequentContinuationPolicy: subsequentPolicy,
  controlledProofExecutionSubsequentContinuationPolicyContext: subsequentContext,
  trustedSubsequentContinuationObservers: observationPolicy.trustedSubsequentContinuationObservers,
  maximumSubsequentContinuationObservationDelaySeconds:
    observationPolicy.maximumSubsequentContinuationObservationDelaySeconds,
};

const observationInspections = [
  inspectControlledProofExecutionSubsequentContinuationObservationPolicy(observationPolicy, observationPolicyContext),
  inspectControlledProofExecutionSubsequentContinuationObservationMemory(observationMemory, { policy: observationPolicy }),
];
const invalidObservation = observationInspections.find((inspection) => !inspection.ok);
if (invalidObservation) {
  throw new Error(`controlled_proof_execution_subsequent_continuation_observation_context_invalid:${invalidObservation.reason}`);
}

const observationReviewPolicyContext = {
  controlledProofExecutionSubsequentContinuationObservationPolicy: observationPolicy,
  controlledProofExecutionSubsequentContinuationObservationPolicyContext: observationPolicyContext,
  trustedSubsequentContinuationObservationReviewers: [],
  maximumSubsequentContinuationObservationReviewDelaySeconds: 900,
  minimumSubsequentContinuationObservationReviewReasonLength: 12,
};

if (process.argv.includes("--generate")) {
  const policy = createControlledProofExecutionSubsequentContinuationObservationReviewPolicy(
    observationReviewPolicyContext,
  );
  const memory = createControlledProofExecutionSubsequentContinuationObservationReviewMemory({ policy });
  console.log(JSON.stringify({ policy, memory }, null, 2));
  process.exit(0);
}

const observationReviewPolicy = readJson("config/controlled-proof-execution-subsequent-continuation-observation-review-policy.json");
const observationReviewMemory = readJson("config/controlled-proof-execution-subsequent-continuation-observation-review-memory.json");
const inspections = [
  inspectControlledProofExecutionSubsequentContinuationObservationReviewPolicy(
    observationReviewPolicy,
    observationReviewPolicyContext,
  ),
  inspectControlledProofExecutionSubsequentContinuationObservationReviewMemory(
    observationReviewMemory,
    { policy: observationReviewPolicy },
  ),
];
const failed = inspections.find((inspection) => !inspection.ok);
if (failed) {
  throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_context_invalid:${failed.reason}`);
}

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-subsequent-continuation-observation-review-readiness.v1",
  phase: 238,
  compositionId: observationReviewPolicy.compositionId,
  controlledProofExecutionSubsequentContinuationObservationPolicyHash: observationPolicy.policyHash,
  controlledProofExecutionSubsequentContinuationObservationMemoryHash: observationMemory.memoryHash,
  controlledProofExecutionSubsequentContinuationObservationReviewPolicyHash: observationReviewPolicy.policyHash,
  controlledProofExecutionSubsequentContinuationObservationReviewMemoryHash: observationReviewMemory.memoryHash,
  trustedSubsequentContinuationObservationReviewersConfigured:
    observationReviewPolicy.trustedSubsequentContinuationObservationReviewers.length,
  recordedSubsequentContinuationObservations:
    observationMemory.summary.recordedSubsequentContinuationObservations,
  recordedSubsequentContinuationObservationReviews: observationReviewMemory.summary.recordedReviews,
  reviewedSubsequentContinuationObservations: observationReviewMemory.summary.reviewedObservations,
  acceptedSubsequentContinuationObservations: observationReviewMemory.summary.acceptedObservations,
  rejectedSubsequentContinuationObservations: observationReviewMemory.summary.rejectedObservations,
  readiness: "awaiting_valid_recorded_subsequent_continuation_observation_and_trusted_independent_reviewer",
  subsequentContinuationObservationReviewAllowed:
    observationReviewPolicy.subsequentContinuationObservationReviewAllowed,
  subsequentContinuationObservationAccepted:
    observationReviewMemory.summary.subsequentContinuationObservationAccepted,
  subsequentContinuationObservationReviewAuthorizationAllowed: false,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
