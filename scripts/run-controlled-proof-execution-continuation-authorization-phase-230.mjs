import { readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionContinuationAuthorizationMemory,
  inspectControlledProofExecutionContinuationAuthorizationPolicy,
} from "../lib/release/controlled-proof-execution-continuation-authorization.mjs";
import {
  inspectControlledProofExecutionObservationMemory,
  inspectControlledProofExecutionObservationPolicy,
} from "../lib/release/controlled-proof-execution-observation.mjs";
import {
  inspectControlledProofExecutionStartMemory,
  inspectControlledProofExecutionStartPolicy,
} from "../lib/release/controlled-proof-execution-start.mjs";
import {
  inspectControlledProofExecutionStartAuthorizationMemory,
  inspectControlledProofExecutionStartAuthorizationPolicy,
} from "../lib/release/controlled-proof-execution-start-authorization.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const executionPolicy = readJson("config/authorized-publication-execution-policy.json");
const executionAuthorizationPolicy = readJson("config/authorized-publication-execution-authorization-policy.json");
const publicationPolicy = readJson("config/authorized-package-publication-decision-policy.json");
const evidencePolicy = readJson("config/authorized-package-evidence-commitment-policy.json");
const assemblyPolicy = readJson("config/authorized-release-package-assembly-policy.json");
const packageAuthorizationPolicy = readJson("config/approved-release-package-authorization-policy.json");
const publicationEvidenceAdjudicationPolicy = readJson("config/publication-execution-evidence-adjudication-policy.json");
const controlledExternalPublicationReviewPolicy = readJson("config/controlled-external-publication-authorization-review-policy.json");
const controlledExternalPublicationAuthorizationGrantPolicy = readJson("config/controlled-external-publication-authorization-grant-policy.json");
const controlledExternalPublicationAuthorizationConsumptionPolicy = readJson("config/controlled-external-publication-authorization-consumption-policy.json");
const controlledExternalPublicationExecutionHandoffPolicy = readJson("config/controlled-external-publication-execution-handoff-policy.json");
const controlledExternalPublicationExecutionAcceptancePolicy = readJson("config/controlled-external-publication-execution-acceptance-policy.json");
const controlledExternalPublicationExecutionPermitGrantPolicy = readJson("config/controlled-external-publication-execution-permit-grant-policy.json");
const controlledExternalPublicationExecutionPermitConsumptionPolicy = readJson("config/controlled-external-publication-execution-permit-consumption-policy.json");
const controlledProofExecutionStartAuthorizationPolicy = readJson("config/controlled-proof-execution-start-authorization-policy.json");
const controlledProofExecutionStartAuthorizationMemory = readJson("config/controlled-proof-execution-start-authorization-memory.json");
const controlledProofExecutionStartPolicy = readJson("config/controlled-proof-execution-start-policy.json");
const controlledProofExecutionStartMemory = readJson("config/controlled-proof-execution-start-memory.json");
const observationPolicy = readJson("config/controlled-proof-execution-observation-policy.json");
const observationMemory = readJson("config/controlled-proof-execution-observation-memory.json");
const continuationAuthorizationPolicy = readJson("config/controlled-proof-execution-continuation-authorization-policy.json");
const continuationAuthorizationMemory = readJson("config/controlled-proof-execution-continuation-authorization-memory.json");

const upstreamContext = {
  controlledExternalPublicationExecutionPermitConsumptionPolicy,
  controlledExternalPublicationExecutionPermitGrantPolicy,
  controlledExternalPublicationExecutionAcceptancePolicy,
  controlledExternalPublicationExecutionHandoffPolicy,
  controlledExternalPublicationAuthorizationConsumptionPolicy,
  controlledExternalPublicationAuthorizationGrantPolicy,
  controlledExternalPublicationReviewPolicy,
  publicationEvidenceAdjudicationPolicy,
  executionPolicy,
  executionAuthorizationPolicy,
  publicationPolicy,
  evidencePolicy,
  assemblyPolicy,
  packageAuthorizationPolicy,
};
const startContext = {
  controlledProofExecutionStartAuthorizationPolicy,
  ...upstreamContext,
};
const observationContext = {
  controlledProofExecutionStartPolicy,
  trustedProofObservers: observationPolicy.trustedProofObservers,
  maximumObservationDelaySeconds: observationPolicy.maximumObservationDelaySeconds,
  ...startContext,
};
const continuationContext = {
  controlledProofExecutionObservationPolicy: observationPolicy,
  trustedContinuationAuthorizers: continuationAuthorizationPolicy.trustedContinuationAuthorizers,
  maximumAuthorizationDelaySeconds: continuationAuthorizationPolicy.maximumAuthorizationDelaySeconds,
  maximumAuthorizationTtlSeconds: continuationAuthorizationPolicy.maximumAuthorizationTtlSeconds,
  ...observationContext,
};
const inspections = [
  inspectControlledProofExecutionStartAuthorizationPolicy(controlledProofExecutionStartAuthorizationPolicy, upstreamContext),
  inspectControlledProofExecutionStartAuthorizationMemory(
    controlledProofExecutionStartAuthorizationMemory,
    { policy: controlledProofExecutionStartAuthorizationPolicy },
  ),
  inspectControlledProofExecutionStartPolicy(controlledProofExecutionStartPolicy, startContext),
  inspectControlledProofExecutionStartMemory(
    controlledProofExecutionStartMemory,
    { policy: controlledProofExecutionStartPolicy },
  ),
  inspectControlledProofExecutionObservationPolicy(observationPolicy, observationContext),
  inspectControlledProofExecutionObservationMemory(observationMemory, { policy: observationPolicy }),
  inspectControlledProofExecutionContinuationAuthorizationPolicy(continuationAuthorizationPolicy, continuationContext),
  inspectControlledProofExecutionContinuationAuthorizationMemory(
    continuationAuthorizationMemory,
    { policy: continuationAuthorizationPolicy },
  ),
];
const failed = inspections.find((inspection) => !inspection.ok);
if (failed) throw new Error(`controlled_proof_execution_continuation_authorization_context_invalid:${failed.reason}`);

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-continuation-authorization-readiness.v1",
  phase: 230,
  compositionId: continuationAuthorizationPolicy.compositionId,
  controlledProofExecutionStartAuthorizationPolicyHash: controlledProofExecutionStartAuthorizationPolicy.policyHash,
  controlledProofExecutionStartAuthorizationMemoryHash: controlledProofExecutionStartAuthorizationMemory.memoryHash,
  controlledProofExecutionStartPolicyHash: controlledProofExecutionStartPolicy.policyHash,
  controlledProofExecutionStartMemoryHash: controlledProofExecutionStartMemory.memoryHash,
  controlledProofExecutionObservationPolicyHash: observationPolicy.policyHash,
  controlledProofExecutionObservationMemoryHash: observationMemory.memoryHash,
  controlledProofExecutionContinuationAuthorizationPolicyHash: continuationAuthorizationPolicy.policyHash,
  controlledProofExecutionContinuationAuthorizationMemoryHash: continuationAuthorizationMemory.memoryHash,
  trustedContinuationAuthorizersConfigured: continuationAuthorizationPolicy.trustedContinuationAuthorizers.length,
  recordedExecutionObservations: observationMemory.summary.recordedExecutionObservations,
  recordedContinuationAuthorizations: continuationAuthorizationMemory.summary.recordedContinuationAuthorizations,
  authorizedObservations: continuationAuthorizationMemory.summary.authorizedObservations,
  distinctContinuationAuthorizations: continuationAuthorizationMemory.summary.distinctAuthorizations,
  readiness: "awaiting_valid_recorded_execution_observation_and_independent_continuation_authorizer",
  controlledProofExecutionContinuationAuthorizationAllowed: continuationAuthorizationPolicy.controlledProofExecutionContinuationAuthorizationAllowed,
  controlledProofExecutionContinuationAuthorized: continuationAuthorizationMemory.summary.controlledProofExecutionContinuationAuthorized,
  controlledProofExecutionContinued: continuationAuthorizationMemory.summary.controlledProofExecutionContinued,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
