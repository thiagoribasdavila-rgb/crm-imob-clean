import { readFileSync } from "node:fs";
import {
  createControlledProofExecutionSubsequentContinuationObservationMemory,
  createControlledProofExecutionSubsequentContinuationObservationPolicy,
  inspectControlledProofExecutionSubsequentContinuationObservationMemory,
  inspectControlledProofExecutionSubsequentContinuationObservationPolicy,
} from "../lib/release/controlled-proof-execution-subsequent-continuation-observation.mjs";
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

const subsequentInspection = inspectControlledProofExecutionSubsequentContinuationPolicy(subsequentPolicy, subsequentContext);
if (!subsequentInspection.ok) {
  throw new Error(`controlled_proof_execution_subsequent_continuation_policy_invalid:${subsequentInspection.reason}`);
}
const subsequentMemoryInspection = inspectControlledProofExecutionSubsequentContinuationMemory(subsequentMemory, { policy: subsequentPolicy });
if (!subsequentMemoryInspection.ok) {
  throw new Error(`controlled_proof_execution_subsequent_continuation_memory_invalid:${subsequentMemoryInspection.reason}`);
}

const observationPolicyContext = {
  controlledProofExecutionSubsequentContinuationPolicy: subsequentPolicy,
  controlledProofExecutionSubsequentContinuationPolicyContext: subsequentContext,
  trustedSubsequentContinuationObservers: [],
  maximumSubsequentContinuationObservationDelaySeconds: 300,
};

if (process.argv.includes("--generate")) {
  const policy = createControlledProofExecutionSubsequentContinuationObservationPolicy(observationPolicyContext);
  const memory = createControlledProofExecutionSubsequentContinuationObservationMemory({ policy });
  console.log(JSON.stringify({ policy, memory }, null, 2));
  process.exit(0);
}

const observationPolicy = readJson("config/controlled-proof-execution-subsequent-continuation-observation-policy.json");
const observationMemory = readJson("config/controlled-proof-execution-subsequent-continuation-observation-memory.json");
const inspections = [
  inspectControlledProofExecutionSubsequentContinuationObservationPolicy(observationPolicy, observationPolicyContext),
  inspectControlledProofExecutionSubsequentContinuationObservationMemory(observationMemory, { policy: observationPolicy }),
];
const failed = inspections.find((inspection) => !inspection.ok);
if (failed) throw new Error(`controlled_proof_execution_subsequent_continuation_observation_context_invalid:${failed.reason}`);

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-subsequent-continuation-observation-readiness.v1",
  phase: 237,
  compositionId: observationPolicy.compositionId,
  controlledProofExecutionSubsequentContinuationPolicyHash: subsequentPolicy.policyHash,
  controlledProofExecutionSubsequentContinuationMemoryHash: subsequentMemory.memoryHash,
  controlledProofExecutionSubsequentContinuationObservationPolicyHash: observationPolicy.policyHash,
  controlledProofExecutionSubsequentContinuationObservationMemoryHash: observationMemory.memoryHash,
  trustedSubsequentContinuationObserversConfigured: observationPolicy.trustedSubsequentContinuationObservers.length,
  recordedSubsequentContinuations: subsequentMemory.summary.recordedSubsequentContinuations,
  recordedSubsequentContinuationObservations: observationMemory.summary.recordedSubsequentContinuationObservations,
  observedSubsequentContinuations: observationMemory.summary.observedSubsequentContinuations,
  readiness: "awaiting_valid_recorded_subsequent_continuation_and_trusted_independent_observer",
  subsequentContinuationObservationAllowed: observationPolicy.subsequentContinuationObservationAllowed,
  subsequentContinuationExecuted: observationMemory.summary.subsequentContinuationExecuted,
  subsequentContinuationObserved: observationMemory.summary.subsequentContinuationObserved,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
