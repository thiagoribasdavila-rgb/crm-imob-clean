import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const observationPolicy = readJson("config/controlled-proof-execution-following-subsequent-continuation-observation-policy.json");
const observationMemory = readJson("config/controlled-proof-execution-following-subsequent-continuation-observation-memory.json");
const reviewPolicy = readJson("config/controlled-proof-execution-following-subsequent-continuation-observation-review-policy.json");
const reviewMemory = readJson("config/controlled-proof-execution-following-subsequent-continuation-observation-review-memory.json");

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-following-subsequent-continuation-observation-review-readiness.v1",
  phase: 248,
  compositionId: reviewPolicy.compositionId,
  controlledProofExecutionFollowingSubsequentContinuationObservationPolicyHash: observationPolicy.policyHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationMemoryHash: observationMemory.memoryHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicyHash: reviewPolicy.policyHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemoryHash: reviewMemory.memoryHash,
  trustedFollowingSubsequentContinuationObservationReviewersConfigured: reviewPolicy.trustedFollowingSubsequentContinuationObservationReviewers.length,
  recordedFollowingSubsequentContinuationObservations: observationMemory.summary.recordedSubsequentContinuationObservations,
  recordedFollowingSubsequentContinuationObservationReviews: reviewMemory.summary.recordedReviews,
  reviewedFollowingSubsequentContinuationObservations: reviewMemory.summary.reviewedObservations,
  acceptedFollowingSubsequentContinuationObservations: reviewMemory.summary.acceptedObservations,
  rejectedFollowingSubsequentContinuationObservations: reviewMemory.summary.rejectedObservations,
  readiness: "awaiting_valid_recorded_next_subsequent_continuation_observation_and_trusted_independent_reviewer",
  nextSubsequentContinuationObservationReviewAllowed: reviewPolicy.nextSubsequentContinuationObservationReviewAllowed,
  nextSubsequentContinuationObservationAccepted: reviewMemory.summary.nextSubsequentContinuationObservationAccepted,
  nextSubsequentContinuationObservationReviewAuthorizationAllowed: reviewMemory.summary.nextSubsequentContinuationObservationReviewAuthorizationAllowed,
  publicationExecuted: reviewMemory.summary.publicationExecuted,
  externalPublicationExecuted: reviewMemory.summary.externalPublicationExecuted,
  packageGenerated: reviewMemory.summary.packageGenerated,
  buildExecuted: reviewMemory.summary.buildExecuted,
  deployExecuted: reviewMemory.summary.deployExecuted,
  releasePromoted: reviewMemory.summary.releasePromoted,
}, null, 2));
