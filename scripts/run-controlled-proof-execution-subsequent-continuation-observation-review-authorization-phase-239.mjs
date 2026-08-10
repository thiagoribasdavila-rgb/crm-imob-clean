import { readFileSync, writeFileSync } from "node:fs";
import {
  createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory,
  createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy,
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
const policyPath = "config/controlled-proof-execution-subsequent-continuation-observation-review-authorization-policy.json";
const memoryPath = "config/controlled-proof-execution-subsequent-continuation-observation-review-authorization-memory.json";

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
];
const invalidUpstream = upstreamInspections.find((inspection) => !inspection.ok);
if (invalidUpstream) {
  throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_context_invalid:${invalidUpstream.reason}`);
}

const authorizationContext = {
  controlledProofExecutionSubsequentContinuationObservationReviewPolicy: observationReviewPolicy,
  trustedReviewAuthorizers: [],
  maximumReviewAuthorizationDelaySeconds: 300,
  maximumReviewAuthorizationTtlSeconds: 300,
  ...observationReviewPolicyContext,
};

if (process.argv.includes("--generate") || process.argv.includes("--write")) {
  const policy = createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy(
    authorizationContext,
  );
  const memory = createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory({ policy });
  if (process.argv.includes("--write")) {
    writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
    writeFileSync(memoryPath, `${JSON.stringify(memory, null, 2)}\n`);
    console.log(JSON.stringify({ written: [policyPath, memoryPath], policyHash: policy.policyHash, memoryHash: memory.memoryHash }, null, 2));
  } else {
    console.log(JSON.stringify({ policy, memory }, null, 2));
  }
  process.exit(0);
}

const authorizationPolicy = readJson(policyPath);
const authorizationMemory = readJson(memoryPath);
const inspections = [
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy(
    authorizationPolicy,
    authorizationContext,
  ),
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory(
    authorizationMemory,
    { policy: authorizationPolicy },
  ),
];
const failed = inspections.find((inspection) => !inspection.ok);
if (failed) {
  throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_context_invalid:${failed.reason}`);
}

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-subsequent-continuation-observation-review-authorization-readiness.v1",
  phase: 239,
  compositionId: authorizationPolicy.compositionId,
  controlledProofExecutionSubsequentContinuationObservationReviewPolicyHash: observationReviewPolicy.policyHash,
  controlledProofExecutionSubsequentContinuationObservationReviewMemoryHash: observationReviewMemory.memoryHash,
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicyHash: authorizationPolicy.policyHash,
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemoryHash: authorizationMemory.memoryHash,
  trustedReviewAuthorizersConfigured: authorizationPolicy.trustedReviewAuthorizers.length,
  recordedReviews: observationReviewMemory.summary.recordedReviews,
  recordedReviewAuthorizations: authorizationMemory.summary.recordedReviewAuthorizations,
  acceptedReviewsAuthorized: authorizationMemory.summary.acceptedReviewsAuthorized,
  readiness: "awaiting_accepted_signed_recorded_review_and_trusted_independent_authorizer",
  subsequentContinuationAuthorizationAllowed: authorizationPolicy.subsequentContinuationAuthorizationAllowed,
  subsequentContinuationAuthorized: authorizationMemory.summary.subsequentContinuationAuthorized,
  subsequentContinuationExecuted: false,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
