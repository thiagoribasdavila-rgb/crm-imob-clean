import { readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory,
  inspectControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy,
} from "../lib/release/controlled-proof-execution-continuation-observation-review-authorization-consumption.mjs";
import {
  inspectControlledProofExecutionContinuationObservationReviewAuthorizationMemory,
  inspectControlledProofExecutionContinuationObservationReviewAuthorizationPolicy,
} from "../lib/release/controlled-proof-execution-continuation-observation-review-authorization.mjs";
import {
  inspectControlledProofExecutionContinuationObservationReviewMemory,
  inspectControlledProofExecutionContinuationObservationReviewPolicy,
} from "../lib/release/controlled-proof-execution-continuation-observation-review.mjs";

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
const reviewMemory = readJson("config/controlled-proof-execution-continuation-observation-review-memory.json");
const authorizationPolicy = readJson("config/controlled-proof-execution-continuation-observation-review-authorization-policy.json");
const authorizationMemory = readJson("config/controlled-proof-execution-continuation-observation-review-authorization-memory.json");
const consumptionPolicy = readJson("config/controlled-proof-execution-continuation-observation-review-authorization-consumption-policy.json");
const consumptionMemory = readJson("config/controlled-proof-execution-continuation-observation-review-authorization-consumption-memory.json");

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
const consumptionContext = {
  controlledProofExecutionContinuationObservationReviewAuthorizationPolicy: authorizationPolicy,
  trustedReviewAuthorizationConsumers: consumptionPolicy.trustedReviewAuthorizationConsumers,
  ...authorizationContext,
};

const inspections = [
  inspectControlledProofExecutionContinuationObservationReviewPolicy(reviewPolicy, reviewContext),
  inspectControlledProofExecutionContinuationObservationReviewMemory(reviewMemory, { policy: reviewPolicy }),
  inspectControlledProofExecutionContinuationObservationReviewAuthorizationPolicy(authorizationPolicy, authorizationContext),
  inspectControlledProofExecutionContinuationObservationReviewAuthorizationMemory(authorizationMemory, { policy: authorizationPolicy }),
  inspectControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy(consumptionPolicy, consumptionContext),
  inspectControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory(consumptionMemory, { policy: consumptionPolicy }),
];
const failed = inspections.find((inspection) => !inspection.ok);
if (failed) throw new Error(`controlled_proof_execution_continuation_observation_review_authorization_consumption_context_invalid:${failed.reason}`);

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-continuation-observation-review-authorization-consumption-readiness.v1",
  phase: 235,
  compositionId: consumptionPolicy.compositionId,
  controlledProofExecutionContinuationObservationReviewAuthorizationPolicyHash: authorizationPolicy.policyHash,
  controlledProofExecutionContinuationObservationReviewAuthorizationMemoryHash: authorizationMemory.memoryHash,
  controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicyHash: consumptionPolicy.policyHash,
  controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemoryHash: consumptionMemory.memoryHash,
  trustedReviewAuthorizationConsumersConfigured: consumptionPolicy.trustedReviewAuthorizationConsumers.length,
  recordedReviewAuthorizations: authorizationMemory.summary.recordedReviewAuthorizations,
  recordedAuthorizationConsumptions: consumptionMemory.summary.recordedConsumptions,
  consumedSingleUseAuthorizations: consumptionMemory.summary.consumedSingleUseAuthorizations,
  readiness: "awaiting_recorded_unexpired_single_use_authorization_and_trusted_independent_consumer",
  authorizationConsumptionAllowed: consumptionPolicy.authorizationConsumptionAllowed,
  reviewAuthorizationConsumed: false,
  subsequentContinuationAuthorizationConsumed: consumptionMemory.summary.subsequentContinuationAuthorizationConsumed,
  subsequentContinuationExecuted: false,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
