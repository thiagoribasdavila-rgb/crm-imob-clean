import { readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectReleaseEvidenceIntakePolicy } from "../lib/release/release-evidence-intake.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const graph = buildModuleDependencyGraph({
  completionMemory: readJson("config/release-module-completion-memory.json"),
  configuration: readJson("config/release-module-dependency-graph.json"),
});
const decision = evaluateReleaseCompositionEligibility({ graph, plan: readJson("config/release-composition-plan.json") });
const plan = readJson("config/release-gate-evidence-plan.json");
const policy = readJson("config/release-evidence-intake-policy.json");
const inspection = inspectReleaseEvidenceIntakePolicy(policy, { decision, plan });
if (!inspection.ok) throw new Error(`release_evidence_intake_policy_invalid:${inspection.reason}`);

const gates = plan.modules.flatMap((module) => module.gates);
const requiredEvidenceItems = gates.reduce((total, gate) => total + gate.requiredEvidence.length, 0);
console.log(JSON.stringify({
  schema: "atlas.release-evidence-intake-readiness.v1",
  phase: 202,
  compositionId: decision.compositionId,
  policyHash: policy.policyHash,
  modules: plan.modules.length,
  gates: gates.length,
  requiredEvidenceItems,
  acceptedChannels: policy.acceptedChannels,
  intakesReceived: 0,
  recordsReceived: 0,
  provenanceVerified: false,
  evidenceMatrixEvaluated: false,
  gatesExecuted: false,
  releaseMemoryUpdated: false,
  packageGenerated: false,
  deployExecuted: false,
}, null, 2));
