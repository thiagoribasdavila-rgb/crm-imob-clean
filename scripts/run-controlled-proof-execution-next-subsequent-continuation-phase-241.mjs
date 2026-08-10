import { readFileSync, writeFileSync } from "node:fs";
import {
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
} from "../lib/release/controlled-proof-execution-subsequent-continuation-observation-review-authorization-consumption.mjs";
import {
  createControlledProofExecutionNextSubsequentContinuationMemory,
  createControlledProofExecutionNextSubsequentContinuationPolicy,
  inspectControlledProofExecutionNextSubsequentContinuationMemory,
  inspectControlledProofExecutionNextSubsequentContinuationPolicy,
} from "../lib/release/controlled-proof-execution-next-subsequent-continuation.mjs";
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
const consumptionPolicyPath = "config/controlled-proof-execution-subsequent-continuation-observation-review-authorization-consumption-policy.json";
const consumptionMemoryPath = "config/controlled-proof-execution-subsequent-continuation-observation-review-authorization-consumption-memory.json";
const policyPath = "config/controlled-proof-execution-next-subsequent-continuation-policy.json";
const memoryPath = "config/controlled-proof-execution-next-subsequent-continuation-memory.json";

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

const authorizationInspections = [
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy(
    reviewAuthorizationPolicy,
    authorizationContext,
  ),
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory(
    reviewAuthorizationMemory,
    { policy: reviewAuthorizationPolicy },
  ),
];
const invalidAuthorization = authorizationInspections.find((inspection) => !inspection.ok);
if (invalidAuthorization) {
  throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_context_invalid:${invalidAuthorization.reason}`);
}

const consumptionContext = {
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy: reviewAuthorizationPolicy,
  trustedReviewAuthorizationConsumers: [],
  ...authorizationContext,
};

const authorizationConsumptionPolicy = readJson(consumptionPolicyPath);
const authorizationConsumptionMemory = readJson(consumptionMemoryPath);
const consumptionInspections = [
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(
    authorizationConsumptionPolicy,
    consumptionContext,
  ),
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory(
    authorizationConsumptionMemory,
    { policy: authorizationConsumptionPolicy },
  ),
];
const invalidConsumption = consumptionInspections.find((inspection) => !inspection.ok);
if (invalidConsumption) {
  throw new Error(`controlled_proof_execution_subsequent_continuation_observation_review_authorization_consumption_context_invalid:${invalidConsumption.reason}`);
}

const nextSubsequentContinuationContext = {
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy:
    authorizationConsumptionPolicy,
  trustedNextSubsequentContinuationExecutors: [],
  ...consumptionContext,
};

if (process.argv.includes("--generate") || process.argv.includes("--write")) {
  const policy = createControlledProofExecutionNextSubsequentContinuationPolicy(
    nextSubsequentContinuationContext,
  );
  const memory = createControlledProofExecutionNextSubsequentContinuationMemory({ policy });
  if (process.argv.includes("--write")) {
    writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
    writeFileSync(memoryPath, `${JSON.stringify(memory, null, 2)}\n`);
    console.log(JSON.stringify({
      written: [policyPath, memoryPath],
      policyHash: policy.policyHash,
      memoryHash: memory.memoryHash,
    }, null, 2));
  } else {
    console.log(JSON.stringify({ policy, memory }, null, 2));
  }
  process.exit(0);
}

const nextSubsequentContinuationPolicy = readJson(policyPath);
const nextSubsequentContinuationMemory = readJson(memoryPath);
const inspections = [
  inspectControlledProofExecutionNextSubsequentContinuationPolicy(
    nextSubsequentContinuationPolicy,
    nextSubsequentContinuationContext,
  ),
  inspectControlledProofExecutionNextSubsequentContinuationMemory(
    nextSubsequentContinuationMemory,
    { policy: nextSubsequentContinuationPolicy },
  ),
];
const failed = inspections.find((inspection) => !inspection.ok);
if (failed) {
  throw new Error(`controlled_proof_execution_next_subsequent_continuation_context_invalid:${failed.reason}`);
}

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-next-subsequent-continuation-readiness.v1",
  phase: 241,
  compositionId: nextSubsequentContinuationPolicy.compositionId,
  controlledProofExecutionSubsequentContinuationObservationReviewPolicyHash: observationReviewPolicy.policyHash,
  controlledProofExecutionSubsequentContinuationObservationReviewMemoryHash: observationReviewMemory.memoryHash,
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicyHash: reviewAuthorizationPolicy.policyHash,
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemoryHash: reviewAuthorizationMemory.memoryHash,
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicyHash: authorizationConsumptionPolicy.policyHash,
  controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemoryHash: authorizationConsumptionMemory.memoryHash,
  controlledProofExecutionNextSubsequentContinuationPolicyHash: nextSubsequentContinuationPolicy.policyHash,
  controlledProofExecutionNextSubsequentContinuationMemoryHash: nextSubsequentContinuationMemory.memoryHash,
  trustedNextSubsequentContinuationExecutorsConfigured:
    nextSubsequentContinuationPolicy.trustedNextSubsequentContinuationExecutors.length,
  recordedAuthorizationConsumptions: authorizationConsumptionMemory.summary.recordedConsumptions,
  recordedNextSubsequentContinuations:
    nextSubsequentContinuationMemory.summary.recordedNextSubsequentContinuations,
  consumedAuthorizationConsumptions:
    nextSubsequentContinuationMemory.summary.consumedAuthorizationConsumptions,
  readiness: "awaiting_recorded_signed_authorization_consumption_and_trusted_independent_next_subsequent_continuation_executor",
  nextSubsequentContinuationAllowed: nextSubsequentContinuationPolicy.nextSubsequentContinuationAllowed,
  subsequentContinuationAuthorizationConsumed:
    authorizationConsumptionMemory.summary.subsequentContinuationAuthorizationConsumed,
  nextSubsequentContinuationAuthorizationConsumed:
    nextSubsequentContinuationMemory.summary.nextSubsequentContinuationAuthorizationConsumed,
  nextSubsequentContinuationExecuted:
    nextSubsequentContinuationMemory.summary.nextSubsequentContinuationExecuted,
  nextSubsequentContinuationObserved:
    nextSubsequentContinuationMemory.summary.nextSubsequentContinuationObserved,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
