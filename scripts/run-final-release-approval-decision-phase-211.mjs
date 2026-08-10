import { readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectFinalReleaseApprovalPolicy } from "../lib/release/final-release-approval-decision.mjs";

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
const approvalPolicy = readJson("config/final-release-approval-policy.json");
const inspection = inspectFinalReleaseApprovalPolicy(approvalPolicy, {
  packetContext,
  decisionPolicy,
  authorizationPolicy,
  executionPolicy,
  adjudicationPolicy,
});
if (!inspection.ok) throw new Error(`final_release_approval_policy_invalid:${inspection.reason}`);

const readiness = approvalPolicy.trustedApprovers.length === 0
  ? "awaiting_trusted_final_release_approver_configuration"
  : "awaiting_verified_gate_result_adjudication";

console.log(JSON.stringify({
  schema: "atlas.final-release-approval-readiness.v1",
  phase: 211,
  compositionId: decision.compositionId,
  approvalPolicyHash: approvalPolicy.policyHash,
  trustedApproversConfigured: approvalPolicy.trustedApprovers.length,
  readiness,
  verifiedAdjudicationRegisterAvailable: false,
  finalDecisionAvailable: false,
  finalDecisionOutcome: null,
  releaseApproved: false,
  releaseMemoryUpdated: false,
  packageGenerated: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
