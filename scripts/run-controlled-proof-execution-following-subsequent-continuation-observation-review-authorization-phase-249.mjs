import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const reviewPolicy = readJson("config/controlled-proof-execution-following-subsequent-continuation-observation-review-policy.json");
const reviewMemory = readJson("config/controlled-proof-execution-following-subsequent-continuation-observation-review-memory.json");
const authorizationPolicy = readJson("config/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-policy.json");
const authorizationMemory = readJson("config/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-memory.json");

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-readiness.v1",
  phase: 249,
  compositionId: authorizationPolicy.compositionId,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicyHash: reviewPolicy.policyHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemoryHash: reviewMemory.memoryHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicyHash: authorizationPolicy.policyHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemoryHash: authorizationMemory.memoryHash,
  trustedReviewAuthorizersConfigured: authorizationPolicy.trustedReviewAuthorizers.length,
  recordedReviews: reviewMemory.summary.recordedReviews,
  recordedReviewAuthorizations: authorizationMemory.summary.recordedReviewAuthorizations,
  acceptedReviewsAuthorized: authorizationMemory.summary.acceptedReviewsAuthorized,
  readiness: "awaiting_accepted_signed_recorded_review_and_trusted_independent_authorizer",
  nextSubsequentContinuationAuthorizationAllowed: authorizationPolicy.nextSubsequentContinuationAuthorizationAllowed,
  nextSubsequentContinuationAuthorized: authorizationMemory.summary.nextSubsequentContinuationAuthorized,
  nextSubsequentContinuationExecuted: authorizationMemory.summary.nextSubsequentContinuationExecuted,
  publicationExecuted: authorizationMemory.summary.publicationExecuted,
  externalPublicationExecuted: authorizationMemory.summary.externalPublicationExecuted,
  packageGenerated: authorizationMemory.summary.packageGenerated,
  buildExecuted: authorizationMemory.summary.buildExecuted,
  deployExecuted: authorizationMemory.summary.deployExecuted,
  releasePromoted: authorizationMemory.summary.releasePromoted,
}, null, 2));
