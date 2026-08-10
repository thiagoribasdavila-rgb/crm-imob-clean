import { readFileSync } from "node:fs";
import {
  inspectControlledExternalPublicationExecutionAcceptanceMemory,
  inspectControlledExternalPublicationExecutionAcceptancePolicy,
} from "../lib/release/controlled-external-publication-execution-acceptance.mjs";
import {
  inspectControlledExternalPublicationExecutionHandoffMemory,
  inspectControlledExternalPublicationExecutionHandoffPolicy,
} from "../lib/release/controlled-external-publication-execution-handoff.mjs";

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
const consumptionPolicy = readJson("config/controlled-external-publication-authorization-consumption-policy.json");
const handoffPolicy = readJson("config/controlled-external-publication-execution-handoff-policy.json");
const handoffMemory = readJson("config/controlled-external-publication-execution-handoff-memory.json");
const acceptancePolicy = readJson("config/controlled-external-publication-execution-acceptance-policy.json");
const acceptanceMemory = readJson("config/controlled-external-publication-execution-acceptance-memory.json");

const upstreamContext = {
  controlledExternalPublicationAuthorizationConsumptionPolicy: consumptionPolicy,
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
const handoffContext = {
  controlledExternalPublicationExecutionHandoffPolicy: handoffPolicy,
  ...upstreamContext,
};
const inspections = [
  inspectControlledExternalPublicationExecutionHandoffPolicy(handoffPolicy, upstreamContext),
  inspectControlledExternalPublicationExecutionHandoffMemory(handoffMemory, { policy: handoffPolicy }),
  inspectControlledExternalPublicationExecutionAcceptancePolicy(acceptancePolicy, handoffContext),
  inspectControlledExternalPublicationExecutionAcceptanceMemory(acceptanceMemory, { policy: acceptancePolicy }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) throw new Error(`controlled_external_publication_execution_acceptance_context_invalid:${failed.reason}`);

console.log(JSON.stringify({
  schema: "atlas.controlled-external-publication-execution-acceptance-readiness.v1",
  phase: 224,
  compositionId: acceptancePolicy.compositionId,
  executionHandoffPolicyHash: handoffPolicy.policyHash,
  executionHandoffMemoryHash: handoffMemory.memoryHash,
  executionAcceptancePolicyHash: acceptancePolicy.policyHash,
  executionAcceptanceMemoryHash: acceptanceMemory.memoryHash,
  trustedExternalExecutorsConfigured: acceptancePolicy.trustedExternalExecutors.length,
  recordedHandoffs: handoffMemory.summary.recordedHandoffs,
  recordedAcceptanceDecisions: acceptanceMemory.summary.recordedDecisions,
  accepted: acceptanceMemory.summary.accepted,
  rejected: acceptanceMemory.summary.rejected,
  distinctHandoffs: acceptanceMemory.summary.distinctHandoffs,
  readiness: "awaiting_recorded_handoff_target_executor_acceptance_decision",
  handoffPrepared: false,
  executionAccepted: false,
  publicationExecutionPermitted: false,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
