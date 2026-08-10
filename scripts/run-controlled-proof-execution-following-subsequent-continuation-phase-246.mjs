import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const consumptionPolicy = readJson("config/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption-policy.json");
const consumptionMemory = readJson("config/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption-memory.json");
const continuationPolicy = readJson("config/controlled-proof-execution-following-subsequent-continuation-policy.json");
const continuationMemory = readJson("config/controlled-proof-execution-following-subsequent-continuation-memory.json");

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-following-subsequent-continuation-readiness.v1",
  phase: 246,
  compositionId: continuationPolicy.compositionId,
  controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicyHash: consumptionPolicy.policyHash,
  controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemoryHash: consumptionMemory.memoryHash,
  controlledProofExecutionFollowingSubsequentContinuationPolicyHash: continuationPolicy.policyHash,
  controlledProofExecutionFollowingSubsequentContinuationMemoryHash: continuationMemory.memoryHash,
  trustedFollowingSubsequentContinuationExecutorsConfigured: continuationPolicy.trustedFollowingSubsequentContinuationExecutors.length,
  recordedAuthorizationConsumptions: consumptionMemory.summary.recordedConsumptions,
  recordedFollowingSubsequentContinuations: continuationMemory.summary.recordedFollowingSubsequentContinuations,
  consumedAuthorizationConsumptions: continuationMemory.summary.consumedAuthorizationConsumptions,
  readiness: "awaiting_recorded_signed_authorization_consumption_and_trusted_independent_next_subsequent_continuation_executor",
  nextSubsequentContinuationAllowed: continuationPolicy.nextSubsequentContinuationAllowed,
  subsequentContinuationAuthorizationConsumed: consumptionMemory.summary.nextSubsequentContinuationAuthorizationConsumed,
  nextSubsequentContinuationAuthorizationConsumed: continuationMemory.summary.nextSubsequentContinuationAuthorizationConsumed,
  nextSubsequentContinuationExecuted: continuationMemory.summary.nextSubsequentContinuationExecuted,
  nextSubsequentContinuationObserved: continuationMemory.summary.nextSubsequentContinuationObserved,
  publicationExecuted: continuationMemory.summary.publicationExecuted,
  externalPublicationExecuted: continuationMemory.summary.externalPublicationExecuted,
  packageGenerated: continuationMemory.summary.packageGenerated,
  buildExecuted: continuationMemory.summary.buildExecuted,
  deployExecuted: continuationMemory.summary.deployExecuted,
  releasePromoted: continuationMemory.summary.releasePromoted,
}, null, 2));
