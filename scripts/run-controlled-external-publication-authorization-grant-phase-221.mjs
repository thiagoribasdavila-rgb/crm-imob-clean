import { readFileSync } from "node:fs";
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
const controlledExternalPublicationReviewPolicy = readJson("config/controlled-external-publication-authorization-review-policy.json");
const controlledExternalPublicationReviewMemory = readJson("config/controlled-external-publication-authorization-review-memory.json");
const authorizationGrantPolicy = readJson("config/controlled-external-publication-authorization-grant-policy.json");
const authorizationGrantMemory = readJson("config/controlled-external-publication-authorization-grant-memory.json");

const context = {
  executionPolicy,
  executionAuthorizationPolicy,
  publicationPolicy,
  evidencePolicy,
  assemblyPolicy,
  packageAuthorizationPolicy,
};
const inspections = [
  inspectControlledExternalPublicationAuthorizationReviewPolicy(controlledExternalPublicationReviewPolicy, {
    publicationEvidenceAdjudicationPolicy,
    ...context,
  }),
  inspectControlledExternalPublicationAuthorizationReviewMemory(controlledExternalPublicationReviewMemory, {
    policy: controlledExternalPublicationReviewPolicy,
  }),
  inspectControlledExternalPublicationAuthorizationGrantPolicy(authorizationGrantPolicy, {
    controlledExternalPublicationReviewPolicy,
    publicationEvidenceAdjudicationPolicy,
    ...context,
  }),
  inspectControlledExternalPublicationAuthorizationGrantMemory(authorizationGrantMemory, {
    policy: authorizationGrantPolicy,
  }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) throw new Error(`controlled_external_publication_authorization_grant_context_invalid:${failed.reason}`);

console.log(JSON.stringify({
  schema: "atlas.controlled-external-publication-authorization-grant-readiness.v1",
  phase: 221,
  compositionId: authorizationGrantPolicy.compositionId,
  authorizationReviewPolicyHash: controlledExternalPublicationReviewPolicy.policyHash,
  authorizationReviewMemoryHash: controlledExternalPublicationReviewMemory.memoryHash,
  authorizationGrantPolicyHash: authorizationGrantPolicy.policyHash,
  authorizationGrantMemoryHash: authorizationGrantMemory.memoryHash,
  trustedAuthorizationGrantorsConfigured: authorizationGrantPolicy.trustedGrantors.length,
  recordedAuthorizationReviews: controlledExternalPublicationReviewMemory.summary.recordedReviews,
  eligibleProofs: controlledExternalPublicationReviewMemory.summary.eligibleProofs,
  ineligibleProofs: controlledExternalPublicationReviewMemory.summary.ineligibleProofs,
  recordedAuthorizationGrants: authorizationGrantMemory.summary.recordedGrants,
  authorizedGrants: authorizationGrantMemory.summary.authorizedGrants,
  deniedGrants: authorizationGrantMemory.summary.deniedGrants,
  unconsumedSingleUseGrants: authorizationGrantMemory.summary.unconsumedSingleUseGrants,
  readiness: "awaiting_eligible_recorded_review_and_independent_authorization_grantor",
  externalPublicationAuthorized: false,
  authorizationConsumed: false,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
