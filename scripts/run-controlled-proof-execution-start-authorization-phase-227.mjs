import { readFileSync } from "node:fs";
import {
  inspectControlledExternalPublicationExecutionAcceptanceMemory,
  inspectControlledExternalPublicationExecutionAcceptancePolicy,
} from "../lib/release/controlled-external-publication-execution-acceptance.mjs";
import {
  inspectControlledExternalPublicationExecutionHandoffMemory,
  inspectControlledExternalPublicationExecutionHandoffPolicy,
} from "../lib/release/controlled-external-publication-execution-handoff.mjs";
import {
  inspectControlledExternalPublicationExecutionPermitGrantPolicy,
  inspectControlledExternalPublicationExecutionPermitMemory,
} from "../lib/release/controlled-external-publication-execution-permit-grant.mjs";
import {
  inspectControlledExternalPublicationExecutionPermitConsumptionMemory,
  inspectControlledExternalPublicationExecutionPermitConsumptionPolicy,
} from "../lib/release/controlled-external-publication-execution-permit-consumption.mjs";
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
const handoffMemory = readJson("config/controlled-external-publication-execution-handoff-memory.json");
const acceptancePolicy = readJson("config/controlled-external-publication-execution-acceptance-policy.json");
const acceptanceMemory = readJson("config/controlled-external-publication-execution-acceptance-memory.json");
const permitPolicy = readJson("config/controlled-external-publication-execution-permit-grant-policy.json");
const permitMemory = readJson("config/controlled-external-publication-execution-permit-memory.json");
const permitConsumptionPolicy = readJson("config/controlled-external-publication-execution-permit-consumption-policy.json");
const permitConsumptionMemory = readJson("config/controlled-external-publication-execution-permit-consumption-memory.json");
const startAuthorizationPolicy = readJson("config/controlled-proof-execution-start-authorization-policy.json");
const startAuthorizationMemory = readJson("config/controlled-proof-execution-start-authorization-memory.json");

const upstreamContext = {
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
const handoffContext = {
  controlledExternalPublicationExecutionHandoffPolicy: handoffPolicy,
  ...upstreamContext,
};
const permitContext = {
  controlledExternalPublicationExecutionAcceptancePolicy: acceptancePolicy,
  ...handoffContext,
};
const permitConsumptionContext = {
  controlledExternalPublicationExecutionPermitGrantPolicy: permitPolicy,
  controlledExternalPublicationExecutionAcceptancePolicy: acceptancePolicy,
  ...handoffContext,
};
const startAuthorizationContext = {
  controlledExternalPublicationExecutionPermitConsumptionPolicy: permitConsumptionPolicy,
  controlledExternalPublicationExecutionPermitGrantPolicy: permitPolicy,
  controlledExternalPublicationExecutionAcceptancePolicy: acceptancePolicy,
  ...handoffContext,
};

const inspections = [
  inspectControlledExternalPublicationExecutionHandoffPolicy(handoffPolicy, upstreamContext),
  inspectControlledExternalPublicationExecutionHandoffMemory(handoffMemory, { policy: handoffPolicy }),
  inspectControlledExternalPublicationExecutionAcceptancePolicy(acceptancePolicy, handoffContext),
  inspectControlledExternalPublicationExecutionAcceptanceMemory(acceptanceMemory, { policy: acceptancePolicy }),
  inspectControlledExternalPublicationExecutionPermitGrantPolicy(permitPolicy, permitContext),
  inspectControlledExternalPublicationExecutionPermitMemory(permitMemory, { policy: permitPolicy }),
  inspectControlledExternalPublicationExecutionPermitConsumptionPolicy(permitConsumptionPolicy, permitConsumptionContext),
  inspectControlledExternalPublicationExecutionPermitConsumptionMemory(permitConsumptionMemory, { policy: permitConsumptionPolicy }),
  inspectControlledProofExecutionStartAuthorizationPolicy(startAuthorizationPolicy, startAuthorizationContext),
  inspectControlledProofExecutionStartAuthorizationMemory(startAuthorizationMemory, { policy: startAuthorizationPolicy }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) throw new Error(`controlled_proof_execution_start_authorization_context_invalid:${failed.reason}`);

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-start-authorization-readiness.v1",
  phase: 227,
  compositionId: startAuthorizationPolicy.compositionId,
  executionHandoffPolicyHash: handoffPolicy.policyHash,
  executionHandoffMemoryHash: handoffMemory.memoryHash,
  executionAcceptancePolicyHash: acceptancePolicy.policyHash,
  executionAcceptanceMemoryHash: acceptanceMemory.memoryHash,
  executionPermitGrantPolicyHash: permitPolicy.policyHash,
  executionPermitMemoryHash: permitMemory.memoryHash,
  executionPermitConsumptionPolicyHash: permitConsumptionPolicy.policyHash,
  executionPermitConsumptionMemoryHash: permitConsumptionMemory.memoryHash,
  controlledProofExecutionStartAuthorizationPolicyHash: startAuthorizationPolicy.policyHash,
  controlledProofExecutionStartAuthorizationMemoryHash: startAuthorizationMemory.memoryHash,
  trustedStartAuthorizersConfigured: startAuthorizationPolicy.trustedStartAuthorizers.length,
  recordedStartAuthorizations: startAuthorizationMemory.summary.recordedStartAuthorizations,
  authorizedConsumptions: startAuthorizationMemory.summary.authorizedConsumptions,
  distinctAuthorizations: startAuthorizationMemory.summary.distinctAuthorizations,
  readiness: "awaiting_recorded_permit_consumption_and_target_external_executor",
  controlledProofExecutionStartAuthorizationAllowed:
    startAuthorizationPolicy.controlledProofExecutionStartAuthorizationAllowed,
  controlledProofExecutionStartAuthorized: false,
  controlledProofExecutionStartAllowed: false,
  controlledProofExecutionStarted: false,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
