import { readFileSync } from "node:fs";
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
const reviewPolicy = readJson("config/controlled-external-publication-authorization-review-policy.json");
const grantPolicy = readJson("config/controlled-external-publication-authorization-grant-policy.json");
const authorizationConsumptionPolicy = readJson("config/controlled-external-publication-authorization-consumption-policy.json");
const handoffPolicy = readJson("config/controlled-external-publication-execution-handoff-policy.json");
const acceptancePolicy = readJson("config/controlled-external-publication-execution-acceptance-policy.json");
const permitPolicy = readJson("config/controlled-external-publication-execution-permit-grant-policy.json");
const permitConsumptionPolicy = readJson("config/controlled-external-publication-execution-permit-consumption-policy.json");
const startAuthorizationPolicy = readJson("config/controlled-proof-execution-start-authorization-policy.json");
const startAuthorizationMemory = readJson("config/controlled-proof-execution-start-authorization-memory.json");
const startPolicy = readJson("config/controlled-proof-execution-start-policy.json");
const startMemory = readJson("config/controlled-proof-execution-start-memory.json");

const upstreamContext = {
  controlledExternalPublicationExecutionPermitConsumptionPolicy: permitConsumptionPolicy,
  controlledExternalPublicationExecutionPermitGrantPolicy: permitPolicy,
  controlledExternalPublicationExecutionAcceptancePolicy: acceptancePolicy,
  controlledExternalPublicationExecutionHandoffPolicy: handoffPolicy,
  controlledExternalPublicationAuthorizationConsumptionPolicy: authorizationConsumptionPolicy,
  controlledExternalPublicationAuthorizationGrantPolicy: grantPolicy,
  controlledExternalPublicationReviewPolicy: reviewPolicy,
  publicationEvidenceAdjudicationPolicy,
  executionPolicy,
  executionAuthorizationPolicy,
  publicationPolicy,
  evidencePolicy,
  assemblyPolicy,
  packageAuthorizationPolicy,
};
const authorizationInspection = inspectControlledProofExecutionStartAuthorizationPolicy(
  startAuthorizationPolicy,
  upstreamContext,
);
const authorizationMemoryInspection = inspectControlledProofExecutionStartAuthorizationMemory(
  startAuthorizationMemory,
  { policy: startAuthorizationPolicy },
);
const startContext = {
  controlledProofExecutionStartAuthorizationPolicy: startAuthorizationPolicy,
  ...upstreamContext,
};
const startInspection = inspectControlledProofExecutionStartPolicy(startPolicy, startContext);
const startMemoryInspection = inspectControlledProofExecutionStartMemory(startMemory, { policy: startPolicy });
const failed = [authorizationInspection, authorizationMemoryInspection, startInspection, startMemoryInspection]
  .find((inspection) => !inspection.ok);
if (failed) throw new Error(`controlled_proof_execution_start_context_invalid:${failed.reason}`);

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-start-readiness.v1",
  phase: 228,
  compositionId: startPolicy.compositionId,
  controlledProofExecutionStartAuthorizationPolicyHash: startAuthorizationPolicy.policyHash,
  controlledProofExecutionStartAuthorizationMemoryHash: startAuthorizationMemory.memoryHash,
  controlledProofExecutionStartPolicyHash: startPolicy.policyHash,
  controlledProofExecutionStartMemoryHash: startMemory.memoryHash,
  trustedStartExecutorsConfigured: startPolicy.trustedStartExecutors.length,
  recordedExecutionStarts: startMemory.summary.recordedExecutionStarts,
  consumedStartAuthorizations: startMemory.summary.consumedStartAuthorizations,
  distinctExecutionStarts: startMemory.summary.distinctExecutionStarts,
  readiness: "awaiting_valid_recorded_start_authorization_and_target_external_executor",
  controlledProofExecutionStartAllowed: startPolicy.controlledProofExecutionStartAllowed,
  controlledProofExecutionStarted: startMemory.summary.controlledProofExecutionStarted,
  controlledProofExecutionObserved: startMemory.summary.controlledProofExecutionObserved,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
