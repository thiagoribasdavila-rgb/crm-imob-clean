import { readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionSubsequentContinuationMemory,
  inspectControlledProofExecutionSubsequentContinuationPolicy,
} from "../lib/release/controlled-proof-execution-subsequent-continuation.mjs";

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
const consumptionMemory = readJson("config/controlled-proof-execution-continuation-observation-review-authorization-consumption-memory.json");
const subsequentPolicy = readJson("config/controlled-proof-execution-subsequent-continuation-policy.json");
const subsequentMemory = readJson("config/controlled-proof-execution-subsequent-continuation-memory.json");

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

const policyInspection = inspectControlledProofExecutionSubsequentContinuationPolicy(subsequentPolicy, subsequentContext);
if (!policyInspection.ok) {
  throw new Error(`controlled_proof_execution_subsequent_continuation_policy_invalid:${policyInspection.reason}`);
}
const memoryInspection = inspectControlledProofExecutionSubsequentContinuationMemory(subsequentMemory, { policy: subsequentPolicy });
if (!memoryInspection.ok) {
  throw new Error(`controlled_proof_execution_subsequent_continuation_memory_invalid:${memoryInspection.reason}`);
}

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-subsequent-continuation-readiness.v1",
  phase: 236,
  compositionId: subsequentPolicy.compositionId,
  controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicyHash: consumptionPolicy.policyHash,
  controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemoryHash: consumptionMemory.memoryHash,
  controlledProofExecutionSubsequentContinuationPolicyHash: subsequentPolicy.policyHash,
  controlledProofExecutionSubsequentContinuationMemoryHash: subsequentMemory.memoryHash,
  trustedSubsequentContinuationExecutorsConfigured: subsequentPolicy.trustedSubsequentContinuationExecutors.length,
  recordedAuthorizationConsumptions: consumptionMemory.summary.recordedConsumptions,
  recordedSubsequentContinuations: subsequentMemory.summary.recordedSubsequentContinuations,
  consumedAuthorizationConsumptions: subsequentMemory.summary.consumedAuthorizationConsumptions,
  readiness: "awaiting_recorded_signed_consumption_and_trusted_independent_executor",
  subsequentContinuationAllowed: subsequentPolicy.subsequentContinuationAllowed,
  subsequentContinuationAuthorizationConsumed: subsequentMemory.summary.subsequentContinuationAuthorizationConsumed,
  subsequentContinuationExecuted: subsequentMemory.summary.subsequentContinuationExecuted,
  subsequentContinuationObserved: subsequentMemory.summary.subsequentContinuationObserved,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
