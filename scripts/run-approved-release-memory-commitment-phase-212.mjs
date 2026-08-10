import { readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import {
  inspectApprovedReleaseMemory,
  inspectApprovedReleaseMemoryPolicy,
} from "../lib/release/approved-release-memory-commitment.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const completionMemory = readJson("config/release-module-completion-memory.json");
const graph = buildModuleDependencyGraph({ completionMemory, configuration: readJson("config/release-module-dependency-graph.json") });
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
const policy = readJson("config/approved-release-memory-policy.json");
const memory = readJson("config/approved-release-memory.json");
const approvalContext = { packetContext, decisionPolicy, authorizationPolicy, executionPolicy, adjudicationPolicy };

const policyInspection = inspectApprovedReleaseMemoryPolicy(policy, { approvalPolicy, ...approvalContext });
if (!policyInspection.ok) throw new Error(`approved_release_memory_policy_invalid:${policyInspection.reason}`);
const memoryInspection = inspectApprovedReleaseMemory(memory, { policy });
if (!memoryInspection.ok) throw new Error(`approved_release_memory_invalid:${memoryInspection.reason}`);

console.log(JSON.stringify({
  schema: "atlas.approved-release-memory-readiness.v1",
  phase: 212,
  compositionId: decision.compositionId,
  approvalPolicyHash: approvalPolicy.policyHash,
  memoryPolicyHash: policy.policyHash,
  memoryHash: memory.memoryHash,
  trustedApproversConfigured: approvalPolicy.trustedApprovers.length,
  readiness: "awaiting_verified_approved_final_release_decision",
  verifiedFinalApprovalDecisionAvailable: false,
  approvedReleaseCommitted: false,
  committedApprovals: memory.summary.committedApprovals,
  packageGenerated: false,
  deployExecuted: false,
  releasePromoted: false
}, null, 2));
