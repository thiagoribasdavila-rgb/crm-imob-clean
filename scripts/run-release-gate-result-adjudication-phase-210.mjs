import { readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectReleaseGateResultAdjudicationPolicy } from "../lib/release/release-gate-result-adjudication.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const memory = readJson("config/release-module-completion-memory.json");
const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration: readJson("config/release-module-dependency-graph.json") });
const decision = evaluateReleaseCompositionEligibility({ graph, plan: readJson("config/release-composition-plan.json") });
const packetContext = {
  decision,
  plan: readJson("config/release-gate-evidence-plan.json"),
  intakePolicy: readJson("config/release-evidence-intake-policy.json"),
  provenancePolicy: readJson("config/release-evidence-provenance-policy.json"),
  admissionPolicy: readJson("config/release-evidence-admission-policy.json"),
  evaluationPolicy: readJson("config/admitted-evidence-matrix-evaluation-policy.json"),
  packetPolicy: readJson("config/release-gate-review-packet-policy.json"),
};
const decisionPolicy = readJson("config/human-release-gate-decision-policy.json");
const authorizationPolicy = readJson("config/release-gate-execution-authorization-policy.json");
const executionPolicy = readJson("config/authorized-release-gate-execution-policy.json");
const adjudicationPolicy = readJson("config/release-gate-result-adjudication-policy.json");
const inspection = inspectReleaseGateResultAdjudicationPolicy(adjudicationPolicy, { packetContext, decisionPolicy, authorizationPolicy, executionPolicy });
if (!inspection.ok) throw new Error(`release_gate_result_adjudication_policy_invalid:${inspection.reason}`);

const readiness = adjudicationPolicy.trustedAdjudicators.length === 0
  ? "awaiting_trusted_gate_adjudicator_configuration"
  : "awaiting_verified_gate_execution_register";

console.log(JSON.stringify({
  schema: "atlas.release-gate-result-adjudication-readiness.v1",
  phase: 210,
  compositionId: decision.compositionId,
  adjudicationPolicyHash: adjudicationPolicy.policyHash,
  trustedAdjudicatorsConfigured: adjudicationPolicy.trustedAdjudicators.length,
  readiness,
  verifiedExecutionRegisterAvailable: false,
  adjudicationRegisterAvailable: false,
  acceptedGateCount: 0,
  rejectedGateCount: 0,
  resultSetAdjudicated: false,
  gateResultsAccepted: false,
  releaseApproved: false,
  releaseMemoryUpdated: false,
  packageGenerated: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
