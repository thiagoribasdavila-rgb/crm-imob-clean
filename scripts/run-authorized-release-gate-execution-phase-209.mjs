import { readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectAuthorizedReleaseGateExecutionPolicy } from "../lib/release/authorized-release-gate-execution.mjs";

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
const inspection = inspectAuthorizedReleaseGateExecutionPolicy(executionPolicy, { packetContext, decisionPolicy, authorizationPolicy });
if (!inspection.ok) throw new Error(`authorized_release_gate_execution_policy_invalid:${inspection.reason}`);

const readiness = executionPolicy.trustedExecutors.length === 0
  ? "awaiting_trusted_gate_executor_configuration"
  : executionPolicy.trustedGateHandlers.length === 0
    ? "awaiting_trusted_gate_handler_catalog"
    : "awaiting_valid_single_use_execution_authorization";

console.log(JSON.stringify({
  schema: "atlas.authorized-release-gate-execution-readiness.v1",
  phase: 209,
  compositionId: decision.compositionId,
  executionPolicyHash: executionPolicy.policyHash,
  trustedGateExecutorsConfigured: executionPolicy.trustedExecutors.length,
  trustedGateHandlersConfigured: executionPolicy.trustedGateHandlers.length,
  readiness,
  humanDecisionRegisterAvailable: false,
  executionAuthorizationAvailable: false,
  authorizationConsumed: false,
  executionRegisterAvailable: false,
  executedGateCount: 0,
  failedGateCount: 0,
  gatesExecuted: false,
  releaseApproved: false,
  releaseMemoryUpdated: false,
  packageGenerated: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
