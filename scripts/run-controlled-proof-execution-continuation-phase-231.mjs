import { readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionContinuationMemory,
  inspectControlledProofExecutionContinuationPolicy,
} from "../lib/release/controlled-proof-execution-continuation.mjs";
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
const startAuthorizationMemory = readJson("config/controlled-proof-execution-start-authorization-memory.json");
const startPolicy = readJson("config/controlled-proof-execution-start-policy.json");
const startMemory = readJson("config/controlled-proof-execution-start-memory.json");
const observationPolicy = readJson("config/controlled-proof-execution-observation-policy.json");
const observationMemory = readJson("config/controlled-proof-execution-observation-memory.json");
const authorizationPolicy = readJson("config/controlled-proof-execution-continuation-authorization-policy.json");
const authorizationMemory = readJson("config/controlled-proof-execution-continuation-authorization-memory.json");
const continuationPolicy = readJson("config/controlled-proof-execution-continuation-policy.json");
const continuationMemory = readJson("config/controlled-proof-execution-continuation-memory.json");

const startContext = { controlledProofExecutionStartAuthorizationPolicy: startAuthorizationPolicy, ...upstreamContext };
const observationContext = {
  controlledProofExecutionStartPolicy: startPolicy,
  trustedProofObservers: observationPolicy.trustedProofObservers,
  maximumObservationDelaySeconds: observationPolicy.maximumObservationDelaySeconds,
  ...startContext,
};
const authorizationContext = {
  controlledProofExecutionObservationPolicy: observationPolicy,
  trustedContinuationAuthorizers: authorizationPolicy.trustedContinuationAuthorizers,
  maximumAuthorizationDelaySeconds: authorizationPolicy.maximumAuthorizationDelaySeconds,
  maximumAuthorizationTtlSeconds: authorizationPolicy.maximumAuthorizationTtlSeconds,
  ...observationContext,
};
const continuationContext = {
  controlledProofExecutionContinuationAuthorizationPolicy: authorizationPolicy,
  controlledProofExecutionStartPolicy: startPolicy,
  ...authorizationContext,
};
const inspections = [
  inspectControlledProofExecutionStartAuthorizationPolicy(startAuthorizationPolicy, upstreamContext),
  inspectControlledProofExecutionStartAuthorizationMemory(startAuthorizationMemory, { policy: startAuthorizationPolicy }),
  inspectControlledProofExecutionStartPolicy(startPolicy, startContext),
  inspectControlledProofExecutionStartMemory(startMemory, { policy: startPolicy }),
  inspectControlledProofExecutionObservationPolicy(observationPolicy, observationContext),
  inspectControlledProofExecutionObservationMemory(observationMemory, { policy: observationPolicy }),
  inspectControlledProofExecutionContinuationAuthorizationPolicy(authorizationPolicy, authorizationContext),
  inspectControlledProofExecutionContinuationAuthorizationMemory(authorizationMemory, { policy: authorizationPolicy }),
  inspectControlledProofExecutionContinuationPolicy(continuationPolicy, continuationContext),
  inspectControlledProofExecutionContinuationMemory(continuationMemory, { policy: continuationPolicy }),
];
const failed = inspections.find((inspection) => !inspection.ok);
if (failed) throw new Error(`controlled_proof_execution_continuation_context_invalid:${failed.reason}`);

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-continuation-readiness.v1",
  phase: 231,
  compositionId: continuationPolicy.compositionId,
  controlledProofExecutionContinuationAuthorizationPolicyHash: authorizationPolicy.policyHash,
  controlledProofExecutionContinuationAuthorizationMemoryHash: authorizationMemory.memoryHash,
  controlledProofExecutionContinuationPolicyHash: continuationPolicy.policyHash,
  controlledProofExecutionContinuationMemoryHash: continuationMemory.memoryHash,
  trustedContinuationExecutorsConfigured: continuationPolicy.trustedContinuationExecutors.length,
  recordedContinuationAuthorizations: authorizationMemory.summary.recordedContinuationAuthorizations,
  recordedContinuations: continuationMemory.summary.recordedContinuations,
  consumedContinuationAuthorizations: continuationMemory.summary.consumedContinuationAuthorizations,
  readiness: "awaiting_valid_recorded_continuation_authorization_and_trusted_continuation_executor",
  controlledProofExecutionContinuationAllowed: continuationPolicy.controlledProofExecutionContinuationAllowed,
  controlledProofExecutionContinued: continuationMemory.summary.controlledProofExecutionContinued,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false
}, null, 2));
