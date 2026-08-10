import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const observationPolicy = readJson("config/controlled-proof-execution-further-subsequent-continuation-observation-policy.json");
const observationMemory = readJson("config/controlled-proof-execution-further-subsequent-continuation-observation-memory.json");
const reviewPolicy = readJson("config/controlled-proof-execution-further-subsequent-continuation-observation-review-policy.json");
const reviewMemory = readJson("config/controlled-proof-execution-further-subsequent-continuation-observation-review-memory.json");

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-further-subsequent-continuation-observation-review-readiness.v1",
  phase: 253,
  compositionId: reviewPolicy.compositionId,
  controlledProofExecutionFurtherSubsequentContinuationObservationPolicyHash: observationPolicy.policyHash,
  controlledProofExecutionFurtherSubsequentContinuationObservationMemoryHash: observationMemory.memoryHash,
  controlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicyHash: reviewPolicy.policyHash,
  controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemoryHash: reviewMemory.memoryHash,
  trustedFurtherSubsequentContinuationObservationReviewersConfigured: reviewPolicy.trustedFurtherSubsequentContinuationObservationReviewers.length,
  recordedFurtherSubsequentContinuationObservations: observationMemory.summary.recordedSubsequentContinuationObservations,
  recordedFurtherSubsequentContinuationObservationReviews: reviewMemory.summary.recordedReviews,
  reviewedFurtherSubsequentContinuationObservations: reviewMemory.summary.reviewedObservations,
  acceptedFurtherSubsequentContinuationObservations: reviewMemory.summary.acceptedObservations,
  rejectedFurtherSubsequentContinuationObservations: reviewMemory.summary.rejectedObservations,
  readiness: "awaiting_valid_recorded_next_subsequent_continuation_observation_and_trusted_independent_reviewer",
  followingSubsequentContinuationObservationReviewAllowed: reviewPolicy.followingSubsequentContinuationObservationReviewAllowed,
  followingSubsequentContinuationObservationAccepted: reviewMemory.summary.followingSubsequentContinuationObservationAccepted,
  followingSubsequentContinuationObservationReviewAuthorizationAllowed: reviewMemory.summary.followingSubsequentContinuationObservationReviewAuthorizationAllowed,
  publicationExecuted: reviewMemory.summary.publicationExecuted,
  externalPublicationExecuted: reviewMemory.summary.externalPublicationExecuted,
  packageGenerated: reviewMemory.summary.packageGenerated,
  buildExecuted: reviewMemory.summary.buildExecuted,
  deployExecuted: reviewMemory.summary.deployExecuted,
  releasePromoted: reviewMemory.summary.releasePromoted,
}, null, 2));
