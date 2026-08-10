import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const continuationPolicy = readJson("config/controlled-proof-execution-following-subsequent-continuation-policy.json");
const continuationMemory = readJson("config/controlled-proof-execution-following-subsequent-continuation-memory.json");
const observationPolicy = readJson("config/controlled-proof-execution-following-subsequent-continuation-observation-policy.json");
const observationMemory = readJson("config/controlled-proof-execution-following-subsequent-continuation-observation-memory.json");

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-following-subsequent-continuation-observation-readiness.v1",
  phase: 247,
  compositionId: observationPolicy.compositionId,
  controlledProofExecutionFollowingSubsequentContinuationPolicyHash: continuationPolicy.policyHash,
  controlledProofExecutionFollowingSubsequentContinuationMemoryHash: continuationMemory.memoryHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationPolicyHash: observationPolicy.policyHash,
  controlledProofExecutionFollowingSubsequentContinuationObservationMemoryHash: observationMemory.memoryHash,
  trustedFollowingSubsequentContinuationObserversConfigured: observationPolicy.trustedFollowingSubsequentContinuationObservers.length,
  recordedFollowingSubsequentContinuations: continuationMemory.summary.recordedFollowingSubsequentContinuations,
  recordedFollowingSubsequentContinuationObservations: observationMemory.summary.recordedSubsequentContinuationObservations,
  observedFollowingSubsequentContinuations: observationMemory.summary.observedSubsequentContinuations,
  readiness: "awaiting_valid_recorded_next_subsequent_continuation_and_trusted_independent_observer",
  nextSubsequentContinuationObservationAllowed: observationPolicy.nextSubsequentContinuationObservationAllowed,
  nextSubsequentContinuationExecuted: observationMemory.summary.nextSubsequentContinuationExecuted,
  nextSubsequentContinuationObserved: observationMemory.summary.nextSubsequentContinuationObserved,
  publicationExecuted: observationMemory.summary.publicationExecuted,
  externalPublicationExecuted: observationMemory.summary.externalPublicationExecuted,
  packageGenerated: observationMemory.summary.packageGenerated,
  buildExecuted: observationMemory.summary.buildExecuted,
  deployExecuted: observationMemory.summary.deployExecuted,
  releasePromoted: observationMemory.summary.releasePromoted,
}, null, 2));
