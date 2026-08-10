import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const reviewPolicy = readJson("config/controlled-proof-execution-following-subsequent-continuation-observation-review-policy.json");
const reviewMemory = readJson("config/controlled-proof-execution-following-subsequent-continuation-observation-review-memory.json");
const authorizationPolicy = readJson("config/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-policy.json");
const authorizationMemory = readJson("config/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-memory.json");
const consumptionPolicy = readJson("config/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption-policy.json");
const consumptionMemory = readJson("config/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption-memory.json");

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption-readiness.v1",
  phase: 250,
  compositionId: consumptionPolicy.compositionId,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicyHash: reviewPolicy.policyHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemoryHash: reviewMemory.memoryHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicyHash: authorizationPolicy.policyHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemoryHash: authorizationMemory.memoryHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicyHash: consumptionPolicy.policyHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemoryHash: consumptionMemory.memoryHash,
  trustedReviewAuthorizationConsumersConfigured: consumptionPolicy.trustedReviewAuthorizationConsumers.length,
  recordedReviews: reviewMemory.summary.recordedReviews,
  recordedReviewAuthorizations: authorizationMemory.summary.recordedReviewAuthorizations,
  recordedAuthorizationConsumptions: consumptionMemory.summary.recordedConsumptions,
  consumedSingleUseAuthorizations: consumptionMemory.summary.consumedSingleUseAuthorizations,
  readiness: "awaiting_recorded_unexpired_single_use_subsequent_continuation_observation_review_authorization_and_trusted_independent_consumer",
  authorizationConsumptionAllowed: consumptionPolicy.authorizationConsumptionAllowed,
  reviewAuthorizationConsumed: consumptionMemory.summary.followingSubsequentContinuationAuthorizationConsumed,
  subsequentContinuationAuthorizationConsumed: consumptionMemory.summary.followingSubsequentContinuationAuthorizationConsumed,
  subsequentContinuationExecuted: consumptionMemory.summary.followingSubsequentContinuationExecuted,
  publicationExecuted: consumptionMemory.summary.publicationExecuted,
  externalPublicationExecuted: consumptionMemory.summary.externalPublicationExecuted,
  packageGenerated: consumptionMemory.summary.packageGenerated,
  buildExecuted: consumptionMemory.summary.buildExecuted,
  deployExecuted: consumptionMemory.summary.deployExecuted,
  releasePromoted: consumptionMemory.summary.releasePromoted,
}, null, 2));
