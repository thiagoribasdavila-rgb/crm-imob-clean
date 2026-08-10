import { readFileSync } from "node:fs";
import {
  inspectControlledExternalPublicationAuthorizationConsumptionMemory,
  inspectControlledExternalPublicationAuthorizationConsumptionPolicy,
} from "../lib/release/controlled-external-publication-authorization-consumption.mjs";
import {
  inspectControlledExternalPublicationAuthorizationGrantMemory,
  inspectControlledExternalPublicationAuthorizationGrantPolicy,
} from "../lib/release/controlled-external-publication-authorization-grant.mjs";
import {
  inspectControlledExternalPublicationAuthorizationReviewMemory,
  inspectControlledExternalPublicationAuthorizationReviewPolicy,
} from "../lib/release/controlled-external-publication-authorization-review.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const executionPolicy = readJson("config/authorized-publication-execution-policy.json");
const executionAuthorizationPolicy = readJson("config/authorized-publication-execution-authorization-policy.json");
const publicationPolicy = readJson("config/authorized-package-publication-decision-policy.json");
const evidencePolicy = readJson("config/authorized-package-evidence-commitment-policy.json");
const assemblyPolicy = readJson("config/authorized-release-package-assembly-policy.json");
const packageAuthorizationPolicy = readJson("config/approved-release-package-authorization-policy.json");
const publicationEvidenceAdjudicationPolicy = readJson("config/publication-execution-evidence-adjudication-policy.json");
const reviewPolicy = readJson("config/controlled-external-publication-authorization-review-policy.json");
const reviewMemory = readJson("config/controlled-external-publication-authorization-review-memory.json");
const grantPolicy = readJson("config/controlled-external-publication-authorization-grant-policy.json");
const grantMemory = readJson("config/controlled-external-publication-authorization-grant-memory.json");
const consumptionPolicy = readJson("config/controlled-external-publication-authorization-consumption-policy.json");
const consumptionMemory = readJson("config/controlled-external-publication-authorization-consumption-memory.json");

const context = {
  executionPolicy,
  executionAuthorizationPolicy,
  publicationPolicy,
  evidencePolicy,
  assemblyPolicy,
  packageAuthorizationPolicy,
};
const grantContext = {
  controlledExternalPublicationReviewPolicy: reviewPolicy,
  publicationEvidenceAdjudicationPolicy,
  ...context,
};
const inspections = [
  inspectControlledExternalPublicationAuthorizationReviewPolicy(reviewPolicy, {
    publicationEvidenceAdjudicationPolicy,
    ...context,
  }),
  inspectControlledExternalPublicationAuthorizationReviewMemory(reviewMemory, { policy: reviewPolicy }),
  inspectControlledExternalPublicationAuthorizationGrantPolicy(grantPolicy, grantContext),
  inspectControlledExternalPublicationAuthorizationGrantMemory(grantMemory, { policy: grantPolicy }),
  inspectControlledExternalPublicationAuthorizationConsumptionPolicy(consumptionPolicy, {
    controlledExternalPublicationAuthorizationGrantPolicy: grantPolicy,
    ...grantContext,
  }),
  inspectControlledExternalPublicationAuthorizationConsumptionMemory(consumptionMemory, { policy: consumptionPolicy }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) throw new Error(`controlled_external_publication_authorization_consumption_context_invalid:${failed.reason}`);

console.log(JSON.stringify({
  schema: "atlas.controlled-external-publication-authorization-consumption-readiness.v1",
  phase: 222,
  compositionId: consumptionPolicy.compositionId,
  authorizationReviewPolicyHash: reviewPolicy.policyHash,
  authorizationReviewMemoryHash: reviewMemory.memoryHash,
  authorizationGrantPolicyHash: grantPolicy.policyHash,
  authorizationGrantMemoryHash: grantMemory.memoryHash,
  authorizationConsumptionPolicyHash: consumptionPolicy.policyHash,
  authorizationConsumptionMemoryHash: consumptionMemory.memoryHash,
  trustedAuthorizationConsumersConfigured: consumptionPolicy.trustedConsumers.length,
  recordedAuthorizationGrants: grantMemory.summary.recordedGrants,
  authorizedGrants: grantMemory.summary.authorizedGrants,
  unconsumedSingleUseGrants: grantMemory.summary.unconsumedSingleUseGrants,
  recordedConsumptions: consumptionMemory.summary.recordedConsumptions,
  consumedSingleUseGrants: consumptionMemory.summary.consumedSingleUseGrants,
  readiness: "awaiting_authorized_recorded_unexpired_grant_and_independent_authorization_consumer",
  externalPublicationAuthorized: false,
  authorizationConsumed: false,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
