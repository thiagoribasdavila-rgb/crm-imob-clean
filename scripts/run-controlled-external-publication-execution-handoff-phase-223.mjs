import { readFileSync } from "node:fs";
import {
  inspectControlledExternalPublicationExecutionHandoffMemory,
  inspectControlledExternalPublicationExecutionHandoffPolicy,
} from "../lib/release/controlled-external-publication-execution-handoff.mjs";
import {
  inspectControlledExternalPublicationAuthorizationConsumptionMemory,
  inspectControlledExternalPublicationAuthorizationConsumptionPolicy,
} from "../lib/release/controlled-external-publication-authorization-consumption.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const authorizedPublicationExecutionPolicy = readJson("config/authorized-publication-execution-policy.json");
const executionAuthorizationPolicy = readJson("config/authorized-publication-execution-authorization-policy.json");
const publicationPolicy = readJson("config/authorized-package-publication-decision-policy.json");
const evidencePolicy = readJson("config/authorized-package-evidence-commitment-policy.json");
const assemblyPolicy = readJson("config/authorized-release-package-assembly-policy.json");
const packageAuthorizationPolicy = readJson("config/approved-release-package-authorization-policy.json");
const publicationEvidenceAdjudicationPolicy = readJson("config/publication-execution-evidence-adjudication-policy.json");
const reviewPolicy = readJson("config/controlled-external-publication-authorization-review-policy.json");
const grantPolicy = readJson("config/controlled-external-publication-authorization-grant-policy.json");
const consumptionPolicy = readJson("config/controlled-external-publication-authorization-consumption-policy.json");
const consumptionMemory = readJson("config/controlled-external-publication-authorization-consumption-memory.json");
const handoffPolicy = readJson("config/controlled-external-publication-execution-handoff-policy.json");
const handoffMemory = readJson("config/controlled-external-publication-execution-handoff-memory.json");

const upstreamContext = {
  controlledExternalPublicationAuthorizationGrantPolicy: grantPolicy,
  controlledExternalPublicationReviewPolicy: reviewPolicy,
  publicationEvidenceAdjudicationPolicy,
  executionPolicy: authorizedPublicationExecutionPolicy,
  executionAuthorizationPolicy,
  publicationPolicy,
  evidencePolicy,
  assemblyPolicy,
  packageAuthorizationPolicy,
};
const inspections = [
  inspectControlledExternalPublicationAuthorizationConsumptionPolicy(consumptionPolicy, upstreamContext),
  inspectControlledExternalPublicationAuthorizationConsumptionMemory(consumptionMemory, { policy: consumptionPolicy }),
  inspectControlledExternalPublicationExecutionHandoffPolicy(handoffPolicy, {
    controlledExternalPublicationAuthorizationConsumptionPolicy: consumptionPolicy,
    ...upstreamContext,
  }),
  inspectControlledExternalPublicationExecutionHandoffMemory(handoffMemory, { policy: handoffPolicy }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) throw new Error(`controlled_external_publication_execution_handoff_context_invalid:${failed.reason}`);

console.log(JSON.stringify({
  schema: "atlas.controlled-external-publication-execution-handoff-readiness.v1",
  phase: 223,
  compositionId: handoffPolicy.compositionId,
  authorizationConsumptionPolicyHash: consumptionPolicy.policyHash,
  authorizationConsumptionMemoryHash: consumptionMemory.memoryHash,
  executionHandoffPolicyHash: handoffPolicy.policyHash,
  executionHandoffMemoryHash: handoffMemory.memoryHash,
  trustedHandoffIssuersConfigured: handoffPolicy.trustedHandoffIssuers.length,
  trustedExternalExecutorsConfigured: handoffPolicy.trustedExternalExecutors.length,
  recordedConsumptions: consumptionMemory.summary.recordedConsumptions,
  recordedHandoffs: handoffMemory.summary.recordedHandoffs,
  distinctConsumedAuthorizations: handoffMemory.summary.distinctConsumedAuthorizations,
  readiness: "awaiting_recorded_consumption_independent_handoff_issuer_and_external_executor",
  authorizationConsumed: false,
  handoffPrepared: false,
  executionAccepted: false,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
