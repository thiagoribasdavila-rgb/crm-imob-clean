import { readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionNextSubsequentContinuationObservationMemory,
  inspectControlledProofExecutionNextSubsequentContinuationObservationPolicy,
} from "../lib/release/controlled-proof-execution-next-subsequent-continuation-observation.mjs";
import {
  createControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory,
  createControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicy,
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory,
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicy,
} from "../lib/release/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization.mjs";
import {
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewMemory,
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewPolicy,
} from "../lib/release/controlled-proof-execution-next-subsequent-continuation-observation-review.mjs";
import {
  inspectControlledProofExecutionNextSubsequentContinuationMemory,
  inspectControlledProofExecutionNextSubsequentContinuationPolicy,
} from "../lib/release/controlled-proof-execution-next-subsequent-continuation.mjs";
import {
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
} from "../lib/release/controlled-proof-execution-subsequent-continuation-observation-review-authorization-consumption.mjs";
import {
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy,
} from "../lib/release/controlled-proof-execution-subsequent-continuation-observation-review-authorization.mjs";
import {
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
const priorAuthorizationPolicy = readJson("config/controlled-proof-execution-continuation-observation-review-authorization-policy.json");
const consumptionPolicy = readJson("config/controlled-proof-execution-continuation-observation-review-authorization-consumption-policy.json");
const subsequentPolicy = readJson("config/controlled-proof-execution-subsequent-continuation-policy.json");
const observationPolicy = readJson("config/controlled-proof-execution-subsequent-continuation-observation-policy.json");
const observationMemory = readJson("config/controlled-proof-execution-subsequent-continuation-observation-memory.json");
const observationReviewPolicy = readJson("config/controlled-proof-execution-subsequent-continuation-observation-review-policy.json");
const observationReviewMemory = readJson("config/controlled-proof-execution-subsequent-continuation-observation-review-memory.json");
const reviewAuthorizationPolicy = readJson("config/controlled-proof-execution-subsequent-continuation-observation-review-authorization-policy.json");
const reviewAuthorizationMemory = readJson("config/controlled-proof-execution-subsequent-continuation-observation-review-authorization-memory.json");
const authorizationConsumptionPolicy = readJson("config/controlled-proof-execution-subsequent-continuation-observation-review-authorization-consumption-policy.json");
const authorizationConsumptionMemory = readJson("config/controlled-proof-execution-subsequent-continuation-observation-review-authorization-consumption-memory.json");
const nextSubsequentContinuationPolicy = readJson("config/controlled-proof-execution-next-subsequent-continuation-policy.json");
const nextSubsequentContinuationMemory = readJson("config/controlled-proof-execution-next-subsequent-continuation-memory.json");

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

const priorAuthorizationContext = {
  controlledProofExecutionContinuationObservationReviewPolicy: reviewPolicy,
  trustedReviewAuthorizers: priorAuthorizationPolicy.trustedReviewAuthorizers,
  maximumReviewAuthorizationDelaySeconds: priorAuthorizationPolicy.maximumReviewAuthorizationDelaySeconds,
  maximumReviewAuthorizationTtlSeconds: priorAuthorizationPolicy.maximumReviewAuthorizationTtlSeconds,
  ...reviewContext,
};
const subsequentContext = {
  controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy: consumptionPolicy,
  trustedSubsequentContinuationExecutors: subsequentPolicy.trustedSubsequentContinuationExecutors,
  controlledProofExecutionContinuationObservationReviewAuthorizationPolicy: priorAuthorizationPolicy,
  trustedReviewAuthorizationConsumers: consumptionPolicy.trustedReviewAuthorizationConsumers,
  ...priorAuthorizationContext,
};
const observationPolicyContext = {
  controlledProofExecutionSubsequentContinuationPolicy: subsequentPolicy,
  controlledProofExecutionSubsequentContinuationPolicyContext: subsequentContext,
  trustedSubsequentContinuationObservers: observationPolicy.trustedSubsequentContinuationObservers,
  maximumSubsequentContinuationObservationDelaySeconds:
    observationPolicy.maximumSubsequentContinuationObservationDelaySeconds,
};
const observationReviewPolicyContext = {
  controlledProofExecutionSubsequentContinuationObservationPolicy: observationPolicy,
  controlledProofExecutionSubsequentContinuationObservationPolicyContext: observationPolicyContext,
  trustedSubsequentContinuationObservationReviewers:
    observationReviewPolicy.trustedSubsequentContinuationObservationReviewers,
  maximumSubsequentContinuationObservationReviewDelaySeconds:
    observationReviewPolicy.maximumSubsequentContinuationObservationReviewDelaySeconds,
  minimumSubsequentContinuationObservationReviewReasonLength:
    observationReviewPolicy.minimumSubsequentContinuationObservationReviewReasonLength,
};
const authorizationContext = {
  controlledProofExecutionSubsequentContinuationObservationReviewPolicy: observationReviewPolicy,
  trustedReviewAuthorizers: reviewAuthorizationPolicy.trustedReviewAuthorizers,
  maximumReviewAuthorizationDelaySeconds: reviewAuthorizationPolicy.maximumReviewAuthorizationDelaySeconds,
  maximumReviewAuthorizationTtlSeconds: reviewAuthorizationPolicy.maximumReviewAuthorizationTtlSeconds,
  ...observationReviewPolicyContext,
};
const consumptionContext = {
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy: reviewAuthorizationPolicy,
  trustedReviewAuthorizationConsumers: authorizationConsumptionPolicy.trustedReviewAuthorizationConsumers,
  ...authorizationContext,
};
const nextSubsequentContinuationContext = {
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy:
    authorizationConsumptionPolicy,
  trustedNextSubsequentContinuationExecutors:
    nextSubsequentContinuationPolicy.trustedNextSubsequentContinuationExecutors,
  ...consumptionContext,
};

const upstreamInspections = [
  inspectControlledProofExecutionSubsequentContinuationObservationPolicy(observationPolicy, observationPolicyContext),
  inspectControlledProofExecutionSubsequentContinuationObservationMemory(observationMemory, { policy: observationPolicy }),
  inspectControlledProofExecutionSubsequentContinuationObservationReviewPolicy(
    observationReviewPolicy,
    observationReviewPolicyContext,
  ),
  inspectControlledProofExecutionSubsequentContinuationObservationReviewMemory(
    observationReviewMemory,
    { policy: observationReviewPolicy },
  ),
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy(
    reviewAuthorizationPolicy,
    authorizationContext,
  ),
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory(
    reviewAuthorizationMemory,
    { policy: reviewAuthorizationPolicy },
  ),
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(
    authorizationConsumptionPolicy,
    consumptionContext,
  ),
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory(
    authorizationConsumptionMemory,
    { policy: authorizationConsumptionPolicy },
  ),
  inspectControlledProofExecutionNextSubsequentContinuationPolicy(
    nextSubsequentContinuationPolicy,
    nextSubsequentContinuationContext,
  ),
  inspectControlledProofExecutionNextSubsequentContinuationMemory(
    nextSubsequentContinuationMemory,
    { policy: nextSubsequentContinuationPolicy },
  ),
];
const invalidUpstream = upstreamInspections.find((inspection) => !inspection.ok);
if (invalidUpstream) {
  throw new Error(`controlled_proof_execution_next_subsequent_continuation_context_invalid:${invalidUpstream.reason}`);
}

const nextObservationPolicyContext = {
  controlledProofExecutionNextSubsequentContinuationPolicy: nextSubsequentContinuationPolicy,
  controlledProofExecutionNextSubsequentContinuationPolicyContext: nextSubsequentContinuationContext,
  trustedNextSubsequentContinuationObservers: [],
  maximumNextSubsequentContinuationObservationDelaySeconds: 300,
};

const nextObservationPolicy = readJson("config/controlled-proof-execution-next-subsequent-continuation-observation-policy.json");
const nextObservationMemory = readJson("config/controlled-proof-execution-next-subsequent-continuation-observation-memory.json");
const inspections = [
  inspectControlledProofExecutionNextSubsequentContinuationObservationPolicy(
    nextObservationPolicy,
    nextObservationPolicyContext,
  ),
  inspectControlledProofExecutionNextSubsequentContinuationObservationMemory(
    nextObservationMemory,
    { policy: nextObservationPolicy },
  ),
];
const failed = inspections.find((inspection) => !inspection.ok);
if (failed) {
  throw new Error(`controlled_proof_execution_next_subsequent_continuation_observation_context_invalid:${failed.reason}`);
}

const nextObservationReviewPolicyContext = {
  controlledProofExecutionNextSubsequentContinuationObservationPolicy: nextObservationPolicy,
  controlledProofExecutionNextSubsequentContinuationObservationPolicyContext: nextObservationPolicyContext,
  trustedNextSubsequentContinuationObservationReviewers: [],
  maximumNextSubsequentContinuationObservationReviewDelaySeconds: 900,
  minimumNextSubsequentContinuationObservationReviewReasonLength: 12,
};

const nextObservationReviewPolicy = readJson("config/controlled-proof-execution-next-subsequent-continuation-observation-review-policy.json");
const nextObservationReviewMemory = readJson("config/controlled-proof-execution-next-subsequent-continuation-observation-review-memory.json");
const reviewInspections = [
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewPolicy(
    nextObservationReviewPolicy,
    nextObservationReviewPolicyContext,
  ),
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewMemory(
    nextObservationReviewMemory,
    { policy: nextObservationReviewPolicy },
  ),
];
const failedReview = reviewInspections.find((inspection) => !inspection.ok);
if (failedReview) {
  throw new Error(`controlled_proof_execution_next_subsequent_continuation_observation_review_context_invalid:${failedReview.reason}`);
}

const reviewAuthorizationContext = {
  controlledProofExecutionNextSubsequentContinuationObservationReviewPolicy: nextObservationReviewPolicy,
  trustedReviewAuthorizers: [],
  maximumReviewAuthorizationDelaySeconds: 300,
  maximumReviewAuthorizationTtlSeconds: 300,
  ...nextObservationReviewPolicyContext,
};

if (process.argv.includes("--generate")) {
  const policy = createControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicy(
    reviewAuthorizationContext,
  );
  const memory = createControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory({ policy });
  console.log(JSON.stringify({ policy, memory }, null, 2));
  process.exit(0);
}

const nextReviewAuthorizationPolicy = readJson("config/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-policy.json");
const nextReviewAuthorizationMemory = readJson("config/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-memory.json");
const authorizationInspections = [
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicy(
    nextReviewAuthorizationPolicy,
    reviewAuthorizationContext,
  ),
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory(
    nextReviewAuthorizationMemory,
    { policy: nextReviewAuthorizationPolicy },
  ),
];
const failedAuthorization = authorizationInspections.find((inspection) => !inspection.ok);
if (failedAuthorization) {
  throw new Error(`controlled_proof_execution_next_subsequent_continuation_observation_review_authorization_context_invalid:${failedAuthorization.reason}`);
}

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-readiness.v1",
  phase: 244,
  compositionId: nextReviewAuthorizationPolicy.compositionId,
  controlledProofExecutionNextSubsequentContinuationPolicyHash: nextSubsequentContinuationPolicy.policyHash,
  controlledProofExecutionNextSubsequentContinuationMemoryHash: nextSubsequentContinuationMemory.memoryHash,
  controlledProofExecutionNextSubsequentContinuationObservationPolicyHash: nextObservationPolicy.policyHash,
  controlledProofExecutionNextSubsequentContinuationObservationMemoryHash: nextObservationMemory.memoryHash,
  controlledProofExecutionNextSubsequentContinuationObservationReviewPolicyHash: nextObservationReviewPolicy.policyHash,
  controlledProofExecutionNextSubsequentContinuationObservationReviewMemoryHash: nextObservationReviewMemory.memoryHash,
  controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicyHash: nextReviewAuthorizationPolicy.policyHash,
  controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemoryHash: nextReviewAuthorizationMemory.memoryHash,
  trustedReviewAuthorizersConfigured: nextReviewAuthorizationPolicy.trustedReviewAuthorizers.length,
  recordedReviews: nextObservationReviewMemory.summary.recordedReviews,
  recordedReviewAuthorizations: nextReviewAuthorizationMemory.summary.recordedReviewAuthorizations,
  acceptedReviewsAuthorized: nextReviewAuthorizationMemory.summary.acceptedReviewsAuthorized,
  trustedNextSubsequentContinuationObservationReviewersConfigured:
    nextObservationReviewPolicy.trustedNextSubsequentContinuationObservationReviewers.length,
  recordedNextSubsequentContinuationObservationReviews: nextObservationReviewMemory.summary.recordedReviews,
  reviewedNextSubsequentContinuationObservations: nextObservationReviewMemory.summary.reviewedObservations,
  acceptedNextSubsequentContinuationObservations: nextObservationReviewMemory.summary.acceptedObservations,
  rejectedNextSubsequentContinuationObservations: nextObservationReviewMemory.summary.rejectedObservations,
  trustedNextSubsequentContinuationObserversConfigured:
    nextObservationPolicy.trustedNextSubsequentContinuationObservers.length,
  recordedNextSubsequentContinuations:
    nextSubsequentContinuationMemory.summary.recordedNextSubsequentContinuations,
  recordedNextSubsequentContinuationObservations:
    nextObservationMemory.summary.recordedSubsequentContinuationObservations,
  observedNextSubsequentContinuations:
    nextObservationMemory.summary.observedSubsequentContinuations,
  readiness: "awaiting_accepted_signed_recorded_review_and_trusted_independent_authorizer",
  nextSubsequentContinuationAuthorizationAllowed:
    nextReviewAuthorizationPolicy.nextSubsequentContinuationAuthorizationAllowed,
  nextSubsequentContinuationAuthorized:
    nextReviewAuthorizationMemory.summary.nextSubsequentContinuationAuthorized,
  nextSubsequentContinuationExecuted: false,
  nextSubsequentContinuationExecuted:
    nextObservationMemory.summary.nextSubsequentContinuationExecuted,
  nextSubsequentContinuationObserved:
    nextObservationMemory.summary.nextSubsequentContinuationObserved,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
