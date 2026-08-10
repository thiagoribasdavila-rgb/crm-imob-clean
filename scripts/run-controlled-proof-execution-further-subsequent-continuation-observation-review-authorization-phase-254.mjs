import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const reviewPolicy = readJson("config/controlled-proof-execution-further-subsequent-continuation-observation-review-policy.json");
const reviewMemory = readJson("config/controlled-proof-execution-further-subsequent-continuation-observation-review-memory.json");
const authorizationPolicy = readJson("config/controlled-proof-execution-further-subsequent-continuation-observation-review-authorization-policy.json");
const authorizationMemory = readJson("config/controlled-proof-execution-further-subsequent-continuation-observation-review-authorization-memory.json");

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-further-subsequent-continuation-observation-review-authorization-readiness.v1",
  phase: 254,
  compositionId: authorizationPolicy.compositionId,
  controlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicyHash: reviewPolicy.policyHash,
  controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemoryHash: reviewMemory.memoryHash,
  controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicyHash: authorizationPolicy.policyHash,
  controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemoryHash: authorizationMemory.memoryHash,
  trustedReviewAuthorizersConfigured: authorizationPolicy.trustedReviewAuthorizers.length,
  recordedReviews: reviewMemory.summary.recordedReviews,
  recordedReviewAuthorizations: authorizationMemory.summary.recordedReviewAuthorizations,
  acceptedReviewsAuthorized: authorizationMemory.summary.acceptedReviewsAuthorized,
  readiness: "awaiting_accepted_signed_recorded_review_and_trusted_independent_authorizer",
  followingSubsequentContinuationAuthorizationAllowed: authorizationPolicy.followingSubsequentContinuationAuthorizationAllowed,
  followingSubsequentContinuationAuthorized: authorizationMemory.summary.followingSubsequentContinuationAuthorized,
  followingSubsequentContinuationExecuted: authorizationMemory.summary.followingSubsequentContinuationExecuted,
  publicationExecuted: authorizationMemory.summary.publicationExecuted,
  externalPublicationExecuted: authorizationMemory.summary.externalPublicationExecuted,
  packageGenerated: authorizationMemory.summary.packageGenerated,
  buildExecuted: authorizationMemory.summary.buildExecuted,
  deployExecuted: authorizationMemory.summary.deployExecuted,
  releasePromoted: authorizationMemory.summary.releasePromoted,
}, null, 2));
