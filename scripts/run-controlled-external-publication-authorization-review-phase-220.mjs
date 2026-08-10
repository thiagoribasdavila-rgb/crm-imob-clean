import { readFileSync } from "node:fs";
import {
  inspectControlledExternalPublicationAuthorizationReviewMemory,
  inspectControlledExternalPublicationAuthorizationReviewPolicy,
} from "../lib/release/controlled-external-publication-authorization-review.mjs";
import {
  inspectPublicationExecutionEvidenceAdjudicationMemory,
  inspectPublicationExecutionEvidenceAdjudicationPolicy,
} from "../lib/release/publication-execution-evidence-adjudication.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const executionPolicy = readJson("config/authorized-publication-execution-policy.json");
const executionAuthorizationPolicy = readJson("config/authorized-publication-execution-authorization-policy.json");
const publicationPolicy = readJson("config/authorized-package-publication-decision-policy.json");
const evidencePolicy = readJson("config/authorized-package-evidence-commitment-policy.json");
const assemblyPolicy = readJson("config/authorized-release-package-assembly-policy.json");
const packageAuthorizationPolicy = readJson("config/approved-release-package-authorization-policy.json");
const evidenceAdjudicationPolicy = readJson("config/publication-execution-evidence-adjudication-policy.json");
const evidenceAdjudicationMemory = readJson("config/publication-execution-evidence-adjudication-memory.json");
const authorizationReviewPolicy = readJson("config/controlled-external-publication-authorization-review-policy.json");
const authorizationReviewMemory = readJson("config/controlled-external-publication-authorization-review-memory.json");

const context = {
  executionPolicy,
  executionAuthorizationPolicy,
  publicationPolicy,
  evidencePolicy,
  assemblyPolicy,
  packageAuthorizationPolicy,
};
const inspections = [
  inspectPublicationExecutionEvidenceAdjudicationPolicy(evidenceAdjudicationPolicy, context),
  inspectPublicationExecutionEvidenceAdjudicationMemory(evidenceAdjudicationMemory, { policy: evidenceAdjudicationPolicy }),
  inspectControlledExternalPublicationAuthorizationReviewPolicy(authorizationReviewPolicy, {
    publicationEvidenceAdjudicationPolicy: evidenceAdjudicationPolicy,
    ...context,
  }),
  inspectControlledExternalPublicationAuthorizationReviewMemory(authorizationReviewMemory, { policy: authorizationReviewPolicy }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) throw new Error(`controlled_external_publication_authorization_review_context_invalid:${failed.reason}`);

console.log(JSON.stringify({
  schema: "atlas.controlled-external-publication-authorization-review-readiness.v1",
  phase: 220,
  compositionId: authorizationReviewPolicy.compositionId,
  evidenceAdjudicationPolicyHash: evidenceAdjudicationPolicy.policyHash,
  evidenceAdjudicationMemoryHash: evidenceAdjudicationMemory.memoryHash,
  authorizationReviewPolicyHash: authorizationReviewPolicy.policyHash,
  authorizationReviewMemoryHash: authorizationReviewMemory.memoryHash,
  trustedAuthorizationReviewersConfigured: authorizationReviewPolicy.trustedReviewers.length,
  recordedAdjudications: evidenceAdjudicationMemory.summary.recordedDecisions,
  acceptedEvidence: evidenceAdjudicationMemory.summary.acceptedEvidence,
  rejectedEvidence: evidenceAdjudicationMemory.summary.rejectedEvidence,
  recordedAuthorizationReviews: authorizationReviewMemory.summary.recordedReviews,
  eligibleProofs: authorizationReviewMemory.summary.eligibleProofs,
  ineligibleProofs: authorizationReviewMemory.summary.ineligibleProofs,
  readiness: "awaiting_accepted_recorded_evidence_and_independent_authorization_reviewer",
  authorizationEligibilityReviewed: false,
  eligibleForAuthorizationGrant: false,
  externalPublicationAuthorized: false,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
