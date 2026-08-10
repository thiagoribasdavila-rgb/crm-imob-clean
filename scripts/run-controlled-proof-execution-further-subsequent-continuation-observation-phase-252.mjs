import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const continuationPolicy = readJson("config/controlled-proof-execution-further-subsequent-continuation-policy.json");
const continuationMemory = readJson("config/controlled-proof-execution-further-subsequent-continuation-memory.json");
const observationPolicy = readJson("config/controlled-proof-execution-further-subsequent-continuation-observation-policy.json");
const observationMemory = readJson("config/controlled-proof-execution-further-subsequent-continuation-observation-memory.json");

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-further-subsequent-continuation-observation-readiness.v1",
  phase: 252,
  compositionId: observationPolicy.compositionId,
  controlledProofExecutionFurtherSubsequentContinuationPolicyHash: continuationPolicy.policyHash,
  controlledProofExecutionFurtherSubsequentContinuationMemoryHash: continuationMemory.memoryHash,
  controlledProofExecutionFurtherSubsequentContinuationObservationPolicyHash: observationPolicy.policyHash,
  controlledProofExecutionFurtherSubsequentContinuationObservationMemoryHash: observationMemory.memoryHash,
  trustedFurtherSubsequentContinuationObserversConfigured: observationPolicy.trustedFurtherSubsequentContinuationObservers.length,
  recordedFurtherSubsequentContinuations: continuationMemory.summary.recordedFurtherSubsequentContinuations,
  recordedFurtherSubsequentContinuationObservations: observationMemory.summary.recordedSubsequentContinuationObservations,
  observedFurtherSubsequentContinuations: observationMemory.summary.observedSubsequentContinuations,
  readiness: "awaiting_valid_recorded_next_subsequent_continuation_and_trusted_independent_observer",
  followingSubsequentContinuationObservationAllowed: observationPolicy.followingSubsequentContinuationObservationAllowed,
  followingSubsequentContinuationExecuted: observationMemory.summary.followingSubsequentContinuationExecuted,
  followingSubsequentContinuationObserved: observationMemory.summary.followingSubsequentContinuationObserved,
  publicationExecuted: observationMemory.summary.publicationExecuted,
  externalPublicationExecuted: observationMemory.summary.externalPublicationExecuted,
  packageGenerated: observationMemory.summary.packageGenerated,
  buildExecuted: observationMemory.summary.buildExecuted,
  deployExecuted: observationMemory.summary.deployExecuted,
  releasePromoted: observationMemory.summary.releasePromoted,
}, null, 2));
