import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const consumptionPolicy = readJson("config/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption-policy.json");
const consumptionMemory = readJson("config/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption-memory.json");
const continuationPolicy = readJson("config/controlled-proof-execution-further-subsequent-continuation-policy.json");
const continuationMemory = readJson("config/controlled-proof-execution-further-subsequent-continuation-memory.json");

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-further-subsequent-continuation-readiness.v1",
  phase: 251,
  compositionId: continuationPolicy.compositionId,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicyHash: consumptionPolicy.policyHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemoryHash: consumptionMemory.memoryHash,
  controlledProofExecutionFurtherSubsequentContinuationPolicyHash: continuationPolicy.policyHash,
  controlledProofExecutionFurtherSubsequentContinuationMemoryHash: continuationMemory.memoryHash,
  trustedFurtherSubsequentContinuationExecutorsConfigured: continuationPolicy.trustedFurtherSubsequentContinuationExecutors.length,
  recordedAuthorizationConsumptions: consumptionMemory.summary.recordedConsumptions,
  recordedFurtherSubsequentContinuations: continuationMemory.summary.recordedFurtherSubsequentContinuations,
  consumedAuthorizationConsumptions: continuationMemory.summary.consumedAuthorizationConsumptions,
  readiness: "awaiting_recorded_signed_authorization_consumption_and_trusted_independent_next_subsequent_continuation_executor",
  followingSubsequentContinuationAllowed: continuationPolicy.followingSubsequentContinuationAllowed,
  subsequentContinuationAuthorizationConsumed: consumptionMemory.summary.followingSubsequentContinuationAuthorizationConsumed,
  followingSubsequentContinuationAuthorizationConsumed: continuationMemory.summary.followingSubsequentContinuationAuthorizationConsumed,
  followingSubsequentContinuationExecuted: continuationMemory.summary.followingSubsequentContinuationExecuted,
  followingSubsequentContinuationObserved: continuationMemory.summary.followingSubsequentContinuationObserved,
  publicationExecuted: continuationMemory.summary.publicationExecuted,
  externalPublicationExecuted: continuationMemory.summary.externalPublicationExecuted,
  packageGenerated: continuationMemory.summary.packageGenerated,
  buildExecuted: continuationMemory.summary.buildExecuted,
  deployExecuted: continuationMemory.summary.deployExecuted,
  releasePromoted: continuationMemory.summary.releasePromoted,
}, null, 2));
