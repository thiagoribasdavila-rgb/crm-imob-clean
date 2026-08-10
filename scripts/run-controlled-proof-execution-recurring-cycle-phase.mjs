import { readFileSync } from "node:fs";
import { CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES } from "../lib/release/controlled-proof-execution-recurring-cycle.mjs";

const phase = Number(process.argv[2]);
if (!Number.isInteger(phase) || phase < 255 || phase > 349) throw new Error("recurring_cycle_phase_invalid");
const index = (phase - 255) % CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES.length;
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const policy = readJson("config/controlled-proof-execution-recurring-cycle-policy.json");
const memory = readJson("config/controlled-proof-execution-recurring-cycle-memory.json");

console.log(JSON.stringify({
  schema: "atlas.controlled-proof-execution-recurring-cycle-readiness.v1",
  phase,
  compositionId: policy.compositionId,
  gateStage: CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES[index],
  policyHash: policy.policyHash,
  memoryHash: memory.memoryHash,
  trustedActorsConfigured: policy.trustedActors.length,
  recordedEntries: memory.summary.recordedEntries,
  canonicalNextStage: memory.summary.nextStage,
  readiness: `awaiting_signed_${CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES[index].replaceAll("-", "_")}_evidence`,
  runtimeEvidenceRecorded: false,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false
}, null, 2));
