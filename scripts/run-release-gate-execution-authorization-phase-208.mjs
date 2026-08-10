import { readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectReleaseGateExecutionAuthorizationPolicy } from "../lib/release/release-gate-execution-authorization.mjs";

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
const inspection = inspectReleaseGateExecutionAuthorizationPolicy(authorizationPolicy, { packetContext, decisionPolicy });
if (!inspection.ok) throw new Error(`release_gate_execution_authorization_policy_invalid:${inspection.reason}`);

console.log(JSON.stringify({
  schema: "atlas.release-gate-execution-authorization-readiness.v1",
  phase: 208,
  compositionId: decision.compositionId,
  authorizationPolicyHash: authorizationPolicy.policyHash,
  trustedExecutionAuthorizersConfigured: authorizationPolicy.trustedAuthorizers.length,
  readiness: authorizationPolicy.trustedAuthorizers.length > 0
    ? "awaiting_complete_approved_human_decision_register"
    : "awaiting_trusted_execution_authorizer_configuration",
  humanDecisionRegisterAvailable: false,
  executionAuthorizationIssued: false,
  authorizedGateCount: 0,
  gatesExecuted: false,
  releaseApproved: false,
  releaseMemoryUpdated: false,
  packageGenerated: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
